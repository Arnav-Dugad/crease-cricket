/* eslint-disable @typescript-eslint/no-explicit-any */
import { teamColor } from './normalize'

type J = any

export interface BatEntry {
  id: string
  name: string
  short: string
  headshot?: string
  runs: number
  balls: number
  fours: number
  sixes: number
  sr: string
  minutes: number
  out: string
  notOut: boolean
  active: boolean
  order: number
  captain: boolean
  keeper: boolean
  wagon: number[]
  /** per zone: counts of scoring shots by run value (index = runs) */
  wagonShots: number[][]
  control?: number
  shot?: string
  summary?: number[]
  dotPct?: number
  scoring?: number
  bowlerId?: string
  fielderIds: string[]
}

export interface BowlEntry {
  id: string
  name: string
  headshot?: string
  overs: string
  balls: number
  maidens: number
  runs: number
  wkts: number
  econ: string
  dots: number
  fours: number
  sixes: number
  wides: number
  noballs: number
  order: number
  active: boolean
  pitchL?: number[][][]
  pitchR?: number[][][]
  vsL?: { balls: number; wickets: number; economyRate: number; conceded: number }
  vsR?: { balls: number; wickets: number; economyRate: number; conceded: number }
}

export interface InningsCard {
  period: number
  teamId: string
  team: string
  abbr: string
  logo?: string
  color: string
  runs: number
  wkts: number
  overs: string
  rr: string
  target?: number
  extras: { total: number; b: number; lb: number; w: number; nb: number; pen: number }
  batting: BatEntry[]
  yetToBat: { id: string; name: string }[]
  bowling: BowlEntry[]
  desc?: string
}

export interface SquadPlayer {
  id: string
  name: string
  role: string
  roleAbbr: string
  captain: boolean
  keeper: boolean
  styles: string[]
  headshot?: string
  starter: boolean
}

const stat = (s: J) => {
  const out: Record<string, J> = {}
  for (const c of s?.categories ?? []) for (const x of c.stats ?? []) out[x.name] = x.value
  return out
}

