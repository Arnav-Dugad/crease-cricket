import type { TrainedWinModel } from './hist'
import type { Ball } from './types'

export const isWide = (b: Ball) => /wide/i.test(b.t)
export const isNoBall = (b: Ball) => /no ?ball/i.test(b.t)
export const isLegal = (b: Ball) => !isWide(b) && !isNoBall(b)
export const isFour = (b: Ball) => /four/i.test(b.t) || (b.r === 4 && /four/i.test(b.short))
export const isSix = (b: Ball) => /six/i.test(b.t) || (b.r === 6 && /six/i.test(b.short))
export const isExtra = (b: Ball) => /wide|no ?ball|bye|leg ?bye/i.test(b.t)

export interface OverAgg {
  over: number
  runs: number
  wkts: number
  total: number
  wktsTotal: number
  balls: Ball[]
  bowler?: string
}

export interface InningsAgg {
  inn: number
  team: string
  teamId: string
  balls: Ball[]
  overs: OverAgg[]
  total: number
  wkts: number
  legal: number
  limit: number
  target: number
  fours: number
  sixes: number
  dots: number
  extras: number
  dist: { dots: number; ones: number; twos: number; threes: number; fours: number; sixes: number; extras: number }
}

export function aggregate(balls: Ball[]): InningsAgg[] {
  const byInn = new Map<number, Ball[]>()
  for (const b of balls) {
    if (!byInn.has(b.inn)) byInn.set(b.inn, [])
    byInn.get(b.inn)!.push(b)
  }
  return [...byInn.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([inn, bs]) => {
      const overs: OverAgg[] = []
      let prevTotal = 0, prevW = 0
      const dist = { dots: 0, ones: 0, twos: 0, threes: 0, fours: 0, sixes: 0, extras: 0 }
      let legal = 0
      for (const b of bs) {
        let o = overs[overs.length - 1]
        if (!o || o.over !== b.o) {
          o = { over: b.o, runs: 0, wkts: 0, total: prevTotal, wktsTotal: prevW, balls: [], bowler: b.bowl?.n }
          overs.push(o)
        }
        o.balls.push(b)
        const total = b.runs ?? prevTotal + b.r
        o.runs += Math.max(0, total - prevTotal)
        o.total = total
        o.wkts += b.w ? 1 : 0
        o.wktsTotal = b.wkts ?? prevW + (b.w ? 1 : 0)
        prevTotal = total
        prevW = o.wktsTotal
        if (isLegal(b)) legal++
        if (isExtra(b)) dist.extras += 1
        else if (isSix(b)) dist.sixes++
        else if (isFour(b)) dist.fours++
        else if (b.r === 0) dist.dots++
        else if (b.r === 1) dist.ones++
        else if (b.r === 2) dist.twos++
        else dist.threes++
      }
      const last = bs[bs.length - 1]
      return {
        inn,
        team: bs[0]?.team ?? '',
        teamId: bs[0]?.teamId ?? '',
        balls: bs,
        overs,
        total: last?.runs ?? prevTotal,
        wkts: last?.wkts ?? prevW,
        legal,
        limit: Math.max(...bs.map((b) => b.limit || 0)),
        target: Math.max(...bs.map((b) => b.target || 0)),
        fours: dist.fours,
        sixes: dist.sixes,
        dots: dist.dots,
        extras: dist.extras,
        dist,
      }
    })
}

export interface Phase {
  name: string
  from: number
  to: number
}

export function phasesFor(limitBalls: number): Phase[] {
  const ov = Math.round(limitBalls / 6)
  if (ov <= 0 || ov > 50) return [] // Tests: no phases
  if (ov <= 10) return [{ name: 'Powerplay', from: 1, to: 2 }, { name: 'Middle', from: 3, to: ov - 2 }, { name: 'Death', from: ov - 1, to: ov }]
  if (ov <= 20) {
    const pp = Math.max(2, Math.round(ov * 0.3))
    const death = Math.max(2, Math.round(ov * 0.2))
    return [{ name: 'Powerplay', from: 1, to: pp }, { name: 'Middle', from: pp + 1, to: ov - death }, { name: 'Death', from: ov - death + 1, to: ov }]
  }
  return [{ name: 'Powerplay', from: 1, to: 10 }, { name: 'Middle', from: 11, to: ov - 10 }, { name: 'Death', from: ov - 9, to: ov }]
}

