/**
 * Monte Carlo innings simulator + DLS-style par/target calculator.
 *
 * Ball outcomes are drawn from probability tables by phase × wickets lost. When the trained
 * tables from Cricsheet (public/data/hist/model.json) are loaded they are used; otherwise a
 * hand-calibrated default keeps the feature working.
 */
import { expectedRuns } from './analytics'
import type { OutcomeTables } from './hist-types'

export type OutcomeKey = '0' | '1' | '2' | '3' | '4' | '6' | 'W' | 'wd' | 'nb' | 'lb'
export type OutcomeTable = Record<string, Record<string, Partial<Record<OutcomeKey, number>>>>

export const wktBucket = (w: number) => (w <= 2 ? '0-2' : w <= 5 ? '3-5' : w <= 7 ? '6-7' : '8-9')

export function phaseOf(over: number, limitOvers: number) {
  if (limitOvers <= 20) return over <= Math.round(limitOvers * 0.3) ? 'pp' : over > limitOvers - Math.round(limitOvers * 0.2) ? 'death' : 'mid'
  return over <= 10 ? 'pp' : over > limitOvers - 10 ? 'death' : 'mid'
}

/** Default T20/ODI tables (approximate modern scoring), used until trained tables load. */
function defaultTable(limitBalls: number): OutcomeTable {
  const t20 = limitBalls <= 130
  const base = (rpb: number, wkt: number): Partial<Record<OutcomeKey, number>> => {
    const four = rpb * 0.11, six = rpb * (t20 ? 0.05 : 0.025)
    const extras = 0.045
    const rest = 1 - wkt - extras - four - six
    const one = rest * 0.45, two = rest * 0.08, three = rest * 0.01
    return { '0': Math.max(0.05, rest - one - two - three), '1': one, '2': two, '3': three, '4': four, '6': six, W: wkt, wd: 0.025, nb: 0.005, lb: 0.015 }
  }
  const mk = (pp: number, mid: number, death: number, wp: number, wm: number, wd: number) => {
    const scale = { '0-2': 1, '3-5': 0.96, '6-7': 0.88, '8-9': 0.75 } as Record<string, number>
    const wscale = { '0-2': 1, '3-5': 1.08, '6-7': 1.25, '8-9': 1.5 } as Record<string, number>
    const out: OutcomeTable = {}
    for (const [ph, rpb, w] of [['pp', pp, wp], ['mid', mid, wm], ['death', death, wd]] as [string, number, number][]) {
      out[ph] = {}
      for (const b of Object.keys(scale)) out[ph][b] = base(rpb * scale[b], w * wscale[b])
    }
    return out
  }
  return t20 ? mk(1.32, 1.3, 1.62, 0.045, 0.048, 0.085) : mk(0.92, 0.9, 1.25, 0.022, 0.026, 0.05)
}

const OUTCOMES = new Set(['0', '1', '2', '3', '4', '6', 'W', 'wd', 'nb', 'lb'])

function sampler(dist: Partial<Record<OutcomeKey, number>>) {
  const keys = (Object.keys(dist) as OutcomeKey[]).filter((k) => OUTCOMES.has(k))
  const cum: number[] = []
  let s = 0
  for (const k of keys) {
    s += dist[k] ?? 0
    cum.push(s)
  }
  return (u: number) => {
    const x = u * s
    for (let i = 0; i < cum.length; i++) if (x <= cum[i]) return keys[i]
    return keys[keys.length - 1]
  }
}

export interface SimState {
  runs: number
  wkts: number
  legal: number // legal balls bowled
  limit: number // ball limit
  target?: number
}

export interface SimResult {
  finals: number[]
  winPct: number | null // chase only
  bands: { over: number; p10: number; p25: number; p50: number; p75: number; p90: number }[]
  mean: number
}

