import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { histFormat, playerFormatKey, useHistPlayers, type HistPlayer, type Matchup } from '../../lib/hist'
import { buildScorecards, buildSquads } from '../../lib/scorecard'
import { phaseOf } from '../../lib/sim'
import type { MatchCtx } from '../../pages/Match'
import { Icon } from '../Icon'
import { Avatar } from '../Media'

const sr = (m: Matchup) => (m[0] ? (m[1] / m[0]) * 100 : 0)

interface Candidate {
  id: string
  name: string
  oversLeft: number
  todayFig: string
  rpo: number // projected runs per over
  wkt: number // probability of at least one wicket in the over
  score: number
  reasons: string[]
}

/**
 * Ranks the fielding side's options for the next over. For each eligible bowler:
 *   runs/ball  = career rate in this phase, shrunk towards today's rate and blended with
 *                head-to-head history against the two batters at the crease
 *   wicket/ball = same blend for dismissals
 * Score = projected runs in the over − wicket chance × value of a wicket.
 */
function rankBowlers(ctx: MatchCtx, hist: Record<string, HistPlayer>): { candidates: Candidate[]; striker?: string; nonStriker?: string } {
  const last = ctx.balls[ctx.balls.length - 1]
  const inn = ctx.innings[ctx.innings.length - 1]
  if (!last || !inn || !inn.limit || inn.limit > 300) return { candidates: [] }
  const cards = buildScorecards(ctx.summary)
  const card = cards.find((c) => c.period === inn.inn)
  const squads = buildSquads(ctx.summary)
  const fielding = squads.find((s) => s.teamId !== inn.teamId)
  if (!fielding) return { candidates: [] }
  const maxOvers = Math.max(1, Math.round(inn.limit / 6 / 5))
  const nextOver = (last.oDone ? last.o : last.o - 1) + 1
  const lastBowler = last.oDone ? last.bowl?.id : null
  const phase = phaseOf(nextOver, Math.round(inn.limit / 6))
  const f = histFormat(ctx.m.format, inn.limit)
  const key = playerFormatKey(f, ctx.m.intl)
  const batters = [last.bat, last.nsb].filter(Boolean) as { id: string; n: string }[]
  const wicketValue = inn.limit <= 130 ? 9 : 7
  const out: Candidate[] = []
  for (const p of fielding.players) {
    if (!p.starter && !card?.bowling.some((b) => b.id === p.id)) continue
    const today = card?.bowling.find((b) => b.id === p.id)
    const bowledBalls = today?.balls ?? 0
    const oversLeft = maxOvers - Math.ceil(bowledBalls / 6)
    if (oversLeft <= 0 || p.id === lastBowler) continue
    const h = hist[p.id]
    const fmt = h?.formats[key] ?? h?.formats[f]
    const bowl = fmt?.bowl
    const isBowler = /BL|AR/.test(p.roleAbbr) || /bowl|all/i.test(p.role) || bowledBalls > 0 || (bowl?.balls ?? 0) > 300
    if (!isBowler) continue
    const ph = bowl?.phases?.[phase as 'pp' | 'mid' | 'death']
    const careerRpb = ph && ph.balls > 60 ? ph.runs / ph.balls : bowl?.balls ? bowl.runs / bowl.balls : inn.limit <= 130 ? 1.35 : 0.95
    const careerWpb = ph && ph.balls > 60 ? ph.wkts / ph.balls : bowl?.balls ? bowl.wkts / bowl.balls : 0.04
    // shrink towards today's figures as the match goes on
    const tw = bowledBalls / (bowledBalls + 18)
    let rpb = (1 - tw) * careerRpb + tw * (bowledBalls ? (today!.runs / bowledBalls) : careerRpb)
    let wpb = careerWpb
    const reasons: string[] = []
    for (const bt of batters) {
      const m = hist[bt.id]?.vs?.[p.id]
      if (m && m[0] >= 6) {
        const w = m[0] / (m[0] + 30)
        rpb = (1 - w / 2) * rpb + (w / 2) * (m[1] / m[0])
        wpb = (1 - w / 2) * wpb + (w / 2) * (m[2] / m[0])
        reasons.push(`${bt.n.split(' ').slice(-1)[0]}: ${m[1]} off ${m[0]}${m[2] ? `, out ${m[2]}×` : ''}`)
      }
    }
    if (ph && ph.balls > 60) reasons.unshift(`${phase === 'pp' ? 'Powerplay' : phase === 'death' ? 'Death' : 'Middle-overs'} economy ${((ph.runs / ph.balls) * 6).toFixed(1)}`)
    if (today && bowledBalls) reasons.push(`Today ${today.wkts}/${today.runs} (${today.overs})`)
    const rpo = rpb * 6
    const wkt = 1 - Math.pow(1 - wpb, 6)
    out.push({ id: p.id, name: p.name, oversLeft, todayFig: today ? `${today.wkts}-${today.runs}` : '—', rpo, wkt, score: rpo - wkt * wicketValue, reasons })
  }
  return { candidates: out.sort((a, b) => a.score - b.score), striker: last.bat?.id, nonStriker: last.nsb?.id }
}

