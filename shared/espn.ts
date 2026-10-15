/**
 * Crease data layer, shared by the Cloudflare Worker and the browser.
 *
 * `resolve(path, get)` turns an app API path (e.g. `/api/match/8048/1535465`) into
 * normalised JSON by calling free public sources through the injected `get`:
 *  - ESPN / ESPNcricinfo public site APIs (scores, scorecards, ball-by-ball, standings, news, players)
 *  - Wikipedia (stadium + player photography and bios)
 *
 * The Worker runs it at the edge with caching; if ESPN's bot protection blocks Cloudflare's
 * network, the browser runs the exact same code directly against the CORS-open APIs.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

export const ESPN = 'https://site.api.espn.com/apis'
export const ESPN_ALT = 'https://site.web.api.espn.com/apis'

export type Getter = (url: string, ttl: number) => Promise<Json>

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface Resolved {
  data: unknown
  ttl: number
}

const stateTtl = (state: string | undefined, live = 15, post = 3600, pre = 300) => (state === 'in' ? live : state === 'post' ? post : pre)

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
    bat: i.batsman?.athlete?.id
      ? { id: i.batsman.athlete.id, n: i.batsman.athlete.displayName, r: i.batsman.totalRuns, b: i.batsman.faced, '4': i.batsman.fours, '6': i.batsman.sixes }
      : null,
    nsb: i.otherBatsman?.athlete?.id ? { id: i.otherBatsman.athlete.id, n: i.otherBatsman.athlete.displayName, r: i.otherBatsman.totalRuns, b: i.otherBatsman.faced } : null,
    bowl: i.bowler?.athlete?.id ? { id: i.bowler.athlete.id, n: i.bowler.athlete.displayName, o: i.bowler.overs, r: i.bowler.conceded, w: i.bowler.wickets, m: i.bowler.maidens } : null,
    w: !!i.dismissal?.dismissal,
    wt: i.dismissal?.type || '',
    wtext: stripHtml(i.dismissal?.text),
    oRuns: ov.runs,
    oWkts: ov.wickets,
    oDone: !!ov.complete,
    ts: i.bbbTimestamp,
  }
}

/** Whole-match ball log, aggregated from ESPN's 25-per-page commentary feed. */
async function allBalls(get: Getter, league: string, event: string) {
  const base = `${ESPN}/site/v2/sports/cricket/${league}/playbyplay?event=${event}`
  const first = await get(`${base}&page=1`, 10)
  const pages: number = first.commentary?.pageCount ?? 1
  // Workers cap subrequests per invocation; for very long Tests keep the most recent pages.
  const MAX = 40
  const start = pages > MAX ? pages - MAX + 2 : 2
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - start + 1) }, (_, k) => get(`${base}&page=${start + k}`, 10).catch(() => ({ commentary: { items: [] } }))),
  )
  const items = [first, ...rest].flatMap((p: Json) => p.commentary?.items ?? [])
  const seen = new Set<string>()
  const balls = items
    // Pre-match ESPN emits a placeholder "ball" (no over, no players) — drop it.
    .filter((i: Json) => i.over?.number > 0 && (i.batsman?.athlete?.id || i.bowler?.athlete?.id) && !seen.has(i.id) && seen.add(i.id))
    .map(slimBall)
    .sort((a: Json, b: Json) => a.inn - b.inn || a.seq - b.seq)
  return { balls, partial: pages > MAX, pages }
}

async function wiki(get: Getter, q: string) {
  const u =
    'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=1&prop=pageimages|extracts|info' +
    '&inprop=url&piprop=original|thumbnail&pithumbsize=1600&exintro=1&explaintext=1&exsentences=4&format=json&origin=*' +
    `&gsrsearch=${encodeURIComponent(q)}`
  const d = await get(u, 86400)
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

/** Trim the heavy summary payload. */
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
  // Roster linescores carry a duplicate copy of each player's statistics — drop it.
  for (const r of d.rosters ?? [])
    for (const p of r.roster ?? []) {
      delete p.media
      for (const ls of p.linescores ?? []) if (ls.linescores?.length) delete ls.statistics
    }
  return d
}