export function simulate(state: SimState, trained?: OutcomeTables | null, n = 2500): SimResult {
  const tbl: OutcomeTable = trained?.tables && Object.keys(trained.tables).length ? (trained.tables as unknown as OutcomeTable) : defaultTable(state.limit)
  const limitOvers = Math.round(state.limit / 6)
  const ph = trained?.phases
  const phaseFor = (over: number) => (ph ? (over <= ph.pp[1] ? 'pp' : over >= ph.death[0] ? 'death' : 'mid') : phaseOf(over, limitOvers))
  // expected total runs on extras (wide/no-ball/bye) from the data, e.g. a no-ball averages ~2.6
  const extra = trained?.extraRuns ?? { wd: 1, nb: 1, lb: 1 }
  const extraRuns = (mean: number) => Math.floor(mean) + (Math.random() < mean - Math.floor(mean) ? 1 : 0)
  const samplers = new Map<string, (u: number) => OutcomeKey>()
  const pick = (over: number, w: number) => {
    const p = phaseFor(over)
    const b = wktBucket(w)
    const k = `${p}|${b}`
    let s = samplers.get(k)
    if (!s) {
      s = sampler(tbl[p]?.[b] ?? tbl.mid?.['0-2'] ?? defaultTable(state.limit).mid['0-2'])
      samplers.set(k, s)
    }
    return s
  }
  const startOver = Math.floor(state.legal / 6)
  const overs = limitOvers - startOver
  const atOver: number[][] = Array.from({ length: overs + 1 }, () => [])
  const finals: number[] = []
  let wins = 0
  for (let i = 0; i < n; i++) {
    let runs = state.runs, w = state.wkts, legal = state.legal
    atOver[0].push(runs)
    while (legal < state.limit && w < 10 && !(state.target && runs >= state.target)) {
      const over = Math.floor(legal / 6) + 1
      const o = pick(over, w)(Math.random())
      if (o === 'wd' || o === 'nb') runs += extraRuns(extra[o])
      else {
        legal++
        if (o === 'W') w++
        else if (o === 'lb') runs += extraRuns(extra.lb)
        else runs += +o
        if (legal % 6 === 0) atOver[Math.floor(legal / 6) - startOver]?.push(runs)
      }
    }
    // pad remaining overs so bands stay continuous
    for (let k = Math.ceil(legal / 6) - startOver + 1; k <= overs; k++) atOver[k]?.push(runs)
    finals.push(runs)
    if (state.target && runs >= state.target) wins++
  }
  const q = (arr: number[], p: number) => {
    if (!arr.length) return 0
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(p * s.length))]
  }
  const bands = atOver
    .map((arr, k) => ({ over: startOver + k, p10: q(arr, 0.1), p25: q(arr, 0.25), p50: q(arr, 0.5), p75: q(arr, 0.75), p90: q(arr, 0.9) }))
    .filter((_, k) => atOver[k].length)
  return { finals, winPct: state.target ? wins / n : null, bands, mean: finals.reduce((a, b) => a + b, 0) / Math.max(1, finals.length) }
}

/* ---------------- DLS-style resources ---------------- */

export type ExpectedTable = number[][] // [ballsLeft/6 step][wktsLost] (model.expected.table)

/** Resources remaining (fraction of a full innings) with `ballsLeft` and `wktsLost`. */
export function resources(ballsLeft: number, wktsLost: number, limit: number, table?: ExpectedTable | null) {
  if (table?.length) {
    const full = table[Math.min(table.length - 1, Math.round(limit / 6))]?.[0] ?? 1
    const step = Math.min(table.length - 1, Math.max(0, Math.round(ballsLeft / 6)))
    return (table[step]?.[Math.min(9, wktsLost)] ?? 0) / full
  }
  const full = expectedRuns(limit, 10, limit)
  return expectedRuns(ballsLeft, 10 - wktsLost, limit) / full
}

/** Revised target when team 2's innings is reduced to `newLimit` balls before it starts. */
export function revisedTarget(team1: number, limit: number, newLimit: number, table?: ExpectedTable | null) {
  const r2 = resources(newLimit, 0, limit, table)
  return Math.floor(team1 * r2) + 1
}

/** Par score if play stopped now for good (team 2 at `legal` balls, `wkts` down). */
export function parScore(team1: number, limit: number, legal: number, wkts: number, table?: ExpectedTable | null) {
  const used = 1 - resources(limit - legal, wkts, limit, table)
  return Math.floor(team1 * used)
}
