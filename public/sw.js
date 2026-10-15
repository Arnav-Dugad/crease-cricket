/* Crease service worker — installable app + offline support.
 *  - App shell & hashed assets: cache-first (they are immutable)
 *  - Navigations: network-first, falling back to the cached shell (SPA)
 *  - /api/* (except live sockets/logging): network-first, falling back to the last good copy
 *  - Images (logos, headshots, photos): stale-while-revalidate, capped
 */
const VERSION = 'crease-v2'
const SHELL = `${VERSION}-shell`
const API = `${VERSION}-api`
const IMG = `${VERSION}-img`
const IMG_MAX = 400
const API_MAX = 200

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(name, max) {
  const c = await caches.open(name)
  const keys = await c.keys()
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i])
}

const IMG_HOSTS = /(^|\.)(espncdn\.com|wikimedia\.org|wikipedia\.org|flagcdn\.com|thesportsdb\.com)$/

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // SPA navigations
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  // Hashed build assets
  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(req, copy))
            return res
          }),
      ),
    )
    return
  }

  // API + historical data: network-first, offline fallback
  if (url.origin === location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) && !/\/api\/(live|log)/.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(API).then((c) => c.put(req, copy).then(() => trim(API, API_MAX)))
          }
          return res
        })
        .catch(() => caches.match(req).then((r) => r || Response.error())),
    )
    return
  }

  // Images: stale-while-revalidate
  if (req.destination === 'image' && IMG_HOSTS.test(url.hostname)) {
    e.respondWith(
      caches.open(IMG).then(async (c) => {
        const hit = await c.match(req)
        const net = fetch(req)
          .then((res) => {
            if (res.ok || res.type === 'opaque') c.put(req, res.clone()).then(() => trim(IMG, IMG_MAX))
            return res
          })
          .catch(() => hit)
        return hit || net
      }),
    )
  }
})
