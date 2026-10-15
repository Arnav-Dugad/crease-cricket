/**
 * Crease edge layer (Cloudflare Worker).
 *
 *  /api/*              shared data layer (shared/espn.ts) with edge caching
 *  /api/hist/*         precomputed historical stats (Cricsheet) from static assets
 *  /api/ai/story/...   AI match stories (Claude if configured, else Workers AI), cached forever per block
 *  /api/live/...       WebSocket → LiveRoom Durable Object for real-time score ticks
 *  /api/log, /api/health, /sitemap.xml
 *  everything else     static SPA assets (crawlers get edge-rendered metadata)
 *
 * If ESPN blocks the edge, the client falls back to running the same data layer in the browser.
 */
import { ESPN, ESPN_ALT, HttpError, resolve } from '../shared/espn'
import { matchStory, type AiEnv } from './ai'
import { histH2H, histMeta, histPlayers, histTeam, histVenue } from './hist'
import { isBot, sitemap, withSeo } from './seo'

export { LiveRoom } from './live'

interface Env extends AiEnv {
  ASSETS: Fetcher
  LIVE: DurableObjectNamespace
}

// Bump to invalidate every edge-cached API response after a data-shape change.
const CACHE_VERSION = '5'

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

/** Edge-cache wrapper keyed by URL (+ cache version). */
async function cached(req: Request, ctx: ExecutionContext, produce: () => Promise<{ data: unknown; ttl: number } | null>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default
  const keyUrl = new URL(req.url)
  keyUrl.searchParams.set('__v', CACHE_VERSION)
  const key = new Request(keyUrl.toString(), { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) return hit
  try {
    const out = await produce()
    if (!out) return json({ error: 'Not found' }, 0, 404)
    const res = json(out.data, out.ttl)
    if (out.ttl > 0) ctx.waitUntil(cache.put(key, res.clone()))
    return res
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 502
    // `fallback` tells the client it can fetch this resource directly from the source.
    return json({ error: (e as Error).message, fallback: status === 403 || status >= 500 }, 0, status >= 400 && status < 600 ? status : 502)
  }
}

const ids = (s: string | null) => [...new Set((s ?? '').split(',').filter((x) => /^\d{1,9}$/.test(x)))].slice(0, 40)

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    const p = url.pathname

    if (p === '/sitemap.xml')
      return new Response(await sitemap(url.origin, upstream).catch(() => ''), { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=1800' } })

    if (!p.startsWith('/api/')) {
      const res = await env.ASSETS.fetch(req)
      const html = (res.headers.get('content-type') ?? '').includes('text/html')
      return html && req.method === 'GET' && isBot(req) ? withSeo(req, res, upstream) : res
    }

    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*' } })

    if (p === '/api/log' && req.method === 'POST') {
      // Client-side errors land in Workers Logs (observability is enabled in wrangler.jsonc).
      console.error('[client-error]', (await req.text()).slice(0, 4000))
      return new Response(null, { status: 204 })
    }

    if (p === '/api/health') {
      const t = Date.now()
      const espn = await upstream(`${ESPN}/site/v2/sports/cricket/scorepanel`, 0)
        .then(() => 'ok')
        .catch((e: Error) => `degraded: ${e.message.slice(0, 60)}`)
      const hist = await histMeta(env.ASSETS)
      return json({ ok: true, espn, hist: hist ? { generatedAt: hist.generatedAt, matches: hist.matches } : null, ai: env.ANTHROPIC_API_KEY ? 'claude' : env.AI ? 'workers-ai' : 'off', ms: Date.now() - t }, 0)
    }

    let m: RegExpMatchArray | null

    // Real-time: WebSocket to the match's LiveRoom
    if ((m = p.match(/^\/api\/live\/(\d+)\/(\d+)$/))) {
      if (req.headers.get('upgrade') !== 'websocket') return json({ error: 'Expected WebSocket' }, 0, 426)
      const stub = env.LIVE.get(env.LIVE.idFromName(`${m[1]}:${m[2]}`))
      return stub.fetch(req)
    }

    // AI story for one 5-over block
    if ((m = p.match(/^\/api\/ai\/story\/(\d+)\/(\d+)\/(\d)\/(\d{1,2})$/))) {
      const [, league, event, inn, block] = m
      return cached(req, ctx, async () => {
        const out = await matchStory(env, upstream, league, event, +inn, +block)
        if (!out) throw new HttpError(503, 'Story unavailable')
        return { data: out, ttl: 30 * 86400 }
      })
    }

    // Historical stats (Cricsheet)
    if (p === '/api/hist/players') return cached(req, ctx, async () => ({ data: await histPlayers(env.ASSETS, ids(url.searchParams.get('ids'))), ttl: 86400 }))
    if (p === '/api/hist/venue')
      return cached(req, ctx, async () => ({ data: await histVenue(env.ASSETS, url.searchParams.get('name') ?? '', url.searchParams.get('city') ?? undefined), ttl: 86400 }))
    if (p === '/api/hist/h2h') return cached(req, ctx, async () => ({ data: await histH2H(env.ASSETS, url.searchParams.get('a') ?? '', url.searchParams.get('b') ?? ''), ttl: 86400 }))
    if (p === '/api/hist/team') return cached(req, ctx, async () => ({ data: await histTeam(env.ASSETS, url.searchParams.get('name') ?? ''), ttl: 86400 }))

    // Everything else: the shared data layer
    return cached(req, ctx, async () => {
      try {
        return await resolve(p + url.search, upstream)
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return null
        throw e
      }
    })
  },
} satisfies ExportedHandler<Env>
