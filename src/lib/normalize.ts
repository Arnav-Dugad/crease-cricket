import type { Innings, LeagueGroup, MatchLite, MatchState, TeamLite } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any

const PALETTE = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF', '#FFD60A', '#5E5CE6', '#FF6482', '#32ADE6']

export function hashColor(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

export function teamColor(color: string | undefined, key: string) {
  if (color && /^#?[0-9a-f]{6}$/i.test(color)) {
    const c = color.startsWith('#') ? color : `#${color}`
    // avoid near-black / near-white team colours that vanish on glass
    const n = parseInt(c.slice(1), 16)
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    if (l > 0.12 && l < 0.92) return c
  }
  return hashColor(key)
}

/** ESPN image combiner — resize logos/headshots at the CDN for crisp, light images. */
export function espnImg(url: string | null | undefined, size = 96) {
  if (!url) return null
  const m = url.match(/^https?:\/\/a\.espncdn\.com(\/i\/.+\.(png|jpg))$/)
  if (!m) return url
  return `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${size}&h=${size}&scale=crop&cquality=80`
}

export const isDefaultHeadshot = (u?: string | null) => !u || u.includes('default-player-logo')

export const headshotUrl = (id: string) => `https://a.espncdn.com/i/headshots/cricket/players/full/${id}.png`

export const leagueLogo = (id: string) => `https://a.espncdn.com/i/leaguelogos/cricket/500/${id}.png`

function innings(ls: J[] | undefined): Innings[] {
  return (ls ?? [])
    .filter((l) => l.isBatting)
    .map((l) => ({
      period: +l.period,
      runs: +l.runs || 0,
      wkts: +l.wickets || 0,
      overs: +l.overs || 0,
      target: +l.target || undefined,
      desc: l.description,
      isCurrent: !!+l.isCurrent,
    }))
}

function team(c: J): TeamLite {
  const t = c.team ?? c
  const id = String(t.id ?? c.id)
  const name = t.displayName ?? c.displayName ?? t.name ?? 'TBC'
  return {
    id,
    name,
    abbr: t.abbreviation ?? c.abbreviation ?? name.slice(0, 3).toUpperCase(),
    logo: t.logo ?? t.logos?.[0]?.href ?? c.logo ?? null,
    color: teamColor(t.color ?? c.color, name),
    score: c.score ?? '',
    winner: c.winner === true || c.winner === 'true',
    innings: innings(c.linescores),
  }
}

export const isWomen = (s: string) => /\bwomen\b/i.test(s)

const FRANCHISE = /premier league|big bash|super league|sa20|the hundred|caribbean|major league cricket|ilt20|super smash|lanka premier|bangladesh premier|global t20/i

export function tierOf(leagueName: string, intl: boolean, women: boolean) {
  if (intl && /world cup(?! league| challenge| qualifier|.*qualif)|champions trophy|world test championship final/i.test(leagueName)) return 0
  if (intl && !women && /tour of|tri-series|trophy|series/i.test(leagueName) && !/qualifier|league 2|challenge/i.test(leagueName)) return 1
  if (FRANCHISE.test(leagueName)) return women ? 3 : 2
  if (intl && women) return 3
  if (intl) return 4
  return 5
}

/** Normalise an ESPN event (scoreboard / scorepanel / summary header). */
export function toMatch(e: J, league?: { id?: string; name?: string }): MatchLite {
  const comp = e.competitions?.[0] ?? e
  const status = comp.status ?? e.status ?? {}
  const type = status.type ?? {}
  const cls = comp.class ?? {}
  const competitors: J[] = (comp.competitors ?? []).slice().sort((a: J, b: J) => (a.order ?? 0) - (b.order ?? 0))
  const teams = competitors.map(team)
  while (teams.length < 2) teams.push({ id: 'tbc' + teams.length, name: 'TBC', abbr: 'TBC', logo: null, color: '#8E8E93', score: '', winner: false, innings: [] })
  const leagueName = league?.name ?? e.season?.slug ?? ''
  const name: string = e.name ?? teams.map((t) => t.name).join(' v ')
  const intl = cls.internationalClassId != null ? cls.internationalClassId !== '0' && cls.internationalClassId !== 0 : /tour of| v /i.test(leagueName) && !FRANCHISE.test(leagueName)
  const women = isWomen(name) || isWomen(leagueName)
  const venue = comp.venue ?? {}
  const potmA = status.featuredAthletes?.find((f: J) => f.name === 'playerOfTheMatch')
  const state = (type.state ?? 'pre') as MatchState
  return {
    id: String(e.id),
    leagueId: String(league?.id ?? e.leagueId ?? e.season?.type ?? ''),
    leagueName,
    desc: comp.description ?? e.description ?? '',
    title: name,
    date: comp.date ?? e.date,
    endDate: comp.endDate ?? e.endDate,
    state,
    status: status.summary ?? type.description ?? '',
    detail: type.detail ?? '',
    venue: venue.fullName ?? '',
    city: venue.address?.city ?? '',
    format: cls.eventType ?? (cls.generalClassCard === 'Twenty20' ? 'T20' : cls.generalClassCard ?? ''),
    intl,
    women,
    top: !!e.isTopEvent,
    teams: [teams[0], teams[1]],
    potm: potmA
      ? { id: String(potmA.athlete?.id ?? potmA.playerId), name: potmA.athlete?.displayName, headshot: typeof potmA.athlete?.headshot === 'string' ? potmA.athlete.headshot : potmA.athlete?.headshot?.href }
      : undefined,
  }
}

export function groupsFromScorepanel(scores: J[]): LeagueGroup[] {
  const map = new Map<string, LeagueGroup>()
  for (const s of scores ?? []) {
    const l = s.leagues?.[0] ?? {}
    for (const e of s.events ?? []) {
      const m = toMatch(e, { id: l.id, name: l.name })
      const g: LeagueGroup = map.get(m.leagueId) ?? { id: m.leagueId, name: l.name, logo: l.logos?.[0]?.href ?? leagueLogo(m.leagueId), tier: 9, matches: [] }
      g.matches.push(m)
      g.tier = Math.min(g.tier, tierOf(l.name ?? '', m.intl, m.women))
      map.set(m.leagueId, g)
    }
  }
  const groups = [...map.values()]
  for (const g of groups) g.matches.sort(byStateThenDate)
  return groups.sort((a, b) => liveCount(b) - liveCount(a) || a.tier - b.tier || a.name.localeCompare(b.name))
}

const liveCount = (g: LeagueGroup) => (g.matches.some((m) => m.state === 'in') ? 1 : 0)
const stateRank = { in: 0, pre: 1, post: 2 }
export const byStateThenDate = (a: MatchLite, b: MatchLite) =>
  stateRank[a.state] - stateRank[b.state] || +new Date(a.date) - +new Date(b.date)

export function matchPriority(m: MatchLite, tier: number) {
  // Competition stature dominates; live/imminent matches get a boost within a tier.
  const hoursAway = (+new Date(m.date) - Date.now()) / 3.6e6
  const timing = m.state === 'in' ? 160 : m.state === 'pre' ? (hoursAway < 30 ? 110 : 70 - Math.min(60, hoursAway)) : 60
  return (6 - tier) * 200 + timing + (m.top ? 40 : 0) + (m.women ? 0 : 10) + (m.teams[0].name === 'TBC' ? -2000 : 0)
}

/* ---------- formatting ---------- */

export function oversStr(o: number) {
  return Number.isInteger(o) ? String(o) : o.toFixed(1)
}

export function inningsStr(i: Innings, allOut = false) {
  return `${i.runs}${i.wkts >= 10 || allOut ? '' : '/' + i.wkts}`
}

export function relTime(iso: string) {
  const d = new Date(iso)
  const diff = (Date.now() - +d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function startLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const tmr = new Date(now)
  tmr.setDate(now.getDate() + 1)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`
  if (d.toDateString() === tmr.toDateString()) return `Tomorrow, ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

export function countdown(iso: string) {
  const s = Math.max(0, (+new Date(iso) - Date.now()) / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export const shortLeague = (n: string) =>
  n.replace(/ 20\d\d(\/\d\d)?$/, '').replace(/^ICC /, 'ICC ').replace(/ tour of /, ' in ')
