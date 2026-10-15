import { useMemo, useState } from 'react'
import { isLegal } from '../../lib/analytics'
import { modelFor, useModel } from '../../lib/hist'
import { parScore, revisedTarget, simulate } from '../../lib/sim'
import type { MatchCtx } from '../../pages/Match'
import { FanChart } from '../charts/Charts'
import { Segmented } from '../UI'

/** Monte Carlo projection of the current (or chosen) innings + a DLS-style rain calculator. */
export function Simulator({ ctx, cutoff }: { ctx: MatchCtx; cutoff?: number }) {
  const model = useModel()
  const innings = ctx.innings
  const [pick, setPick] = useState<number | null>(null)
  const inn = innings.find((i) => i.inn === pick) ?? innings[innings.length - 1]
  const limit = inn?.limit ?? 0
  const fm = modelFor(model.data, limit, ctx.m.women)
  const [runId, setRunId] = useState(0)

  // Simulate from the state at the replay cutoff (or now). For finished innings, simulate from the halfway point.
  const state = useMemo(() => {
    if (!inn || !limit || limit > 300) return null
    const done = inn.wkts >= 10 || inn.legal >= limit || innings.indexOf(inn) < innings.length - 1 || ctx.m.state === 'post'
    let balls = inn.balls
    if (cutoff != null) balls = balls.slice(0, Math.max(1, cutoff))
    else if (done) {
      let legal = 0
      const half = Math.floor(limit / 2)
      balls = balls.filter((b) => (isLegal(b) ? ++legal : legal) <= half)
    }
    const last = balls[balls.length - 1]
    if (!last) return null
    return { runs: last.runs, wkts: last.wkts, legal: balls.filter(isLegal).length, limit: last.limit || limit, target: last.target || undefined, from: done && cutoff == null }
  }, [inn, limit, cutoff, innings, ctx.m.state])

  const sim = useMemo(() => (state ? simulate(state, fm?.outcomes, 3000) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, fm, runId])

  if (!inn || !state || !sim) return null
  const actual = inn.overs.map((o, k) => ({ over: k + 1, runs: o.total }))
  actual.unshift({ over: 0, runs: 0 })
  const color = ctx.colorOf(inn.teamId)
  const p50 = sim.bands[sim.bands.length - 1]?.p50
  const p10 = sim.bands[sim.bands.length - 1]?.p10
  const p90 = sim.bands[sim.bands.length - 1]?.p90
  return (
    <div className="card pad stack gap-16">
      <div className="row between wrap gap-12">
        <div>
          <div className="title3">Innings simulator</div>
          <div className="foot faint">
            3,000 Monte Carlo runs of the rest of the innings from {state.runs}/{state.wkts} after {Math.floor(state.legal / 6)}.{state.legal % 6} ov ·{' '}
            {fm ? `ball outcomes from ${fm.outcomes.since}+ ${fm.format} data` : 'default outcome model'}
            {state.from ? ' · replayed from the halfway point' : ''}
          </div>
        </div>
        <div className="row gap-8">
          {innings.length > 1 && (
            <Segmented
              value={String(inn.inn)}
              onChange={(v) => setPick(+v)}
              layout="sim-inn"
              options={innings.map((i) => ({ value: String(i.inn), label: i.team }))}
            />
          )}
          <button className="chip" onClick={() => setRunId((n) => n + 1)}>
            Re-run
          </button>
        </div>
      </div>
      <div className="grid cols-3" style={{ gap: 10 }}>
        <div className="mini-stat">
          <div className="tnum" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>{p50}</div>
          <div className="cap faint">Most likely total</div>
        </div>
        <div className="mini-stat">
          <div className="tnum" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>
            {p10}–{p90}
          </div>
          <div className="cap faint">80% range</div>
        </div>
        <div className="mini-stat">
          <div className="tnum" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: sim.winPct != null ? (sim.winPct > 0.5 ? 'var(--green)' : 'var(--red)') : undefined }}>
            {sim.winPct != null ? `${Math.round(sim.winPct * 100)}%` : `${Math.round(sim.mean)}`}
          </div>
          <div className="cap faint">{sim.winPct != null ? 'Chase completed' : 'Mean total'}</div>
        </div>
      </div>
      <FanChart bands={sim.bands} limitOvers={Math.round(state.limit / 6)} target={state.target} color={color} actual={state.from || cutoff != null ? actual : undefined} />
      <div className="legend">
        <span>
          <i style={{ background: color, opacity: 0.45 }} />
          50% of simulations
        </span>
        <span>
          <i style={{ background: color, opacity: 0.2 }} />
          80%
        </span>
        <span>
          <i style={{ background: color }} />
          median (dashed)
        </span>
        {(state.from || cutoff != null) && (
          <span>
            <i style={{ background: 'var(--text)' }} />
            what actually happened
          </span>
        )}
      </div>
      <DlsCalculator ctx={ctx} />
    </div>
  )
}

function DlsCalculator({ ctx }: { ctx: MatchCtx }) {
  const model = useModel()
  const first = ctx.innings[0]
  const second = ctx.innings[1]
  const limit = first?.limit ?? 0
  const fm = modelFor(model.data, limit, ctx.m.women)
  const table = fm?.expected?.table
  const fullOvers = Math.round(limit / 6)
  const [overs, setOvers] = useState(Math.max(5, Math.round(fullOvers * 0.75)))
  if (!first || !limit || limit > 300) return null
  const s = first.total
  const t = revisedTarget(s, limit, overs * 6, table)
  const legal2 = second ? second.legal : 0
  const par = second ? parScore(s, limit, legal2, second.wkts, table) : null
  return (
    <div className="dls">
      <div className="row between wrap gap-8">
        <div className="headline">Rain calculator</div>
        <span className="cap faint">DLS-style estimate from historical resource tables — not the official DLS Professional Edition</span>
      </div>
      <div className="row gap-16 wrap" style={{ alignItems: 'center' }}>
        <label className="stack gap-4 grow" style={{ minWidth: 220 }}>
          <span className="foot muted">
            If {second?.team ?? 'the chasing side'} get <b style={{ color: 'var(--text)' }}>{overs} overs</b>
          </span>
          <input type="range" min={5} max={fullOvers} value={overs} onChange={(e) => setOvers(+e.target.value)} className="range" aria-label="Overs available to the chasing side" />
        </label>
        <div className="mini-stat" style={{ minWidth: 130 }}>
          <div className="tnum" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>{t}</div>
          <div className="cap faint">Revised target</div>
        </div>
        {par != null && second && second.inn === 2 && legal2 > 0 && (
          <div className="mini-stat" style={{ minWidth: 130 }}>
            <div className="tnum" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: second.total >= par ? 'var(--green)' : 'var(--red)' }}>{par}</div>
            <div className="cap faint">
              Par now ({second.total >= par ? `ahead by ${second.total - par}` : `behind by ${par - second.total}`})
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
