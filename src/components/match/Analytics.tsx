import { useEffect, useMemo, useRef, useState } from 'react'
import { aggregate, ballLabel, biggestOver, isFour, isLegal, isSix, momentum, phaseStats, phasesFor, winProbSeries, type InningsAgg } from '../../lib/analytics'
import { Icon } from '../Icon'
import { ImpactTable, PartnershipPressure } from './Impact'
import { Simulator } from './Simulator'
import { buildScorecards, buildSquads } from '../../lib/scorecard'
import type { MatchCtx } from '../../pages/Match'
import { CompareBar, Donut, Legend, Manhattan, PitchMap, RunRateChart, WagonWheel, WormChart } from '../charts/Charts'
import { Avatar } from '../Media'
import { CountUp, Reveal, Segmented } from '../UI'

function StatGrid({ innings, colorOf }: { innings: InningsAgg[]; colorOf: (k: string) => string }) {
  const rows = innings.map((inn) => {
    const legal = inn.balls.filter(isLegal).length
    const bnd = inn.balls.filter((b) => isFour(b) || isSix(b))
    const bndRuns = bnd.reduce((s, b) => s + b.r, 0)
    const big = biggestOver(inn)
    return {
      inn,
      rr: legal ? (inn.total / legal) * 6 : 0,
      dotPct: legal ? (inn.dots / legal) * 100 : 0,
      bndPct: inn.total ? (bndRuns / inn.total) * 100 : 0,
      bpb: bnd.length ? legal / bnd.length : 0,
      big,
    }
  })
  const tile = (label: string, f: (r: (typeof rows)[0]) => number, dec = 0, suffix = '', sub?: (r: (typeof rows)[0]) => string) => (
    <div className="card stat-tile">
      <div className="l">{label}</div>
      {rows.map((r) => (
        <div key={r.inn.inn} className="row gap-8" style={{ alignItems: 'baseline' }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: colorOf(r.inn.teamId), flex: 'none', alignSelf: 'center' }} />
          <span className="v" style={{ fontSize: rows.length > 2 ? 20 : 26 }}>
            <CountUp value={f(r)} decimals={dec} />
            {suffix}
          </span>
          <span className="s ellipsis">
            {r.inn.team}
            {rows.length > 2 ? ` ${r.inn.inn}` : ''}
            {sub ? ` · ${sub(r)}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
  return (
    <div className="grid cols-4">
      {tile('Run rate', (r) => r.rr, 2)}
      {tile('Dot-ball %', (r) => r.dotPct, 0, '%')}
      {tile('Runs in boundaries', (r) => r.bndPct, 0, '%', (r) => `${r.inn.fours}×4 ${r.inn.sixes}×6`)}
      {tile('Biggest over', (r) => r.big?.runs ?? 0, 0, '', (r) => (r.big ? `over ${r.big.over}` : ''))}
    </div>
  )
}

function Phases({ innings, colorOf }: { innings: InningsAgg[]; colorOf: (k: string) => string }) {
  const lim = innings[0]?.limit
  const phases = phasesFor(lim)
  if (!phases.length || innings.length !== 2) return null
  const [a, b] = innings
  const colors: [string, string] = [colorOf(a.teamId), colorOf(b.teamId)]
  return (
    <div className="card pad">
      <div className="row between wrap gap-12" style={{ marginBottom: 18 }}>
        <div>
          <div className="title3">Phase battle</div>
          <div className="foot faint">Runs and wickets in each phase of the innings</div>
        </div>
        <Legend items={[{ label: a.team, color: colors[0] }, { label: b.team, color: colors[1] }]} />
      </div>
      <div className="grid cols-3" style={{ gap: 24 }}>
        {phases.map((ph) => {
          const sa = phaseStats(a, ph)
          const sb = phaseStats(b, ph)
          return (
            <div key={ph.name} className="stack gap-14" style={{ gap: 14 }}>
              <div className="row between">
                <span className="headline">{ph.name}</span>
                <span className="cap faint">
                  Overs {ph.from}–{ph.to}
                </span>
              </div>
              <CompareBar label="Runs" a={sa.runs} b={sb.runs} colors={colors} />
              <CompareBar label="Wickets" a={sa.wkts} b={sb.wkts} colors={colors} />
              <CompareBar label="Run rate" a={+sa.rr.toFixed(2)} b={+sb.rr.toFixed(2)} colors={colors} fmt={(v) => v.toFixed(2)} />
              <CompareBar label="Boundaries" a={sa.boundaries} b={sb.boundaries} colors={colors} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Momentum({ innings, colorOf }: { innings: InningsAgg[]; colorOf: (k: string) => string }) {
  return (
    <div className="grid cols-2">
      {innings.slice(-2).map((inn) => {
        const mo = momentum(inn)
        const delta = mo.rr - mo.overall
        const hot = delta > 1
        const cold = delta < -1
        return (
          <div key={inn.inn} className="card pad stack gap-8">
            <div className="row between">
              <span className="headline">
                <span style={{ color: colorOf(inn.teamId) }}>●</span> {inn.team} momentum
              </span>
              <span className={`badge ${hot ? 'live' : cold ? 'upcoming' : ''}`}>{hot ? 'Surging' : cold ? 'Slowing' : 'Steady'}</span>
            </div>
            <div className="row gap-24 tnum">
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>
                  {mo.runs}/{mo.wkts}
                </div>
                <div className="cap faint">Last {mo.overs} overs</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>{mo.rr.toFixed(2)}</div>
                <div className="cap faint">Recent RR</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {delta >= 0 ? '+' : ''}
                  {delta.toFixed(2)}
                </div>
                <div className="cap faint">vs innings RR</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Players({ ctx }: { ctx: MatchCtx }) {
  const cards = useMemo(() => buildScorecards(ctx.summary), [ctx.summary])
  const lefties = useMemo(() => {
    const s = new Set<string>()
    for (const t of buildSquads(ctx.summary)) for (const p of t.players) if (p.styles.some((x) => /left-hand bat/i.test(x))) s.add(p.id)
    return s
  }, [ctx.summary])
  const batters = cards.flatMap((c) => c.batting.filter((b) => b.balls > 0).map((b) => ({ ...b, period: c.period, teamId: c.teamId, abbr: c.abbr })))
  const bowlers = cards.flatMap((c) => c.bowling.filter((b) => b.balls > 0).map((b) => ({ ...b, period: c.period, abbr: c.abbr })))
  const [bi, setBi] = useState(() => batters.reduce((m, b, i) => (b.runs > batters[m].runs ? i : m), 0))
  const [wi, setWi] = useState(() => bowlers.reduce((m, b, i) => (b.wkts > bowlers[m].wkts || (b.wkts === bowlers[m].wkts && b.runs < bowlers[m].runs) ? i : m), 0))
  const bat = batters[bi]
  const bowl = bowlers[wi]
  const [pitch3d, setPitch3d] = useState(false)
  return (
    <div className="grid cols-2" style={{ alignItems: 'start' }}>
      {bat && (
        <div className="card pad stack gap-16">
          <div className="row between wrap gap-8">
            <div className="title3">Batter lens</div>
            <select className="chip" value={bi} onChange={(e) => setBi(+e.target.value)} style={{ border: 0, maxWidth: 220 }} aria-label="Choose batter">
              {batters.map((b, i) => (
                <option key={`${b.id}-${b.period}`} value={i}>
                  {b.name} · {b.runs} ({b.abbr}
                  {cards.length > 2 ? ` inn ${b.period}` : ''})
                </option>
              ))}
            </select>
          </div>
          <div className="row gap-14" style={{ gap: 14 }}>
            <Avatar src={bat.headshot} id={bat.id} name={bat.name} size={56} />
            <div className="grow">
              <div className="headline">{bat.name}</div>
              <div className="foot faint">{bat.out}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="tnum" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {bat.runs}
              </div>
              <div className="cap faint">
                {bat.balls} balls · SR {bat.sr}
              </div>
            </div>
          </div>
          <div className="grid cols-3" style={{ gap: 10 }}>
            <div className="stat-tile" style={{ padding: 12, background: 'var(--fill-2)', borderRadius: 14 }}>
              <div className="v" style={{ fontSize: 22 }}>{bat.control != null ? `${bat.control}%` : '–'}</div>
              <div className="s">In control</div>
            </div>
            <div className="stat-tile" style={{ padding: 12, background: 'var(--fill-2)', borderRadius: 14 }}>
              <div className="v" style={{ fontSize: 22 }}>{bat.dotPct != null ? `${bat.dotPct}%` : '–'}</div>
              <div className="s">Dot balls</div>
            </div>
            <div className="stat-tile" style={{ padding: 12, background: 'var(--fill-2)', borderRadius: 14 }}>
              <div className="v ellipsis" style={{ fontSize: 15, lineHeight: 1.6, textTransform: 'capitalize' }}>
                {bat.shot ?? '–'}
              </div>
              <div className="s">Favourite shot</div>
            </div>
          </div>
          {bat.wagon.some((z) => z > 0) ? (
            <div>
              <div className="foot faint" style={{ marginBottom: 8 }}>
                Scoring zones · runs by region{lefties.has(bat.id) ? ' (left-hander, mirrored)' : ''}
              </div>
              <WagonWheel zones={bat.wagon} shots={bat.wagonShots} color={ctx.colorOf(bat.teamId)} leftHanded={lefties.has(bat.id)} />
            </div>
          ) : (
            <div className="foot faint">No scoring-zone data for this innings.</div>
          )}
        </div>
      )}
      {bowl && (
        <div className="card pad stack gap-16">
          <div className="row between wrap gap-8">
            <div className="title3">Bowler lens</div>
            <select className="chip" value={wi} onChange={(e) => setWi(+e.target.value)} style={{ border: 0, maxWidth: 220 }} aria-label="Choose bowler">
              {bowlers.map((b, i) => (
                <option key={`${b.id}-${b.period}`} value={i}>
                  {b.name} · {b.wkts}/{b.runs}
                </option>
              ))}
            </select>
          </div>
          <div className="row gap-14" style={{ gap: 14 }}>
            <Avatar src={bowl.headshot} id={bowl.id} name={bowl.name} size={56} />
            <div className="grow">
              <div className="headline">{bowl.name}</div>
              <div className="foot faint">
                {bowl.overs} ov · {bowl.dots} dots · econ {bowl.econ}
              </div>
            </div>
            <div className="tnum" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>
              {bowl.wkts}/{bowl.runs}
            </div>
          </div>
          {(bowl.vsR || bowl.vsL) && (
            <div className="grid cols-2" style={{ gap: 10 }}>
              {[
                ['vs right-handers', bowl.vsR],
                ['vs left-handers', bowl.vsL],
              ].map(([l, v]) =>
                v && typeof v === 'object' ? (
                  <div key={l as string} className="stat-tile" style={{ padding: 12, background: 'var(--fill-2)', borderRadius: 14 }}>
                    <div className="v" style={{ fontSize: 22 }}>
                      {v.wickets}/{v.conceded}
                    </div>
                    <div className="s">
                      {l as string} · {v.balls}b · econ {Number(v.economyRate).toFixed(2)}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          )}
          <div className="row between">
            <span className="foot muted">Pitch map</span>
            <div className="row gap-6">
              {(['2D', '3D'] as const).map((v) => (
                <button key={v} className={`chip ${(v === '3D') === pitch3d ? 'on' : ''}`} style={{ height: 28, padding: '0 12px', fontSize: 12 }} onClick={() => setPitch3d(v === '3D')}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="row gap-24 wrap center">
            <PitchMap map={bowl.pitchR} title="To right-handers" threeD={pitch3d} />
            <PitchMap map={bowl.pitchL} title="To left-handers" threeD={pitch3d} />
          </div>
        </div>
      )}
    </div>
  )
}

type Chart = 'worm' | 'manhattan' | 'rr'

/** Scrub (or play) through the match ball by ball; every chart below rebuilds to that moment. */
function ReplayBar({ total, value, onChange, label }: { total: number; value: number; onChange: (v: number) => void; label: string }) {
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      onChange(-1) // sentinel: advance by one over
    }, 380)
    return () => clearInterval(timer.current)
  }, [playing, onChange])
  useEffect(() => {
    if (value >= total) setPlaying(false)
  }, [value, total])
  return (
    <div className="card replay">
      <button
        className="icon-btn replay-play"
        onClick={() => {
          if (value >= total) onChange(1)
          setPlaying((p) => !p)
        }}
        aria-label={playing ? 'Pause replay' : 'Play replay'}
      >
        {playing ? <span className="pause-glyph" /> : <Icon name="play" size={16} />}
      </button>
      <div className="grow stack gap-4">
        <div className="row between foot">
          <b>Match replay</b>
          <span className="tnum muted">{label}</span>
        </div>
        <input type="range" className="range" min={1} max={total} value={value} onChange={(e) => onChange(+e.target.value)} aria-label="Replay position" />
      </div>
      {value < total && (
        <button className="chip" onClick={() => onChange(total)}>
          Live state
        </button>
      )}
    </div>
  )
}

export function Analytics({ ctx }: { ctx: MatchCtx }) {
  const all = ctx.balls
  const [cut, setCut] = useState<number | null>(null)
  const pos = cut ?? all.length
  const onReplay = (v: number) =>
    setCut((c) => {
      const cur = c ?? all.length
      if (v !== -1) return v >= all.length ? null : Math.max(1, v)
      // advance to the end of the next over
      const nextOverEnd = all.findIndex((b, i) => i >= cur && b.oDone && b.o > (all[cur - 1]?.o ?? 0))
      const nxt = nextOverEnd >= 0 ? nextOverEnd + 1 : all.length
      return nxt >= all.length ? null : nxt
    })
  const innings = useMemo(() => (cut == null ? ctx.innings : aggregate(all.slice(0, cut))), [cut, ctx.innings, all])
  const wp = useMemo(() => winProbSeries(innings, ctx.trained), [innings, ctx.trained])
  const colorOf = ctx.colorOf
  const atBall = all[pos - 1]
  const [chart, setChart] = useState<Chart>('worm')
  const shown = innings.length > 2 ? innings : innings
  const colors = shown.map((i, k) => (innings.length > 2 && k >= 2 ? `color-mix(in srgb, ${colorOf(i.teamId)} 55%, var(--text-3))` : colorOf(i.teamId)))
  const limited = innings[0]?.limit > 0 && innings[0]?.limit <= 300
  const DIST = [
    { k: 'dots', label: 'Dots', color: 'var(--text-3)' },
    { k: 'ones', label: 'Singles', color: '#64D2FF' },
    { k: 'twos', label: 'Twos', color: '#32ADE6' },
    { k: 'threes', label: 'Threes', color: '#5E5CE6' },
    { k: 'fours', label: 'Fours', color: '#0A84FF' },
    { k: 'sixes', label: 'Sixes', color: '#BF5AF2' },
    { k: 'extras', label: 'Extras', color: '#FF9F0A' },
  ] as const
  return (
    <div className="stack gap-24">
      {all.length > 12 && (
        <div className="replay-sticky">
          <ReplayBar
            total={all.length}
            value={pos}
            onChange={onReplay}
            label={atBall ? `Inn ${atBall.inn} · ${atBall.ov} ov · ${atBall.team} ${atBall.runs}/${atBall.wkts} · ${ballLabel(atBall)}` : ''}
          />
        </div>
      )}
      <Reveal>
        <StatGrid innings={innings} colorOf={colorOf} />
      </Reveal>

      <Reveal>
        <div className="card pad">
          <div className="row between wrap gap-12" style={{ marginBottom: 16 }}>
            <div>
              <div className="title3">{chart === 'worm' ? 'Worm' : chart === 'manhattan' ? 'Manhattan' : 'Run-rate race'}</div>
              <div className="foot faint">
                {chart === 'worm' ? 'Cumulative runs by over · dots mark wickets' : chart === 'manhattan' ? 'Runs per over · red dots mark wickets' : 'Run rate by over · dashed line is required rate'}
              </div>
            </div>
            <Segmented
              value={chart}
              onChange={setChart}
              layout="chart-tab"
              options={[
                { value: 'worm', label: 'Worm' },
                { value: 'manhattan', label: 'Manhattan' },
                ...(limited ? [{ value: 'rr' as Chart, label: 'Run rate' }] : []),
              ]}
            />
          </div>
          <Legend items={shown.map((i, k) => ({ label: `${i.team}${innings.length > 2 ? ` (${i.inn})` : ''}`, color: colors[k] }))} />
          <div style={{ marginTop: 12 }}>
            {chart === 'worm' && <WormChart innings={shown} colors={colors} />}
            {chart === 'manhattan' && <Manhattan innings={shown} colors={colors} />}
            {chart === 'rr' && <RunRateChart innings={shown} colors={colors} />}
          </div>
        </div>
      </Reveal>

      {limited && (
        <Reveal>
          <Phases innings={innings} colorOf={colorOf} />
        </Reveal>
      )}

      <Reveal>
        <Momentum innings={innings} colorOf={colorOf} />
      </Reveal>

      <Reveal>
        <ImpactTable ctx={ctx} innings={innings} wp={wp} />
      </Reveal>

      {limited && (
        <Reveal>
          <Simulator ctx={{ ...ctx, innings }} cutoff={cut == null ? undefined : innings[innings.length - 1]?.balls.length} />
        </Reveal>
      )}

      <Reveal>
        <PartnershipPressure ctx={ctx} innings={innings} />
      </Reveal>

      <Reveal>
        <div className="grid cols-2">
          {innings.map((inn) => (
            <div key={inn.inn} className="card pad">
              <div className="title3" style={{ marginBottom: 4 }}>
                <span style={{ color: colorOf(inn.teamId) }}>●</span> {inn.team} scoring mix
              </div>
              <div className="foot faint" style={{ marginBottom: 16 }}>
                Every delivery of innings {inn.inn}, by outcome
              </div>
              <Donut
                parts={DIST.map((d) => ({ label: d.label, value: inn.dist[d.k], color: d.color }))}
                center={
                  <div>
                    <div className="tnum" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>
                      {inn.balls.length}
                    </div>
                    <div className="cap faint">deliveries</div>
                  </div>
                }
              />
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal>
        <Players ctx={ctx} />
      </Reveal>
    </div>
  )
}
