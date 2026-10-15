/**
 * Crease API edge layer.
 *
 * Runs the shared data layer (`shared/espn.ts`) at Cloudflare's edge and caches every response
 * in the Cache API with a TTL that depends on whether a match is live — thousands of viewers
 * cost only a handful of upstream calls. If an upstream blocks the edge, the client falls back
 * to running the same code directly in the browser.
 */
import { ESPN, ESPN_ALT, HttpError, resolve } from '../shared/espn'

interface Env {
  ASSETS: Fetcher
}

// Bump to invalidate every edge-cached API response after a data-shape change.
const CACHE_VERSION = '3'

const UA = 'Mozilla/5.0 (compatible; CreaseCricket/1.0; +https://github.com/Arnav-Dugad/crease-cricket)'

const json = (data: unknown, ttl: number, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // browsers revalidate quickly (live scores); the edge Cache API honours s-maxage
      'cache-control': status === 200 ? `public, max-age=${Math.min(ttl, 30)}, s-maxage=${ttl}` : 'no-store',
      'access-control-allow-origin': '*',
    },
  })

async function upstream(url: string, ttl: number) {
  const init = { headers: { 'user-agent': UA, accept: 'application/json' }, cf: { cacheTtl: ttl, cacheEverything: true } } as RequestInit
  let res = await fetch(url, init)
  // ESPN occasionally blocks one host from Cloudflare's network — try the mirror
  if ((res.status === 403 || res.status >= 500) && url.startsWith(ESPN)) res = await fetch(url.replace(ESPN, ESPN_ALT), init)
  if (!res.ok) throw new HttpError(res.status, `Upstream ${res.status} for ${url}`)
  return res.json()
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*' } })

    const cache = (caches as unknown as { default: Cache }).default
    const keyUrl = new URL(url)
    keyUrl.searchParams.set('__v', CACHE_VERSION)
    const key = new Request(keyUrl.toString(), { method: 'GET' })
    const hit = await cache.match(key)
    if (hit) return hit
    try {
      const { data, ttl } = await resolve(url.pathname + url.search, upstream)
      const res = json(data, ttl)
      ctx.waitUntil(cache.put(key, res.clone()))
      return res
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 502
      // Signal the client that it can fetch this resource directly.
      return json({ error: (e as Error).message, fallback: status === 403 || status >= 500 }, 0, status >= 400 && status < 600 ? status : 502)
    }
  },
} satisfies ExportedHandler<Env>
