/**
 * Crease API edge layer.
 *
 * Proxies and caches free public cricket data sources at Cloudflare's edge:
 *  - ESPN / ESPNcricinfo public site APIs (scores, scorecards, ball-by-ball, standings, news, players)
 *  - Wikipedia (stadium + player photography and bios)
 *
 * Every response is cached in the Cloudflare Cache API with a TTL that depends on
 * whether a match is live, so thousands of viewers cost only a handful of upstream calls.
 */

interface Env {
  ASSETS: Fetcher
}

const ESPN = 'https://site.web.api.espn.com/apis'
const ESPN_HEADER = 'https://site.api.espn.com/apis/personalized/v2/scoreboard/header'
const UA = 'Mozilla/5.0 (compatible; CreaseCricket/1.0; +https://github.com)'

type Json = any

const json = (data: unknown, ttl: number, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${Math.min(ttl, 60)}, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`,
      'access-control-allow-origin': '*',
    },
  })

async function upstream(url: string, ttl: number): Promise<Json> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    cf: { cacheTtl: ttl, cacheEverything: true },
  } as RequestInit)
  if (!res.ok) throw new HttpError(res.status, `Upstream ${res.status} for ${url}`)
  return res.json()
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Cache wrapper: build JSON with `producer`, choose TTL from the result. */
async function cached(
  req: Request,
  ctx: ExecutionContext,
  producer: () => Promise<{ data: unknown; ttl: number }>,
): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(new URL(req.url).toString(), { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) return hit
  try {
    const { data, ttl } = await producer()
    const res = json(data, ttl)
    ctx.waitUntil(cache.put(key, res.clone()))
    return res
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 502
    return json({ error: (e as Error).message }, 5, status >= 400 && status < 600 ? status : 502)
  }
}

const stateTtl = (state: string | undefined, live = 15, post = 3600, pre = 300) =>
  state === 'in' ? live : state === 'post' ? post : pre

const stripHtml = (s: string | undefined) =>
  (s ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&dagger;/g, '†')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()

/** Compact ball-by-ball item: ~10x smaller than the raw ESPN commentary payload. */
function slimBall(i: Json) {
  const inn = i.innings ?? {}
  const ov = i.over ?? {}
  return {
    id: i.id,
    seq: i.sequence,
    inn: i.period,
    team: i.team?.abbreviation,
    teamId: i.team?.id,
    o: ov.number, // 1-indexed over
    b: ov.ball,
    ov: ov.overs, // e.g. 16.5
    u: ov.unique,
    r: i.scoreValue ?? 0,
    t: i.playType?.description ?? '',
    short: stripHtml(i.shortText),
    text: stripHtml(i.text),
    runs: inn.runs,
    wkts: inn.wickets,
    rr: inn.runRate,
    target: inn.target,
    limit: inn.ballLimit,
    rem: inn.remainingBalls,
    bat: i.batsman?.athlete
      ? { id: i.batsman.athlete.id, n: i.batsman.athlete.displayName, r: i.batsman.totalRuns, b: i.batsman.faced, '4': i.batsman.fours, '6': i.batsman.sixes }
      : null,
    nsb: i.otherBatsman?.athlete
      ? { id: i.otherBatsman.athlete.id, n: i.otherBatsman.athlete.displayName, r: i.otherBatsman.totalRuns, b: i.otherBatsman.faced }
      : null,
    bowl: i.bowler?.athlete
      ? { id: i.bowler.athlete.id, n: i.bowler.athlete.displayName, o: i.bowler.overs, r: i.bowler.conceded, w: i.bowler.wickets, m: i.bowler.maidens }
      : null,
    w: !!i.dismissal?.dismissal,
    wt: i.dismissal?.type || '',
    wtext: stripHtml(i.dismissal?.text),
    oRuns: ov.runs,
    oWkts: ov.wickets,
    oDone: !!ov.complete,
    ts: i.bbbTimestamp,
  }
}

async function allBalls(league: string, event: string) {
  const base = `${ESPN}/site/v2/sports/cricket/${league}/playbyplay?event=${event}`
  const first = await upstream(`${base}&page=1`, 10)
  const c = first.commentary ?? {}
  const pages: number = c.pageCount ?? 1
  // Workers cap subrequests per invocation; for very long Tests keep the most recent pages.
  const MAX = 40
  const start = pages > MAX ? pages - MAX + 2 : 2
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - start + 1) }, (_, k) =>
      upstream(`${base}&page=${start + k}`, 10).catch(() => ({ commentary: { items: [] } })),
    ),
  )
  const items = [first, ...rest].flatMap((p: Json) => p.commentary?.items ?? [])
  const seen = new Set<string>()
  const balls = items
    .filter((i: Json) => i.over && !seen.has(i.id) && seen.add(i.id))
    .map(slimBall)
    .sort((a: Json, b: Json) => a.inn - b.inn || a.seq - b.seq)
  return { balls, partial: pages > MAX, pages }
}

async function wiki(q: string) {
  const u =
    'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=1&prop=pageimages|extracts|info' +
    '&inprop=url&piprop=original|thumbnail&pithumbsize=1600&exintro=1&explaintext=1&exsentences=4&format=json&origin=*' +
    `&gsrsearch=${encodeURIComponent(q)}`
  const d = await upstream(u, 86400)
  const page: Json = Object.values(d?.query?.pages ?? {})[0]
  if (!page) return { title: null }
  return {
    title: page.title,
    extract: page.extract,
    url: page.fullurl,
    image: page.thumbnail?.source?.split('?')[0] ?? null,
    original: page.original?.source?.split('?')[0] ?? null,
  }
}

/** Trim the heavy summary payload (drops duplicated video tracking etc). */
function slimSummary(d: Json) {
  if (d.videos) {
    d.videos = d.videos.slice(0, 12).map((v: Json) => ({
      id: v.id,
      headline: v.headline,
      description: v.description,
      duration: v.duration,
      thumbnail: v.thumbnail,
      src: v.links?.source?.href ?? v.links?.mobile?.source?.href,
      published: v.originalPublishDate,
    }))
  }
  if (d.article?.story) d.article.story = d.article.story.slice(0, 20000)
  // Roster linescores carry a duplicate copy of each player's statistics — drop it (~40% smaller).
  for (const r of d.rosters ?? [])
    for (const p of r.roster ?? []) {
      delete p.media
      for (const ls of p.linescores ?? []) if (ls.linescores?.length) delete ls.statistics
    }
  return d
}

const route = (path: string, pattern: RegExp) => path.match(pattern)

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    const p = url.pathname
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req)
    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*' } })

    let m: RegExpMatchArray | null

    // Live + current events across every competition
    if (p === '/api/live')
      return cached(req, ctx, async () => {
        const d = await upstream(`${ESPN_HEADER}?sport=cricket&lang=en&region=in`, 15)
        return { data: d.sports?.[0]?.leagues ?? [], ttl: 20 }
      })

    // All matches on a day (YYYYMMDD)
    if ((m = route(p, /^\/api\/day\/(\d{8})$/)))
      return cached(req, ctx, async () => {
        const d = await upstream(`${ESPN}/site/v2/sports/cricket/scorepanel?dates=${m![1]}`, 30)
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const anyLive = (d.scores ?? []).some((s: Json) => s.events?.some((e: Json) => e.competitions?.[0]?.status?.type?.state === 'in'))
        const ttl = anyLive ? 20 : m![1] < today ? 3600 : m![1] === today ? 60 : 600
        return { data: d.scores ?? [], ttl }
      })

    // Full match summary: header, scorecards, rosters, leaders, notes, standings, news, videos
    if ((m = route(p, /^\/api\/match\/(\d+)\/(\d+)$/)))
      return cached(req, ctx, async () => {
        const d = await upstream(`${ESPN}/site/v2/sports/cricket/${m![1]}/summary?event=${m![2]}`, 15)
        return { data: slimSummary(d), ttl: stateTtl(d.meta?.gameState ?? d.header?.competitions?.[0]?.status?.type?.state, 15) }
      })

    // Entire ball-by-ball log for a match, aggregated from all pages
    if ((m = route(p, /^\/api\/balls\/(\d+)\/(\d+)$/)))
      return cached(req, ctx, async () => {
        const data = await allBalls(m![1], m![2])
        const live = url.searchParams.get('live') === '1'
        return { data, ttl: live ? 15 : 86400 }
      })

    // Series: fixtures for a season + standings
    if ((m = route(p, /^\/api\/series\/(\d+)$/)))
      return cached(req, ctx, async () => {
        const year = url.searchParams.get('year') ?? String(new Date().getUTCFullYear())
        const [sb, st] = await Promise.all([
          upstream(`${ESPN}/site/v2/sports/cricket/${m![1]}/scoreboard?dates=${year}`, 120).catch(() => null),
          upstream(`${ESPN}/v2/sports/cricket/${m![1]}/standings`, 600).catch(() => null),
        ])
        let events = sb?.events ?? []
        // Seasons that straddle new year (e.g. 2026/27) — merge next year's fixtures
        if (sb && url.searchParams.get('year') == null) {
          const nxt = await upstream(`${ESPN}/site/v2/sports/cricket/${m![1]}/scoreboard?dates=${+year + 1}`, 600).catch(() => null)
          const ids = new Set(events.map((e: Json) => e.id))
          events = events.concat((nxt?.events ?? []).filter((e: Json) => !ids.has(e.id)))
        }
        const anyLive = events.some((e: Json) => e.status?.type?.state === 'in')
        return { data: { league: sb?.leagues?.[0] ?? null, events, standings: st }, ttl: anyLive ? 30 : 600 }
      })

    if ((m = route(p, /^\/api\/news(?:\/(\d+))?$/)))
      return cached(req, ctx, async () => {
        const d = await upstream(`${ESPN}/site/v2/sports/cricket/${m![1] ?? '8048'}/news?limit=50`, 300)
        return { data: d.articles ?? [], ttl: 600 }
      })

    if ((m = route(p, /^\/api\/player\/(\d+)$/)))
      return cached(req, ctx, async () => {
        const d = await upstream(`${ESPN}/common/v3/sports/cricket/athletes/${m![1]}`, 86400)
        const a = d.athlete ?? {}
        return {
          data: {
            ...a,
            videos: (d.videos ?? []).slice(0, 8).map((v: Json) => ({
              id: v.id, headline: v.headline, thumbnail: v.thumbnail, duration: v.duration,
              src: v.links?.source?.href, published: v.originalPublishDate,
            })),
          },
          ttl: 86400,
        }
      })

    if (p === '/api/search')
      return cached(req, ctx, async () => {
        const q = (url.searchParams.get('q') ?? '').trim()
        if (q.length < 2) return { data: [], ttl: 60 }
        const d = await upstream(`${ESPN}/common/v3/search?query=${encodeURIComponent(q)}&limit=12&mode=prefix&type=player&sport=cricket`, 3600)
        const data = (d.items ?? []).map((i: Json) => {
          const t = i.teamRelationships?.[0]?.core
          return { id: i.id, name: i.displayName, team: t?.displayName ?? null, teamLogo: t?.logos?.[0]?.href ?? null }
        })
        return { data, ttl: 3600 }
      })

    if (p === '/api/wiki')
      return cached(req, ctx, async () => {
        const q = url.searchParams.get('q')
        if (!q) throw new HttpError(400, 'q required')
        return { data: await wiki(q), ttl: 7 * 86400 }
      })

    return json({ error: 'Not found' }, 60, 404)
  },
} satisfies ExportedHandler<Env>
