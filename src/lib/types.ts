export type MatchState = 'pre' | 'in' | 'post'

export interface Innings {
  period: number
  runs: number
  wkts: number
  overs: number
  target?: number
  desc?: string
  isCurrent?: boolean
}

export interface TeamLite {
  id: string
  name: string
  abbr: string
  logo: string | null
  color: string
  score: string
  winner: boolean
  innings: Innings[]
}

export interface MatchLite {
  id: string
  leagueId: string
  leagueName: string
  desc: string
  title: string
  date: string
  endDate?: string
  state: MatchState
  status: string
  detail: string
  venue: string
  city: string
  format: string
  intl: boolean
  women: boolean
  top: boolean
  teams: [TeamLite, TeamLite]
  potm?: { id: string; name: string; headshot?: string }
}

export interface LeagueGroup {
  id: string
  name: string
  logo: string
  tier: number
  matches: MatchLite[]
}

export interface Ball {
  id: string
  seq: number
  inn: number
  team: string
  teamId: string
  o: number
  b: number
  ov: number
  u: number
  r: number
  t: string
  short: string
  text: string
  runs: number
  wkts: number
  rr: number
  target: number
  limit: number
  rem: number
  bat: { id: string; n: string; r: number; b: number; '4': number; '6': number } | null
  nsb: { id: string; n: string; r: number; b: number } | null
  bowl: { id: string; n: string; o: number; r: number; w: number; m: number } | null
  w: boolean
  wt: string
  wtext: string
  oRuns: number
  oWkts: number
  oDone: boolean
  ts: number
}

export interface BallsResponse {
  balls: Ball[]
  partial: boolean
  pages: number
}

export interface NewsArticle {
  id: number
  headline: string
  description: string
  published: string
  byline?: string
  images?: { url: string; caption?: string; credit?: string; width?: number; height?: number }[]
  links?: { web?: { href: string } }
  categories?: { type: string; description?: string; leagueId?: number }[]
}

export interface Video {
  id: number
  headline: string
  description?: string
  duration: number
  thumbnail: string
  src?: string
  published?: string
}

export interface WikiInfo {
  title: string | null
  extract?: string
  url?: string
  image?: string | null
  original?: string | null
  lat?: number | null
  lon?: number | null
}