const today = () => {
  const d = new Date()
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Route an app API path to normalised data. Throws HttpError(404) for unknown paths. */
export async function resolve(pathWithQuery: string, get: Getter): Promise<Resolved> {
  const url = new URL(pathWithQuery, 'https://x')
  const p = url.pathname
  const q = url.searchParams
  let m: RegExpMatchArray | null

  // All matches on a day (YYYYMMDD)
  if ((m = p.match(/^\/api\/day\/(\d{8})$/))) {
    const d = await get(`${ESPN}/site/v2/sports/cricket/scorepanel?dates=${m[1]}`, 30)
    const anyLive = (d.scores ?? []).some((s: Json) => s.events?.some((e: Json) => e.competitions?.[0]?.status?.type?.state === 'in'))
    const t = today()
    return { data: d.scores ?? [], ttl: anyLive ? 20 : m[1] < t ? 3600 : m[1] === t ? 60 : 600 }
  }

  // Full match summary: header, rosters (scorecards), leaders, notes, standings, article, videos
  if ((m = p.match(/^\/api\/match\/(\d+)\/(\d+)$/))) {
    const d = await get(`${ESPN}/site/v2/sports/cricket/${m[1]}/summary?event=${m[2]}`, 15)
    return { data: slimSummary(d), ttl: stateTtl(d.meta?.gameState ?? d.header?.competitions?.[0]?.status?.type?.state, 15) }
  }

  // Entire ball-by-ball log for a match
  if ((m = p.match(/^\/api\/balls\/(\d+)\/(\d+)$/))) {
    const data = await allBalls(get, m[1], m[2])
    return { data, ttl: q.get('live') === '1' ? 15 : 86400 }
  }

  // Series: season fixtures + standings
  if ((m = p.match(/^\/api\/series\/(\d+)$/))) {
    const id = m[1]
    const year = q.get('year') ?? String(new Date().getUTCFullYear())
    const errors: string[] = []
    const soft = (e: Error) => (errors.push(e.message), null)
    const [sb, st] = await Promise.all([
      get(`${ESPN}/site/v2/sports/cricket/${id}/scoreboard?dates=${year}`, 120).catch(soft),
      get(`${ESPN}/v2/sports/cricket/${id}/standings`, 600).catch(soft),
    ])
    if (!sb) throw new HttpError(502, errors.join('; ') || 'Series unavailable')
    let events = sb.events ?? []
    // Seasons that straddle new year (e.g. 2026/27) — merge next year's fixtures
    if (q.get('year') == null) {
      const nxt = await get(`${ESPN}/site/v2/sports/cricket/${id}/scoreboard?dates=${+year + 1}`, 600).catch(() => null)
      const ids = new Set(events.map((e: Json) => e.id))
      events = events.concat((nxt?.events ?? []).filter((e: Json) => !ids.has(e.id)))
    }
    const anyLive = events.some((e: Json) => e.status?.type?.state === 'in')
    return { data: { league: sb.leagues?.[0] ?? null, events, standings: st }, ttl: anyLive ? 30 : 600 }
  }

  if ((m = p.match(/^\/api\/news(?:\/(\d+))?$/))) {
    const d = await get(`${ESPN}/site/v2/sports/cricket/${m[1] ?? '8048'}/news?limit=50`, 300)
    return { data: d.articles ?? [], ttl: 600 }
  }

  if ((m = p.match(/^\/api\/player\/(\d+)$/))) {
    const d = await get(`${ESPN}/common/v3/sports/cricket/athletes/${m[1]}`, 86400)
    return {
      data: {
        ...(d.athlete ?? {}),
        videos: (d.videos ?? []).slice(0, 8).map((v: Json) => ({
          id: v.id,
          headline: v.headline,
          thumbnail: v.thumbnail,
          duration: v.duration,
          src: v.links?.source?.href,
          published: v.originalPublishDate,
        })),
      },
      ttl: 86400,
    }
  }

  if (p === '/api/search') {
    const s = (q.get('q') ?? '').trim()
    if (s.length < 2) return { data: [], ttl: 60 }
    const d = await get(`${ESPN}/common/v3/search?query=${encodeURIComponent(s)}&limit=12&mode=prefix&type=player&sport=cricket`, 3600)
    const data = (d.items ?? []).map((i: Json) => {
      const t = i.teamRelationships?.[0]?.core
      return { id: i.id, name: i.displayName, team: t?.displayName ?? null, teamLogo: t?.logos?.[0]?.href ?? null }
    })
    return { data, ttl: 3600 }
  }

  if (p === '/api/wiki') {
    const s = q.get('q')
    if (!s) throw new HttpError(400, 'q required')
    return { data: await wiki(get, s), ttl: 7 * 86400 }
  }

  throw new HttpError(404, 'Not found')
}