export function phaseStats(inn: InningsAgg, ph: Phase) {
  const os = inn.overs.filter((o) => o.over >= ph.from && o.over <= ph.to)
  const runs = os.reduce((s, o) => s + o.runs, 0)
  const wkts = os.reduce((s, o) => s + o.wkts, 0)
  const balls = os.reduce((s, o) => s + o.balls.filter(isLegal).length, 0)
  const bnd = os.reduce((s, o) => s + o.balls.filter((b) => isFour(b) || isSix(b)).length, 0)
  return { runs, wkts, balls, rr: balls ? (runs / balls) * 6 : 0, boundaries: bnd, played: os.length > 0 }
}

export interface Partnership {
  wicket: number
  runs: number
  balls: number
  a: string
  b: string
  aRuns: number
  bRuns: number
  unbroken: boolean
}

export function partnerships(inn: InningsAgg): Partnership[] {
  const out: Partnership[] = []
  let runs = 0, balls = 0, prevTotal = 0
  let contrib = new Map<string, number>()
  for (const b of inn.balls) {
    const total = b.runs ?? prevTotal + b.r
    runs += Math.max(0, total - prevTotal)
    prevTotal = total
    if (isLegal(b)) balls++
    if (b.bat && !isExtra(b)) contrib.set(b.bat.n, (contrib.get(b.bat.n) ?? 0) + b.r)
    if (b.bat && !contrib.has(b.bat.n)) contrib.set(b.bat.n, 0)
    if (b.nsb && !contrib.has(b.nsb.n)) contrib.set(b.nsb.n, 0)
    if (b.w) {
      const names = [b.bat?.n, b.nsb?.n].filter(Boolean) as string[]
      out.push({ wicket: out.length + 1, runs, balls, a: names[0] ?? '', b: names[1] ?? '', aRuns: contrib.get(names[0]) ?? 0, bRuns: contrib.get(names[1]) ?? 0, unbroken: false })
      runs = 0
      balls = 0
      contrib = new Map()
    }
  }
  const last = inn.balls[inn.balls.length - 1]
  if (last && (runs > 0 || balls > 0) && inn.wkts < 10) {
    const a = last.bat?.n ?? '', bb = last.nsb?.n ?? ''
    out.push({ wicket: out.length + 1, runs, balls, a, b: bb, aRuns: contrib.get(a) ?? 0, bRuns: contrib.get(bb) ?? 0, unbroken: true })
  }
  return out
}

export function fallOfWickets(inn: InningsAgg) {
  return inn.balls
    .filter((b) => b.w)
    .map((b, i) => ({ n: i + 1, score: b.runs, over: b.ov, batter: b.wtext?.split(/\s+(?:c|b|lbw|run out|st)\s/)[0] || b.bat?.n || '', text: b.wtext }))
}

/* ---------------- Win probability model ----------------
 * A resource-based model (in the spirit of Duckworth–Lewis–Stern):
 *   E(B, W) = Z(W) · (1 − e^(−B·r / Z(W)))   expected runs from B balls with W wickets in hand
 * where Z(W) is the asymptotic run capacity of W wickets and r a scoring-rate constant tuned per format.
 * Chasing side:   P(win) = Φ((E − runsNeeded) / σ(B))
 * Batting first:  P(win) = Φ((projected − par) / σ)  where par = E(limit, 10)
 */
