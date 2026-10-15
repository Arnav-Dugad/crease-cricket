import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BatAgg, BowlAgg, TeamAgg } from '../lib/season'
import { Legend, RadarChart, WagonWheel } from './charts/Charts'
import { Avatar, TeamLogo } from './Media'
import { Reveal, Skel } from './UI'

type Season = { loaded: number; total: number; bat: BatAgg[]; bowl: BowlAgg[]; teams: TeamAgg[]; highs: { team: string; teamId: string; runs: number; wkts: number; opp: string }[] }

function Progress({ s }: { s: Season }) {
  if (s.loaded >= s.total) return null
  return (
    <div className="row gap-12 foot muted" style={{ marginBottom: 16 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 99, background: 'var(--fill-2)', overflow: 'hidden' }}>
        <motion.div style={{ height: '100%', background: 'var(--accent)', borderRadius: 99 }} animate={{ width: `${(s.loaded / Math.max(1, s.total)) * 100}%` }} />
      </div>
      Analysing {s.loaded}/{s.total} matches
    </div>
  )
}

function LeaderCard<T extends { id: string; name: string; team: string; teamId: string }>({
  title,
  rows,
  value,
  sub,
  colorOf,
}: {
  title: string
  rows: T[]
  value: (r: T) => string
  sub: (r: T) => string
  colorOf: (teamId: string) => string
}) {
  if (!rows.length) return null
  const [top, ...rest] = rows
  return (
    <div className="card leader-card">
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <Link to={`/player/${top.id}`} className="row gap-14" style={{ gap: 14, marginBottom: 14 }}>
        <Avatar id={top.id} name={top.name} size={64} ring={colorOf(top.teamId)} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="headline ellipsis">{top.name}</div>
          <div className="cap faint">
            {top.team} · {sub(top)}
          </div>
        </div>
        <div className="tnum" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.04em' }}>
          {value(top)}
        </div>
      </Link>
      <div className="stack gap-8">
        {rest.map((r, i) => (
          <Link key={r.id} to={`/player/${r.id}`} className="row gap-10 foot">
            <span className="tnum faint" style={{ width: 14 }}>
              {i + 2}
            </span>
            <Avatar id={r.id} name={r.name} size={26} />
            <span className="grow ellipsis" style={{ fontWeight: 500 }}>
              {r.name} <span className="faint">{r.team}</span>
            </span>
            <span className="tnum" style={{ fontWeight: 700 }}>
              {value(r)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function SeasonLeaders({ s }: { s: Season }) {
  const colorOf = (id: string) => s.teams.find((t) => t.id === id)?.color ?? 'var(--accent)'
  const minBalls = Math.max(30, Math.round(Math.max(0, ...s.bat.map((b) => b.balls)) * 0.12))
  const minBowl = Math.max(36, Math.round(Math.max(0, ...s.bowl.map((b) => b.balls)) * 0.2))
  const L = useMemo(
    () => ({
      runs: [...s.bat].sort((a, b) => b.runs - a.runs).slice(0, 5),
      wkts: [...s.bowl].sort((a, b) => b.wkts - a.wkts || a.runs - b.runs).slice(0, 5),
      sr: s.bat.filter((b) => b.balls >= minBalls).sort((a, b) => b.runs / b.balls - a.runs / a.balls).slice(0, 5),
      econ: s.bowl.filter((b) => b.balls >= minBowl).sort((a, b) => a.runs / a.balls - b.runs / b.balls).slice(0, 5),
      sixes: [...s.bat].sort((a, b) => b.sixes - a.sixes).slice(0, 5),
      hs: [...s.bat].sort((a, b) => b.hs - a.hs).slice(0, 5),
      best: [...s.bowl].sort((a, b) => b.best.w - a.best.w || a.best.r - b.best.r).slice(0, 5),
      avg: s.bat.filter((b) => b.inns >= 3 && b.outs > 0).sort((a, b) => b.runs / b.outs - a.runs / a.outs).slice(0, 5),
    }),
    [s.bat, s.bowl, minBalls, minBowl],
  )
  if (!s.loaded) return <Skel h={300} r={24} />
  return (
    <div>
      <Progress s={s} />
      <div className="grid cols-2">
        <Reveal>
          <LeaderCard title="Most runs" rows={L.runs} value={(r) => String(r.runs)} sub={(r) => `${r.inns} inns · SR ${((r.runs / Math.max(1, r.balls)) * 100).toFixed(0)}`} colorOf={colorOf} />
        </Reveal>
        <Reveal delay={0.04}>
          <LeaderCard title="Most wickets" rows={L.wkts} value={(r) => String(r.wkts)} sub={(r) => `econ ${((r.runs / Math.max(1, r.balls)) * 6).toFixed(2)}`} colorOf={colorOf} />
        </Reveal>
        <Reveal>
          <LeaderCard title={`Best strike rate (min ${minBalls} balls)`} rows={L.sr} value={(r) => ((r.runs / r.balls) * 100).toFixed(0)} sub={(r) => `${r.runs} off ${r.balls}`} colorOf={colorOf} />
        </Reveal>
        <Reveal delay={0.04}>
          <LeaderCard title={`Best economy (min ${Math.round(minBowl / 6)} overs)`} rows={L.econ} value={(r) => ((r.runs / r.balls) * 6).toFixed(2)} sub={(r) => `${r.wkts} wkts`} colorOf={colorOf} />
        </Reveal>
        <Reveal>
          <LeaderCard title="Most sixes" rows={L.sixes} value={(r) => String(r.sixes)} sub={(r) => `${r.fours} fours`} colorOf={colorOf} />
        </Reveal>
        <Reveal delay={0.04}>
          <LeaderCard title="Best figures" rows={L.best} value={(r) => `${r.best.w}/${r.best.r}`} sub={(r) => `${r.wkts} wkts in all`} colorOf={colorOf} />
        </Reveal>
        <Reveal>
          <LeaderCard title="Highest scores" rows={L.hs} value={(r) => `${r.hs}${r.hsNotOut ? '*' : ''}`} sub={(r) => `${r.hundreds} × 100 · ${r.fifties} × 50`} colorOf={colorOf} />
        </Reveal>
        {L.avg.length > 0 && (
          <Reveal delay={0.04}>
            <LeaderCard title="Best average (min 3 inns)" rows={L.avg} value={(r) => (r.runs / r.outs).toFixed(1)} sub={(r) => `${r.runs} runs`} colorOf={colorOf} />
          </Reveal>
        )}
      </div>
    </div>
  )
}

const AXES = ['Run rate', 'Boundary %', 'Sixes / match', 'Economy', 'Dot-ball %', 'Wickets / match']

export function SeasonInsights({ s }: { s: Season }) {
  const teams = useMemo(() => [...s.teams].sort((a, b) => b.wins / b.matches - a.wins / a.matches), [s.teams])
  const [sel, setSel] = useState<string[] | null>(null)
  const chosen = (sel ?? teams.slice(0, 3).map((t) => t.id)).filter((id) => teams.some((t) => t.id === id))
  const metrics = useMemo(() => {
    const raw = teams.map((t) => ({
      id: t.id,
      v: [
        (t.runs / Math.max(1, t.ballsFaced)) * 6,
        ((t.fours * 4 + t.sixes * 6) / Math.max(1, t.runs)) * 100,
        t.sixes / Math.max(1, t.matches),
        (t.conceded / Math.max(1, t.ballsBowled)) * 6,
        (t.dotsBowled / Math.max(1, t.ballsBowled)) * 100,
        t.wktsTaken / Math.max(1, t.matches),
      ],
    }))
    const lo = AXES.map((_, i) => Math.min(...raw.map((r) => r.v[i])))
    const hi = AXES.map((_, i) => Math.max(...raw.map((r) => r.v[i])))
    // economy: lower is better, so invert it
    return new Map(raw.map((r) => [r.id, { raw: r.v, norm: r.v.map((x, i) => { const n = hi[i] === lo[i] ? 0.6 : (x - lo[i]) / (hi[i] - lo[i]); return 0.15 + 0.85 * (i === 3 ? 1 - n : n) }) }]))
  }, [teams])
  if (!s.loaded) return <Skel h={360} r={24} />
  const toggle = (id: string) => setSel((cur) => {
    const c = cur ?? chosen
    return c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-4)
  })
  return (
    <div className="stack gap-24">
      <Progress s={s} />
      <div className="card pad">
        <div className="row between wrap gap-12" style={{ marginBottom: 12 }}>
          <div>
            <div className="title3">Team profiles</div>
            <div className="foot faint">Each axis is scaled from the season’s worst (centre) to best (edge) · economy inverted so bigger is better</div>
          </div>
        </div>
        <div className="scroll-x" style={{ marginBottom: 12 }}>
          {teams.map((t) => (
            <button key={t.id} className={`chip ${chosen.includes(t.id) ? 'on' : ''}`} onClick={() => toggle(t.id)}>
              <TeamLogo src={t.logo} name={t.name} color={t.color} size={20} flat />
              {t.abbr}
            </button>
          ))}
        </div>
        <div className="row gap-24 wrap center" style={{ alignItems: 'center' }}>
          <RadarChart axes={AXES} series={chosen.map((id) => { const t = teams.find((x) => x.id === id)!; return { label: t.abbr, color: t.color, values: metrics.get(id)!.norm } })} size={360} />
          <div className="table-wrap" style={{ flex: '1 1 320px' }}>
            <table className="tbl" style={{ fontSize: 14 }}>
              <thead>
                <tr>
                  <th>Metric</th>
                  {chosen.map((id) => (
                    <th key={id}>{teams.find((t) => t.id === id)?.abbr}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AXES.map((a, i) => (
                  <tr key={a}>
                    <td className="l muted">{a}</td>
                    {chosen.map((id) => (
                      <td key={id} className="tnum" style={{ fontWeight: 600 }}>
                        {metrics.get(id)!.raw[i].toFixed(i === 2 || i === 5 ? 1 : i === 0 || i === 3 ? 2 : 0)}
                        {i === 1 || i === 4 ? '%' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Legend items={chosen.map((id) => { const t = teams.find((x) => x.id === id)!; return { label: t.name, color: t.color } })} />
        </div>
      </div>

      <div>
        <div className="title3" style={{ marginBottom: 4 }}>
          Where teams score
        </div>
        <div className="foot faint" style={{ marginBottom: 14 }}>
          Season runs by scoring zone (right-hander’s view) — the gaps a field setting has to cover
        </div>
        <div className="grid auto">
          {teams
            .filter((t) => t.zones.some((z) => z > 0))
            .map((t) => (
              <div key={t.id} className="card pad">
                <div className="row gap-10" style={{ marginBottom: 8 }}>
                  <TeamLogo src={t.logo} name={t.name} color={t.color} size={28} />
                  <span className="headline grow">{t.name}</span>
                </div>
                <WagonWheel zones={t.zones} color={t.color} />
              </div>
            ))}
        </div>
      </div>

      {s.highs.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="group-head">
            <div className="title3">Highest totals</div>
          </div>
          <div className="list">
            {s.highs.map((h, i) => (
              <div key={i} className="lrow">
                <span className="tnum faint" style={{ width: 16 }}>
                  {i + 1}
                </span>
                <span className="grow" style={{ fontWeight: 600 }}>
                  {h.team} <span className="faint" style={{ fontWeight: 400 }}>v {h.opp}</span>
                </span>
                <b className="tnum">
                  {h.runs}
                  {h.wkts < 10 ? `/${h.wkts}` : ''}
                </b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