export function buildScorecards(summary: J): InningsCard[] {
  const comp = summary?.header?.competitions?.[0]
  const rosters: J[] = summary?.rosters ?? []
  if (!comp) return []
  const cards = new Map<number, InningsCard>()

  for (const c of comp.competitors ?? []) {
    const t = c.team ?? {}
    for (const l of c.linescores ?? []) {
      if (!l.isBatting) continue
      const st = stat(l.statistics)
      if (!(+l.runs || +l.wickets || +l.overs || st.balls)) continue
      cards.set(+l.period, {
        period: +l.period,
        teamId: String(t.id),
        team: t.displayName,
        abbr: t.abbreviation,
        logo: t.logos?.[0]?.href,
        color: teamColor(t.color, t.displayName ?? ''),
        runs: +l.runs || 0,
        wkts: +l.wickets || 0,
        overs: String(st.overs ?? l.overs ?? ''),
        rr: st.runRate != null ? Number(st.runRate).toFixed(2) : '',
        target: +l.target || undefined,
        extras: { total: +st.extras || 0, b: +st.byes || 0, lb: +st.legbyes || 0, w: +st.wides || 0, nb: +st.noballs || 0, pen: +st.penalties || 0 },
        batting: [],
        yetToBat: [],
        bowling: [],
        desc: l.description,
      })
    }
  }

  for (const r of rosters) {
    const teamId = String(r.team?.id)
    for (const p of r.roster ?? []) {
      const a = p.athlete ?? {}
      const keeper = p.position?.abbreviation === 'WK' || /wicket/i.test(a.position?.name ?? '')
      for (const ls of p.linescores ?? []) {
        const period = +ls.period
        const s = ls.linescores?.[0]?.statistics
        if (!s) continue
        const st = stat(s)
        const card = cards.get(period)
        if (!card) continue
        if (card.teamId === teamId) {
          if (+st.batted === 1) {
            const bt = s.batting ?? {}
            const notOut = !+st.outs
            card.batting.push({
              id: String(a.id),
              name: a.displayName,
              short: a.battingName ?? a.displayName,
              headshot: a.headshot?.href,
              runs: +st.runs || 0,
              balls: +st.ballsFaced || 0,
              fours: +st.fours || 0,
              sixes: +st.sixes || 0,
              sr: st.strikeRate != null && st.ballsFaced ? Number(st.strikeRate).toFixed(1) : '-',
              minutes: +st.minutes || 0,
              out: (bt.outDetails?.shortText ?? (notOut ? 'not out' : String(st.dismissalCard ?? ''))).replace(/&dagger;/g, '†'),
              notOut,
              active: !!bt.active,
              order: +st.battingPosition || +bt.order || 99,
              captain: !!p.captain,
              keeper,
              wagon: (bt.wagonZone ?? []).map((z: J) => +z.runs || 0),
              wagonShots: (bt.wagonZone ?? []).map((z: J) => (z.runsSummary ?? []).map((x: J) => +x || 0)),
              control: bt.controlPercentage,
              shot: bt.preferredShot?.shotName,
              summary: (bt.runsSummary ?? []).map((x: J) => +x || 0),
              dotPct: bt.dotBallPercentage,
              scoring: bt.scoringShots,
              bowlerId: bt.outDetails?.bowler?.id,
              fielderIds: (bt.outDetails?.fielders ?? []).map((f: J) => String(f.athlete?.id)),
            })
          } else {
            card.yetToBat.push({ id: String(a.id), name: a.displayName })
          }
        } else if (+st.balls > 0 || +st.inningsBowled === 1) {
          const bw = s.bowling ?? {}
          card.bowling.push({
            id: String(a.id),
            name: a.displayName,
            headshot: a.headshot?.href,
            overs: String(st.overs ?? ''),
            balls: +st.balls || 0,
            maidens: +st.maidens || 0,
            runs: +st.conceded || 0,
            wkts: +st.wickets || 0,
            econ: st.economyRate != null && st.economyRate !== '-' ? Number(st.economyRate).toFixed(2) : '-',
            dots: +st.dots || 0,
            fours: +st.foursConceded || 0,
            sixes: +st.sixesConceded || 0,
            wides: +st.wides || 0,
            noballs: +st.noballs || 0,
            order: +st.bowlingPosition || +bw.order || 99,
            active: !!bw.active,
            pitchL: bw.pitchMapLhb,
            pitchR: bw.pitchMapRhb,
            vsL: bw.overallLhb,
            vsR: bw.overallRhb,
          })
        }
      }
    }
  }

  const out = [...cards.values()].sort((a, b) => a.period - b.period)
  for (const c of out) {
    c.batting.sort((a, b) => a.order - b.order)
    c.bowling.sort((a, b) => a.order - b.order)
    if (!c.extras.total) {
      const sum = c.batting.reduce((s, b) => s + b.runs, 0)
      c.extras.total = Math.max(0, c.runs - sum)
    }
  }
  return out
}

export function buildSquads(summary: J): { teamId: string; team: string; logo?: string; color: string; players: SquadPlayer[] }[] {
  return (summary?.rosters ?? []).map((r: J) => ({
    teamId: String(r.team?.id),
    team: r.team?.displayName,
    logo: r.team?.logos?.[0]?.href,
    color: teamColor(r.team?.color, r.team?.displayName ?? ''),
    players: (r.roster ?? []).map((p: J) => ({
      id: String(p.athlete?.id),
      name: p.athlete?.displayName,
      role: p.athlete?.position?.name ?? p.position?.name ?? '',
      roleAbbr: p.position?.abbreviation ?? p.athlete?.position?.abbreviation ?? '',
      captain: !!p.captain,
      keeper: p.position?.abbreviation === 'WK',
      styles: (p.athlete?.style ?? []).map((s: J) => s.description),
      headshot: p.athlete?.headshot?.href,
      starter: p.starter !== false,
    })),
  }))
}

export interface Leader {
  id: string
  name: string
  headshot?: string
  value: string
  stat: string
  team: string
  teamColor: string
  period: number
}

export function buildLeaders(summary: J): Leader[] {
  const out: Leader[] = []
  for (const t of summary?.leaders ?? []) {
    const team = t.team?.abbreviation ?? ''
    for (const ls of t.linescores ?? []) {
      for (const cat of ls.leaders ?? []) {
        const top = cat.leaders?.[0]
        if (!top || !+top.value) continue
        out.push({
          id: String(top.athlete?.id),
          name: top.athlete?.displayName,
          headshot: top.athlete?.headshot?.href,
          value: top.displayValue,
          stat: cat.displayName,
          team,
          teamColor: teamColor(t.team?.color, t.team?.displayName ?? ''),
          period: +ls.period,
        })
      }
    }
  }
  return out
}

export function noteOf(summary: J, type: string): string | undefined {
  return summary?.notes?.find((n: J) => n.type === type)?.text
}