const phi = (x: number) => {
  // Abramowitz–Stegun approximation of the standard normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

function params(limit: number) {
  // T20-style vs ODI-style scoring constants
  return limit <= 130 ? { r: 1.75, Z: 400, s: 1.35, base: 4 } : { r: 1.25, Z: 600, s: 1.7, base: 6 }
}

export function expectedRuns(balls: number, wktsInHand: number, limit: number) {
  if (balls <= 0 || wktsInHand <= 0) return 0
  const { r, Z } = params(limit)
  const z = Z * Math.pow(wktsInHand / 10, 1.2)
  return z * (1 - Math.exp((-balls * r) / z))
}

/** Probability that the *chasing* team wins. */
export function chaseWinProb(need: number, ballsLeft: number, wktsInHand: number, limit: number) {
  if (need <= 0) return 1
  if (ballsLeft <= 0 || wktsInHand <= 0) return 0
  const { s, base } = params(limit)
  const e = expectedRuns(ballsLeft, wktsInHand, limit)
  return Math.min(0.995, Math.max(0.005, phi((e - need + 0.5) / (Math.sqrt(ballsLeft) * s + base))))
}

/** Probability that the team batting first wins, given its live position. */
export function firstInningsWinProb(runs: number, ballsLeft: number, wktsInHand: number, limit: number) {
  const par = expectedRuns(limit, 10, limit)
  const proj = runs + expectedRuns(ballsLeft, wktsInHand, limit)
  const { s, base } = params(limit)
  const sigma = Math.sqrt(limit) * s * 0.9 + base * 2
  return Math.min(0.97, Math.max(0.03, phi((proj - par) / sigma)))
}

export function projectedScore(runs: number, ballsLeft: number, wktsInHand: number, limit: number) {
  return Math.round(runs + expectedRuns(ballsLeft, wktsInHand, limit))
}

export interface WinPoint {
  i: number
  inn: number
  over: number
  p: number // probability team batting first wins
  w: boolean
}

/** Win probability after every ball. Uses the trained (Cricsheet) model when provided, else the heuristic. */
export function winProbSeries(innings: InningsAgg[], trained?: TrainedWinModel | null): WinPoint[] {
  if (innings.length === 0 || innings.length > 2) return []
  const limit = innings[0].limit
  if (!limit || limit > 300) return []
  const pts: WinPoint[] = [{ i: 0, inn: 1, over: 0, p: 0.5, w: false }]
  let i = 0
  const first = innings[0]
  let legal = 0
  for (const b of first.balls) {
    if (isLegal(b)) legal++
    const lim = b.limit || limit
    const p = trained ? trained.first(b.runs, legal, b.wkts) : firstInningsWinProb(b.runs, lim - legal, 10 - b.wkts, lim)
    pts.push({ i: ++i, inn: 1, over: b.ov, p: Math.min(0.99, Math.max(0.01, p)), w: b.w })
  }
  const second = innings[1]
  if (second) {
    legal = 0
    const target = second.target || first.total + 1
    for (const b of second.balls) {
      if (isLegal(b)) legal++
      const lim = b.limit || limit
      const tgt = b.target || target
      const done = b.runs >= tgt ? 1 : b.wkts >= 10 || legal >= lim ? (b.runs === tgt - 1 ? 0.5 : 0) : null
      const p2 = done ?? (trained ? trained.chase(tgt, b.runs, legal, b.wkts, lim) : chaseWinProb(tgt - b.runs, b.rem ?? lim - legal, 10 - b.wkts, lim))
      pts.push({ i: ++i, inn: 2, over: b.ov, p: 1 - p2, w: b.w })
    }
  }
  return pts
}

export function currentWinProb(innings: InningsAgg[], trained?: TrainedWinModel | null): { p: number; label: string } | null {
  const s = winProbSeries(innings, trained)
  if (s.length < 2) return null
  return { p: s[s.length - 1].p, label: 'model' }
}

export function biggestOver(inn: InningsAgg) {
  return inn.overs.reduce<OverAgg | null>((m, o) => (!m || o.runs > m.runs ? o : m), null)
}

export function momentum(inn: InningsAgg, lastN = 5) {
  const os = inn.overs.filter((o) => o.balls.length >= 6 || o === inn.overs[inn.overs.length - 1])
  const recent = os.slice(-lastN)
  const runs = recent.reduce((s, o) => s + o.runs, 0)
  const wk = recent.reduce((s, o) => s + o.wkts, 0)
  const legal = recent.reduce((s, o) => s + o.balls.filter(isLegal).length, 0)
  const overall = inn.legal ? (inn.total / inn.legal) * 6 : 0
  return { runs, wkts: wk, rr: legal ? (runs / legal) * 6 : 0, overall, overs: recent.length }
}

export const ballLabel = (b: Ball) => {
  if (b.w) return 'W'
  if (isWide(b)) return `${b.r > 1 ? b.r : ''}wd`
  if (isNoBall(b)) return `${b.r > 1 ? b.r : ''}nb`
  if (/leg ?bye/i.test(b.t)) return `${b.r}lb`
  if (/bye/i.test(b.t)) return `${b.r}b`
  return b.r === 0 ? '•' : String(b.r)
}

export const ballKind = (b: Ball) =>
  b.w ? 'w' : isSix(b) ? 'six' : isFour(b) ? 'four' : isExtra(b) ? 'extra' : b.r === 0 ? 'dot' : 'run'
