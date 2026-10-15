import { useEffect, useMemo, useState } from 'react'
import { fetchJSON } from './api'
import { teamColor } from './normalize'
import { buildScorecards } from './scorecard'
import type { MatchLite } from './types'

/**
 * Season aggregates built from every completed match's scorecard (fetched through the edge
 * cache, four at a time, rendering progressively): leaders, team profiles and scoring zones.
 */

export interface BatAgg {
  id: string
  name: string
  team: string
  teamId: string
  inns: number
  runs: number
  balls: number
  outs: number
  fours: number
  sixes: number
  hs: number
  hsNotOut: boolean
  fifties: number
  hundreds: number
}
export interface BowlAgg {
  id: string
  name: string
  team: string
  teamId: string
  inns: number
  balls: number
  runs: number
  wkts: number
  dots: number
  best: { w: number; r: number }
}
export interface TeamAgg {
  id: string
  name: string
  abbr: string
  logo?: string
  color: string
  matches: number
  wins: number
  runs: number
  ballsFaced: number
  conceded: number
  ballsBowled: number
  fours: number
  sixes: number
  wktsTaken: number
  wktsLost: number
  dotsBowled: number
  zones: number[]
  highest: number
}

const oversToBalls = (o: string | number) => {
  const s = String(o)
  const [ov, b] = s.split('.')
  return (+ov || 0) * 6 + (+b || 0)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useSeasonAggregate(league: string, matches: MatchLite[], enabled: boolean, cap = 60) {
  const list = useMemo(() => matches.filter((m) => m.state === 'post').sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, cap), [matches, cap])
  const [docs, setDocs] = useState<Record<string, any>>({})
  useEffect(() => {
    if (!enabled || !list.length) return
    let alive = true
    const queue = list.filter((m) => !docs[m.id])
    let i = 0
    const worker = async () => {
      while (alive && i < queue.length) {
        const m = queue[i++]
        try {
          const d = await fetchJSON<any>(`/api/match/${league}/${m.id}`)
          if (alive) setDocs((prev) => ({ ...prev, [m.id]: { d, winner: m.teams.find((t) => t.winner)?.id } }))
        } catch {
          /* skip this match */
        }
      }
    }
    Promise.all([worker(), worker(), worker(), worker()])
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, list, league])

  return useMemo(() => {
    const bat = new Map<string, BatAgg>()
    const bowl = new Map<string, BowlAgg>()
    const teams = new Map<string, TeamAgg>()
    const highs: { team: string; teamId: string; runs: number; wkts: number; opp: string; date?: string }[] = []
    const team = (id: string, name: string, abbr: string, logo?: string, color?: string) => {
      let t = teams.get(id)
      if (!t) {
        t = { id, name, abbr, logo, color: teamColor(color, name), matches: 0, wins: 0, runs: 0, ballsFaced: 0, conceded: 0, ballsBowled: 0, fours: 0, sixes: 0, wktsTaken: 0, wktsLost: 0, dotsBowled: 0, zones: Array(8).fill(0), highest: 0 }
        teams.set(id, t)
      }
      return t
    }
    for (const { d, winner } of Object.values(docs)) {
      const cards = buildScorecards(d)
      const comps = d?.header?.competitions?.[0]?.competitors ?? []
      for (const c of comps) {
        const t = team(String(c.team?.id), c.team?.displayName, c.team?.abbreviation, c.team?.logos?.[0]?.href, c.team?.color)
        t.matches++
        if (winner && String(c.team?.id) === winner) t.wins++
      }
      for (const card of cards) {
        const batting = team(card.teamId, card.team, card.abbr, card.logo)
        const bowlingC = comps.find((c: any) => String(c.team?.id) !== card.teamId)
        const bowling = bowlingC ? team(String(bowlingC.team?.id), bowlingC.team?.displayName, bowlingC.team?.abbreviation, bowlingC.team?.logos?.[0]?.href, bowlingC.team?.color) : null
        const balls = oversToBalls(card.overs)
        batting.runs += card.runs
        batting.ballsFaced += balls
        batting.wktsLost += card.wkts
        batting.highest = Math.max(batting.highest, card.runs)
        highs.push({ team: card.team, teamId: card.teamId, runs: card.runs, wkts: card.wkts, opp: bowling?.abbr ?? '' })
        if (bowling) {
          bowling.conceded += card.runs
          bowling.ballsBowled += balls
          bowling.wktsTaken += card.wkts
        }
        for (const b of card.batting) {
          batting.fours += b.fours
          batting.sixes += b.sixes
          b.wagon.forEach((z, i) => (batting.zones[i] = (batting.zones[i] ?? 0) + z))
          let x = bat.get(b.id)
          if (!x) {
            x = { id: b.id, name: b.name, team: card.abbr, teamId: card.teamId, inns: 0, runs: 0, balls: 0, outs: 0, fours: 0, sixes: 0, hs: 0, hsNotOut: false, fifties: 0, hundreds: 0 }
            bat.set(b.id, x)
          }
          x.inns++
          x.runs += b.runs
          x.balls += b.balls
          x.outs += b.notOut ? 0 : 1
          x.fours += b.fours
          x.sixes += b.sixes
          if (b.runs > x.hs || (b.runs === x.hs && b.notOut)) {
            x.hs = b.runs
            x.hsNotOut = b.notOut
          }
          if (b.runs >= 100) x.hundreds++
          else if (b.runs >= 50) x.fifties++
        }
        for (const b of card.bowling) {
          if (bowling) bowling.dotsBowled += b.dots
          let x = bowl.get(b.id)
          if (!x) {
            x = { id: b.id, name: b.name, team: bowling?.abbr ?? '', teamId: bowling?.id ?? '', inns: 0, balls: 0, runs: 0, wkts: 0, dots: 0, best: { w: 0, r: 999 } }
            bowl.set(b.id, x)
          }
          x.inns++
          x.balls += b.balls
          x.runs += b.runs
          x.wkts += b.wkts
          x.dots += b.dots
          if (b.wkts > x.best.w || (b.wkts === x.best.w && b.runs < x.best.r)) x.best = { w: b.wkts, r: b.runs }
        }
      }
    }
    return {
      loaded: Object.keys(docs).length,
      total: list.length,
      bat: [...bat.values()],
      bowl: [...bowl.values()],
      teams: [...teams.values()].filter((t) => t.matches > 0),
      highs: highs.sort((a, b) => b.runs - a.runs).slice(0, 5),
    }
  }, [docs, list.length])
}