export function WhoBowlsNext({ ctx }: { ctx: MatchCtx }) {
  const squads = useMemo(() => buildSquads(ctx.summary), [ctx.summary])
  const last = ctx.balls[ctx.balls.length - 1]
  const ids = useMemo(() => [...squads.flatMap((s) => s.players.map((p) => p.id)), last?.bat?.id, last?.nsb?.id], [squads, last?.bat?.id, last?.nsb?.id])
  const hist = useHistPlayers(ids)
  const { candidates } = useMemo(() => (hist.data ? rankBowlers(ctx, hist.data) : { candidates: [] }), [ctx, hist.data])
  if (!ctx.live || !candidates.length) return null
  const top = candidates.slice(0, 3)
  return (
    <div className="card pad">
      <div className="row between wrap gap-8" style={{ marginBottom: 14 }}>
        <div>
          <div className="title3">Who should bowl next?</div>
          <div className="foot faint">Career phase economy and wicket rate, today’s figures and head-to-head with the batters on strike</div>
        </div>
        <span className="badge">
          <Icon name="sparkles" size={12} /> Insight
        </span>
      </div>
      <div className="stack gap-10">
        {top.map((c, i) => (
          <motion.div key={c.id} className="row gap-14 option-row" style={{ gap: 14 }} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
            <span className="rank-dot">{i + 1}</span>
            <Link to={`/player/${c.id}`}>
              <Avatar id={c.id} name={c.name} size={44} />
            </Link>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-8 wrap">
                <span className="headline">{c.name}</span>
                <span className="cap faint">
                  {c.oversLeft} over{c.oversLeft > 1 ? 's' : ''} left · today {c.todayFig}
                </span>
              </div>
              <div className="foot muted ellipsis">{c.reasons.slice(0, 3).join(' · ') || 'Limited history in this format'}</div>
            </div>
            <div style={{ textAlign: 'right' }} className="tnum">
              <div style={{ fontWeight: 700, fontSize: 18 }}>{c.rpo.toFixed(1)}</div>
              <div className="cap faint">proj. runs</div>
            </div>
            <div style={{ textAlign: 'right', width: 64 }} className="tnum hide-sm">
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--red)' }}>{Math.round(c.wkt * 100)}%</div>
              <div className="cap faint">wicket</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/** Head-to-head history between this match's batters and bowlers (Cricsheet, 2015+). */
export function KeyMatchups({ ctx }: { ctx: MatchCtx }) {
  const squads = useMemo(() => buildSquads(ctx.summary), [ctx.summary])
  const ids = useMemo(() => squads.flatMap((s) => s.players.filter((p) => p.starter).map((p) => p.id)), [squads])
  const hist = useHistPlayers(ids)
  const rows = useMemo(() => {
    if (!hist.data || squads.length < 2) return []
    const out: { bat: { id: string; name: string; team: string }; bowl: { id: string; name: string }; m: Matchup }[] = []
    for (const [bi, bs] of squads.entries()) {
      const opp = squads[1 - bi]
      for (const p of bs.players) {
        const vs = hist.data[p.id]?.vs
        if (!vs) continue
        for (const q of opp.players) {
          const m = vs[q.id]
          if (m && m[0] >= 18) out.push({ bat: { id: p.id, name: p.name, team: bs.teamId }, bowl: { id: q.id, name: q.name }, m })
        }
      }
    }
    // most informative first: lots of balls, and lopsided either way
    return out.sort((a, b) => b.m[0] * (1 + Math.abs(sr(b.m) - 125) / 100 + b.m[2] * 0.3) - a.m[0] * (1 + Math.abs(sr(a.m) - 125) / 100 + a.m[2] * 0.3)).slice(0, 8)
  }, [hist.data, squads])
  if (!rows.length) return null
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="group-head">
        <div className="grow">
          <div className="title3">Key matchups</div>
          <div className="foot faint">Batter vs bowler, all formats since 2015 · Cricsheet</div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Batter</th>
              <th>Bowler</th>
              <th>Balls</th>
              <th>Runs</th>
              <th>Outs</th>
              <th>SR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bat.id + r.bowl.id}>
                <td className="l">
                  <Link to={`/player/${r.bat.id}`} className="row gap-10">
                    <Avatar id={r.bat.id} name={r.bat.name} size={30} ring={ctx.colorOf(r.bat.team)} />
                    <span style={{ fontWeight: 600 }}>{r.bat.name}</span>
                  </Link>
                </td>
                <td className="l">
                  <Link to={`/player/${r.bowl.id}`} className="row gap-10">
                    <Avatar id={r.bowl.id} name={r.bowl.name} size={30} />
                    <span>{r.bowl.name}</span>
                  </Link>
                </td>
                <td>{r.m[0]}</td>
                <td>{r.m[1]}</td>
                <td style={{ fontWeight: 700, color: r.m[2] >= 3 ? 'var(--red)' : undefined }}>{r.m[2]}</td>
                <td style={{ fontWeight: 700, color: sr(r.m) >= 150 ? 'var(--green)' : sr(r.m) < 100 ? 'var(--red)' : undefined }}>{sr(r.m).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
