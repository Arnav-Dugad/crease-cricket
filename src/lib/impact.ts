/**
 * Player impact for a single match, and win-probability swing detection.
 *
 * Impact = runs above par (each ball valued against the average scoring rate of its phase)
 *        + wicket value (expected runs the wicket removed, resource-based)
 * WPA    = win-probability added: every ball's change in the batting side's win chance,
 *          credited to the batter (+) and the bowler (−).
 */
import { expectedRuns, isExtra, isLegal, type InningsAgg, type WinPoint } from './analytics'
import type { Ball } from './types'

const PHASE_RPB = {
  T20: { pp: 1.3, mid: 1.25, death: 1.62 },
  ODI: { pp: 0.92, mid: 0.88, death: 1.22 },
  Test: { pp: 0.55, mid: 0.55, death: 0.55 },
}

function phaseRpb(over: number, limit: number) {
  const ov = Math.round(limit / 6)
  if (!limit || ov > 50) return PHASE_RPB.Test.mid
  const t = ov <= 20 ? PHASE_RPB.T20 : PHASE_RPB.ODI
  const pp = ov <= 20 ? Math.round(ov * 0.3) : 10
  const death = ov <= 20 ? ov - Math.round(ov * 0.2) : ov - 10
  return over <= pp ? t.pp : over > death ? t.death : t.mid
}

export interface Impact {
  id: string
  name: string
  team: string
  bat: number
  bowl: number
  total: number
  wpa: number
  runs: number
  balls: number
  wkts: number
  conceded: number
  bowled: number
}

export function impactRatings(innings: InningsAgg[], wp: WinPoint[]): Impact[] {
  const map = new Map<string, Impact>()
  const get = (id: string, name: string, team: string) => {
    let x = map.get(id)
    if (!x) {
      x = { id, name, team, bat: 0, bowl: 0, total: 0, wpa: 0, runs: 0, balls: 0, wkts: 0, conceded: 0, bowled: 0 }
      map.set(id, x)
    }
    return x
  }
  const all: Ball[] = innings.flatMap((i) => i.balls)
  // win prob points line up 1:1 with balls after the initial 0.5 point (limited overs only)
  const hasWp = wp.length === all.length + 1
  all.forEach((b, k) => {
    const inn = innings.find((i) => i.inn === b.inn)!
    const limit = b.limit || inn.limit
    const par = phaseRpb(b.o, limit)
    const bowlTeam = innings.find((i) => i.inn !== b.inn)?.team ?? ''
    if (b.bat) {
      const p = get(b.bat.id, b.bat.n, b.team)
      if (!isExtra(b)) {
        p.bat += b.r - par
        p.runs += b.r
      }
      if (isLegal(b)) p.balls++
      if (b.w) p.bat -= 4 // getting out costs future runs (small fixed penalty; bowler gets the full value)
    }
    if (b.bowl) {
      const q = get(b.bowl.id, b.bowl.n, bowlTeam)
      const conceded = /bye|leg ?bye/i.test(b.t) ? 0 : b.r
      q.bowl += par - conceded
      q.conceded += conceded
      if (isLegal(b)) q.bowled++
      if (b.w && !/run out/i.test(b.wt + b.wtext)) {
        q.wkts++
        const left = Math.max(0, (limit || 300) - (k > 0 ? inn.balls.filter((x) => x.seq <= b.seq && isLegal(x)).length : 0))
        const wk = Math.min(9, b.wkts - 1)
        q.bowl += Math.max(6, expectedRuns(left, 10 - wk, limit || 300) - expectedRuns(left, 9 - wk, limit || 300))
      }
    }
    if (hasWp) {
      const before = wp[k].p, after = wp[k + 1].p
      const dBat = b.inn === 1 ? after - before : before - after // batting side's gain
      if (b.bat) get(b.bat.id, b.bat.n, b.team).wpa += dBat
      if (b.bowl) get(b.bowl.id, b.bowl.n, bowlTeam).wpa -= dBat
    }
  })
  for (const x of map.values()) x.total = x.bat + x.bowl
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export interface Swing {
  i: number
  delta: number // change in P(team batting first wins), in points
  ball: Ball
  label: string
}

/** Biggest win-probability moves, measured over a 6-ball window, de-duplicated. */
export function biggestSwings(innings: InningsAgg[], wp: WinPoint[], n = 5): Swing[] {
  const all = innings.flatMap((i) => i.balls)
  if (wp.length !== all.length + 1) return []
  const cands: Swing[] = []
  for (let k = 1; k < wp.length; k++) {
    const from = wp[Math.max(0, k - 6)].p
    const delta = (wp[k].p - from) * 100
    if (Math.abs(delta) < 6) continue
    // attribute to the most decisive ball in the window
    let best = k
    let bd = 0
    for (let j = Math.max(1, k - 5); j <= k; j++) {
      const d = Math.abs(wp[j].p - wp[j - 1].p)
      if (d > bd) {
        bd = d
        best = j
      }
    }
    const ball = all[best - 1]
    const label = ball.w ? `${ball.wtext?.split(/\s+(c|b|lbw|st|run out)\b/)[0] || ball.bat?.n || 'Wicket'} out` : ball.r >= 4 ? `${ball.bat?.n ?? ''} ${ball.r === 6 ? 'six' : 'four'}` : ball.short
    cands.push({ i: best, delta, ball, label })
  }
  cands.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const out: Swing[] = []
  for (const c of cands) {
    if (out.some((o) => Math.abs(o.i - c.i) < 10)) continue
    out.push(c)
    if (out.length >= n) break
  }
  return out.sort((a, b) => a.i - b.i)
}

/** Rolling pressure inside each partnership: 12-ball run rate and dot-ball streaks. */
export function partnershipPressure(inn: InningsAgg) {
  const parts: { wicket: number; points: { k: number; rr: number; dots: number }[]; runs: number; a: string; b: string }[] = []
  let cur: Ball[] = []
  const flush = () => {
    if (!cur.length) return
    const legal = cur.filter(isLegal)
    const points = legal.map((_, k) => {
      const win = legal.slice(Math.max(0, k - 11), k + 1)
      const runs = win.reduce((s, x) => s + x.r, 0)
      let dots = 0
      for (let j = k; j >= 0 && legal[j].r === 0 && !legal[j].w; j--) dots++
      return { k: k + 1, rr: (runs / win.length) * 6, dots }
    })
    const last = cur[cur.length - 1]
    parts.push({ wicket: parts.length + 1, points, runs: cur.reduce((s, x) => s + x.r, 0), a: last.bat?.n ?? '', b: last.nsb?.n ?? '' })
    cur = []
  }
  for (const b of inn.balls) {
    cur.push(b)
    if (b.w) flush()
  }
  flush()
  return parts
}
