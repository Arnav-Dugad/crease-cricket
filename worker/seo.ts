/**
 * Search-engine and link-preview support.
 *  - Crawlers and link unfurlers get route-specific <title>, description, Open Graph tags,
 *    JSON-LD and a plain-text summary injected at the edge (HTMLRewriter).
 *  - Humans get the untouched SPA shell, so their first load is never slowed down.
 *  - /sitemap.xml lists live, recent and upcoming matches and their series.
 */
import { resolve, type Getter } from '../shared/espn'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegram|discord|slack|embedly|pinterest|skype|preview|vkshare|bingpreview|google-inspectiontool/i

export const isBot = (req: Request) => BOT.test(req.headers.get('user-agent') ?? '')

interface Meta {
  title: string
  description: string
  image?: string
  jsonLd?: Json
  body?: string
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

async function metaFor(path: string, get: Getter, origin: string): Promise<Meta | null> {
  let m: RegExpMatchArray | null
  if ((m = path.match(/^\/match\/(\d+)\/(\d+)/))) {
    const s: Json = (await resolve(`/api/match/${m[1]}/${m[2]}`, get)).data
    const h = s.header ?? {}
    const c = h.competitions?.[0] ?? {}
    const teams = (c.competitors ?? []).map((x: Json) => `${x.team?.displayName}${x.score ? ' ' + x.score : ''}`)
    const status = c.status?.summary ?? c.status?.type?.description ?? ''
    const venue = s.gameInfo?.venue?.fullName
    return {
      title: `${h.name ?? 'Match'} — ${status || 'Live score'} | Crease`,
      description: `${teams.join(' vs ')}. ${c.description ?? ''}${venue ? ` at ${venue}` : ''}. Live score, scorecard, ball-by-ball commentary and analytics.`,
      image: c.competitors?.[0]?.team?.logos?.[0]?.href,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: h.name,
        sport: 'Cricket',
        startDate: c.date,
        eventStatus: 'https://schema.org/EventScheduled',
        location: venue ? { '@type': 'Place', name: venue, address: s.gameInfo?.venue?.address?.city } : undefined,
        competitor: (c.competitors ?? []).map((x: Json) => ({ '@type': 'SportsTeam', name: x.team?.displayName })),
        url: origin + path,
      },
      body: `<h1>${esc(h.name ?? '')}</h1><p>${esc(teams.join(' vs '))}</p><p>${esc(status)}</p>`,
    }
  }
  if ((m = path.match(/^\/series\/(\d+)/))) {
    const s: Json = (await resolve(`/api/series/${m[1]}`, get)).data
    const name = s.league?.name ?? 'Series'
    return {
      title: `${name} — fixtures, results & table | Crease`,
      description: `${name}: ${s.events?.length ?? 0} matches. Live scores, results, points table and season stats.`,
      image: s.league?.logos?.[0]?.href,
      body: `<h1>${esc(name)}</h1>`,
    }
  }
  if ((m = path.match(/^\/player\/(\d+)/))) {
    const a: Json = (await resolve(`/api/player/${m[1]}`, get)).data
    return {
      title: `${a.displayName ?? 'Player'} — profile & stats | Crease`,
      description: `${a.displayName}${a.position?.name ? `, ${a.position.name}` : ''}${a.team?.displayName ? ` (${a.team.displayName})` : ''}. Career stats, form and matchups.`,
      image: a.headshot?.href,
      body: `<h1>${esc(a.displayName ?? '')}</h1>`,
    }
  }
  const STATIC: Record<string, Meta> = {
    '/': { title: 'Crease — Live cricket scores & analytics', description: 'Live scores, ball-by-ball commentary, scorecards, win probability and deep analytics for every cricket match.' },
    '/matches': { title: 'Live scores & schedule | Crease', description: 'Every live, recent and upcoming cricket match, by day.' },
    '/series': { title: 'Cricket series & tournaments | Crease', description: 'International tours, ICC events, T20 leagues and domestic cricket.' },
    '/rankings': { title: 'ICC team rankings & WTC table | Crease', description: 'Current ICC Test, ODI and T20I team rankings and the World Test Championship standings.' },
    '/news': { title: 'Cricket news | Crease', description: 'Top cricket stories from around the world.' },
  }
  return STATIC[path] ?? null
}

export async function withSeo(req: Request, html: Response, get: Getter): Promise<Response> {
  const url = new URL(req.url)
  let meta: Meta | null = null
  try {
    meta = await metaFor(url.pathname, get, url.origin)
  } catch {
    return html
  }
  if (!meta) return html
  const m = meta
  const tags =
    `<meta property="og:title" content="${esc(m.title)}"><meta property="og:description" content="${esc(m.description)}">` +
    `<meta property="og:url" content="${esc(url.origin + url.pathname)}"><meta name="twitter:card" content="summary">` +
    (m.image ? `<meta property="og:image" content="${esc(m.image)}">` : '') +
    `<link rel="canonical" href="${esc(url.origin + url.pathname)}">` +
    (m.jsonLd ? `<script type="application/ld+json">${JSON.stringify(m.jsonLd).replace(/</g, '\\u003c')}</script>` : '')
  return new HTMLRewriter()
    .on('title', { element: (e) => { e.setInnerContent(m.title) } })
    .on('meta[name="description"]', { element: (e) => { e.setAttribute('content', m.description) } })
    .on('meta[property^="og:"]', { element: (e) => { e.remove() } })
    .on('head', { element: (e) => { e.append(tags, { html: true }) } })
    .on('div#root', { element: (e) => { e.setInnerContent(m.body ?? `<h1>${esc(m.title)}</h1><p>${esc(m.description)}</p>`, { html: true }) } })
    .transform(html)
}

export async function sitemap(origin: string, get: Getter) {
  const days = [-2, -1, 0, 1, 2].map((o) => {
    const d = new Date(Date.now() + o * 86400000)
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  })
  const urls = new Set<string>(['/', '/matches', '/series', '/rankings', '/news'])
  const results = await Promise.all(days.map((d) => resolve(`/api/day/${d}`, get).catch(() => null)))
  for (const r of results) {
    for (const s of (r?.data as Json[]) ?? []) {
      const l = s.leagues?.[0]?.id
      if (l) urls.add(`/series/${l}`)
      for (const e of s.events ?? []) if (l) urls.add(`/match/${l}/${e.id}`)
    }
  }
  const now = new Date().toISOString()
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...urls].map((u) => `  <url><loc>${origin}${u}</loc><lastmod>${now}</lastmod></url>`).join('\n') +
    '\n</urlset>\n'
  )
}
