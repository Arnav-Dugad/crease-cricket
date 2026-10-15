import { motion } from 'motion/react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { InningsAgg, Partnership, WinPoint } from '../../lib/analytics'

/* ---------- shared helpers ---------- */

const hexToRgb = (h: string) => {
  const n = parseInt(h.replace('#', ''), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

/** Two team colours must stay distinguishable (identity is the job). */
export function distinctPair(a: string, b: string): [string, string] {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const d = Math.sqrt((r1 - r2) ** 2 * 0.3 + (g1 - g2) ** 2 * 0.59 + (b1 - b2) ** 2 * 0.11)
  if (d > 60) return [a, b]
  const blueish = b1 > r1 && b1 > g1
  return [a, blueish ? '#FF9F0A' : '#0A84FF']
}

function useHover() {
  const ref = useRef<SVGSVGElement>(null)
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null)
  const onMove = (e: React.PointerEvent, vbW: number, vbH: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPt({ x: ((e.clientX - r.left) / r.width) * vbW, y: ((e.clientY - r.top) / r.height) * vbH })
  }
  return { ref, pt, onMove, clear: () => setPt(null) }
}

function Tip({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: ReactNode }) {
  return (
    <div className="tooltip" style={{ left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%` }}>
      {children}
    </div>
  )
}

const niceMax = (v: number, step: number) => Math.max(step, Math.ceil(v / step) * step)

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ background: i.color, borderRadius: i.dashed ? 2 : 3, opacity: i.dashed ? 0.6 : 1 }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/* ---------- Worm: cumulative runs by over ---------- */

export function WormChart({ innings, colors }: { innings: InningsAgg[]; colors: string[] }) {
  const W = 680, H = 280, P = { l: 40, r: 16, t: 14, b: 30 }
  const h = useHover()
  const maxOver = Math.max(...innings.map((i) => Math.max(i.limit / 6 || 0, i.overs.length)), 1)
  const maxRuns = niceMax(Math.max(...innings.map((i) => i.total), 10), 50)
  const x = (o: number) => P.l + (o / maxOver) * (W - P.l - P.r)
  const y = (r: number) => H - P.b - (r / maxRuns) * (H - P.t - P.b)
  const series = innings.map((inn) => [{ o: 0, r: 0, w: 0 }, ...inn.overs.map((o, k) => ({ o: k + (o.balls.length >= 6 || k < inn.overs.length - 1 ? 1 : o.balls.length / 6), r: o.total, w: o.wkts }))])
  const hoverOver = h.pt ? Math.max(0, Math.min(maxOver, Math.round(((h.pt.x - P.l) / (W - P.l - P.r)) * maxOver))) : null
  const yTicks = Array.from({ length: 5 }, (_, i) => (maxRuns / 4) * i)
  const xStep = maxOver > 30 ? 10 : maxOver > 12 ? 5 : 2
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={h.ref} className="chart" viewBox={`0 0 ${W} ${H}`} onPointerMove={(e) => h.onMove(e, W, H)} onPointerLeave={h.clear} role="img" aria-label="Worm chart of cumulative runs per over">
        {yTicks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} />
            <text className="axis-label" x={P.l - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {Array.from({ length: Math.floor(maxOver / xStep) + 1 }, (_, i) => i * xStep).map((o) => (
          <text key={o} className="axis-label" x={x(o)} y={H - 8} textAnchor="middle">
            {o}
          </text>
        ))}
        {series.map((s, si) => {
          const d = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.o).toFixed(1)},${y(p.r).toFixed(1)}`).join('')
          return (
            <g key={si}>
              <motion.path d={`${d}L${x(s[s.length - 1].o)},${y(0)}L${x(0)},${y(0)}Z`} fill={colors[si]} initial={{ opacity: 0 }} whileInView={{ opacity: 0.08 }} viewport={{ once: true }} transition={{ duration: 1.2 }} />
              <motion.path d={d} fill="none" stroke={colors[si]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: [0.32, 0.72, 0, 1], delay: si * 0.25 }} />
              {s.flatMap((p, i) =>
                Array.from({ length: p.w }, (_, k) => (
                  <motion.circle key={`${i}-${k}`} cx={x(p.o)} cy={y(p.r) - k * 11} r={4.5} fill={colors[si]} stroke="var(--bg-2)" strokeWidth={2} initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.8 + i * 0.02 }} />
                )),
              )}
            </g>
          )
        })}
        {hoverOver != null && <line x1={x(hoverOver)} x2={x(hoverOver)} y1={P.t} y2={H - P.b} stroke="var(--text-3)" strokeDasharray="3 3" />}
        {hoverOver != null &&
          series.map((s, si) => {
            const p = s.find((q) => Math.round(q.o) === hoverOver)
            return p ? <circle key={si} cx={x(p.o)} cy={y(p.r)} r={5} fill={colors[si]} stroke="var(--bg-2)" strokeWidth={2} /> : null
          })}
      </svg>
      {hoverOver != null && h.pt && hoverOver > 0 && (
        <Tip x={x(hoverOver)} y={P.t + 30} w={W} h={H}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>After over {hoverOver}</div>
          {innings.map((inn, si) => {
            const o = inn.overs[hoverOver - 1]
            return o ? (
              <div key={si} className="tnum">
                <span style={{ color: colors[si] }}>●</span> {inn.team} {o.total}/{o.wktsTotal} <span className="faint">(+{o.runs})</span>
              </div>
            ) : null
          })}
        </Tip>
      )}
    </div>
  )
}

/* ---------- Manhattan: runs per over ---------- */

export function Manhattan({ innings, colors }: { innings: InningsAgg[]; colors: string[] }) {
  const W = 680, H = 260, P = { l: 34, r: 10, t: 16, b: 28 }
  const [hover, setHover] = useState<{ o: number; si: number } | null>(null)
  const n = Math.max(...innings.map((i) => i.overs.length), 1)
  const maxR = niceMax(Math.max(...innings.flatMap((i) => i.overs.map((o) => o.runs)), 6), 6)
  const slot = (W - P.l - P.r) / n
  const k = innings.length
  const gap = 2
  const bw = Math.max(2, (slot - 4) / k - gap)
  const y = (r: number) => H - P.b - (r / maxR) * (H - P.t - P.b)
  const ticks = [0, maxR / 3, (2 * maxR) / 3, maxR].map(Math.round)
  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Manhattan chart: runs per over">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} />
            <text className="axis-label" x={P.l - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {innings.map((inn, si) =>
          inn.overs.map((o, oi) => {
            const x0 = P.l + oi * slot + 2 + si * (bw + gap)
            const top = y(o.runs)
                        const r = Math.min(4, bw / 2)
            const d = `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${y(0)}Z`
            const dim = hover && !(hover.o === oi)
            return (
              <g key={`${si}-${oi}`} onPointerEnter={() => setHover({ o: oi, si })} onPointerLeave={() => setHover(null)}>
                <rect x={x0 - 1} y={P.t} width={bw + 2} height={H - P.t - P.b} fill="transparent" />
                <motion.path d={d} fill={colors[si]} style={{ transformOrigin: `${x0}px ${y(0)}px`, opacity: dim ? 0.35 : 1 }} initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: oi * 0.015, ease: [0.32, 0.72, 0, 1] }} />
                {o.wkts > 0 && Array.from({ length: o.wkts }, (_, w) => <circle key={w} cx={x0 + bw / 2} cy={top - 7 - w * 9} r={Math.min(3.5, bw / 2 + 1)} fill="var(--red)" stroke="var(--bg-2)" strokeWidth={1.5} />)}
              </g>
            )
          }),
        )}
        {Array.from({ length: n }, (_, i) => i + 1)
          .filter((o) => o === 1 || o % (n > 30 ? 10 : 5) === 0)
          .map((o) => (
            <text key={o} className="axis-label" x={P.l + (o - 0.5) * slot} y={H - 8} textAnchor="middle">
              {o}
            </text>
          ))}
      </svg>
      {hover && (
        <Tip x={P.l + (hover.o + 0.5) * slot} y={y(Math.max(...innings.map((i) => i.overs[hover.o]?.runs ?? 0))) - 8} w={W} h={H}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Over {hover.o + 1}</div>
          {innings.map((inn, si) => {
            const o = inn.overs[hover.o]
            return o ? (
              <div key={si} className="tnum">
                <span style={{ color: colors[si] }}>●</span> {inn.team}: {o.runs} run{o.runs === 1 ? '' : 's'}
                {o.wkts ? `, ${o.wkts} wkt` : ''} <span className="faint">· {o.bowler}</span>
              </div>
            ) : null
          })}
        </Tip>
      )}
    </div>
  )
}

/* ---------- Run-rate progression ---------- */

export function RunRateChart({ innings, colors }: { innings: InningsAgg[]; colors: string[] }) {
  const W = 680, H = 220, P = { l: 34, r: 16, t: 12, b: 28 }
  const h = useHover()
  const series = innings.map((inn) => inn.overs.map((o, k) => ({ o: k + 1, rr: o.total / (k + 1), req: inn.target ? (inn.target - o.total) / Math.max(1, inn.limit / 6 - (k + 1)) : null })))
  const n = Math.max(...series.map((s) => s.length), 1)
  const maxRR = niceMax(Math.max(...series.flat().map((p) => Math.max(p.rr, p.req && p.req < 30 ? p.req : 0)), 6), 4)
  const x = (o: number) => P.l + ((o - 1) / Math.max(1, n - 1)) * (W - P.l - P.r)
  const y = (v: number) => H - P.b - (Math.min(v, maxRR) / maxRR) * (H - P.t - P.b)
  const hov = h.pt ? Math.max(1, Math.min(n, Math.round(1 + ((h.pt.x - P.l) / (W - P.l - P.r)) * (n - 1)))) : null
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={h.ref} className="chart" viewBox={`0 0 ${W} ${H}`} onPointerMove={(e) => h.onMove(e, W, H)} onPointerLeave={h.clear} role="img" aria-label="Run rate progression">
        {[0, maxRR / 2, maxRR].map((t) => (
          <g key={t}>
            <line className="grid-line" x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} />
            <text className="axis-label" x={P.l - 8} y={y(t) + 4} textAnchor="end">
              {t.toFixed(0)}
            </text>
          </g>
        ))}
        {series.map((s, si) => (
          <g key={si}>
            <motion.path d={s.map((p, i) => `${i ? 'L' : 'M'}${x(p.o)},${y(p.rr)}`).join('')} fill="none" stroke={colors[si]} strokeWidth={2} initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4 }} />
            {s.some((p) => p.req != null) && (
              <path d={s.filter((p) => p.req != null && p.req >= 0).map((p, i) => `${i ? 'L' : 'M'}${x(p.o)},${y(p.req!)}`).join('')} fill="none" stroke={colors[si]} strokeWidth={2} strokeDasharray="4 4" opacity={0.6} />
            )}
          </g>
        ))}
        {hov && <line x1={x(hov)} x2={x(hov)} y1={P.t} y2={H - P.b} stroke="var(--text-3)" strokeDasharray="3 3" />}
        {[1, ...Array.from({ length: Math.floor(n / 5) }, (_, i) => (i + 1) * 5)].map((o) => (
          <text key={o} className="axis-label" x={x(o)} y={H - 8} textAnchor="middle">
            {o}
          </text>
        ))}
      </svg>
      {hov && (
        <Tip x={x(hov)} y={P.t + 24} w={W} h={H}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Over {hov}</div>
          {series.map((s, si) => {
            const p = s[hov - 1]
            return p ? (
              <div key={si} className="tnum">
                <span style={{ color: colors[si] }}>●</span> {innings[si].team} RR {p.rr.toFixed(2)}
                {p.req != null && p.req >= 0 ? <span className="faint"> · req {p.req.toFixed(2)}</span> : ''}
              </div>
            ) : null
          })}
        </Tip>
      )}
    </div>
  )
}

/* ---------- Win probability ---------- */

export function WinProbChart({ points, teams, colors }: { points: WinPoint[]; teams: [string, string]; colors: [string, string] }) {
  const W = 680, H = 220, P = { l: 40, r: 12, t: 12, b: 26 }
  const h = useHover()
  const n = Math.max(points.length - 1, 1)
  const x = (i: number) => P.l + (i / n) * (W - P.l - P.r)
  const y = (p: number) => P.t + (1 - p) * (H - P.t - P.b)
  const mid = y(0.5)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.p).toFixed(1)}`).join('')
  const innBreak = points.find((p) => p.inn === 2)
  const hi = h.pt ? Math.max(0, Math.min(n, Math.round(((h.pt.x - P.l) / (W - P.l - P.r)) * n))) : null
  const hp = hi != null ? points[hi] : null
  const id = useMemo(() => 'wp' + Math.random().toString(36).slice(2, 8), [])
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={h.ref} className="chart" viewBox={`0 0 ${W} ${H}`} onPointerMove={(e) => h.onMove(e, W, H)} onPointerLeave={h.clear} role="img" aria-label="Win probability through the match">
        <defs>
          <clipPath id={`${id}-top`}>
            <rect x={0} y={0} width={W} height={mid} />
          </clipPath>
          <clipPath id={`${id}-bot`}>
            <rect x={0} y={mid} width={W} height={H} />
          </clipPath>
        </defs>
        {[1, 0.75, 0.5, 0.25, 0].map((t) => (
          <g key={t}>
            <line className="grid-line" x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} strokeDasharray={t === 0.5 ? '0' : '2 4'} />
            <text className="axis-label" x={P.l - 8} y={y(t) + 4} textAnchor="end">
              {Math.round(Math.max(t, 1 - t) * 100)}%
            </text>
          </g>
        ))}
        <path d={`${line}L${x(points[points.length - 1].i)},${mid}L${x(0)},${mid}Z`} fill={colors[0]} opacity={0.22} clipPath={`url(#${id}-top)`} />
        <path d={`${line}L${x(points[points.length - 1].i)},${mid}L${x(0)},${mid}Z`} fill={colors[1]} opacity={0.22} clipPath={`url(#${id}-bot)`} />
        <motion.path d={line} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2, ease: [0.32, 0.72, 0, 1] }} />
        {points.filter((p) => p.w).map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.p)} r={3.5} fill="var(--red)" stroke="var(--bg-2)" strokeWidth={1.5} />
        ))}
        {innBreak && (
          <g>
            <line x1={x(innBreak.i)} x2={x(innBreak.i)} y1={P.t} y2={H - P.b} stroke="var(--text-3)" strokeDasharray="3 3" />
            <text className="axis-label" x={x(innBreak.i) + 6} y={H - 8}>
              Innings break
            </text>
          </g>
        )}
        <text x={P.l + 8} y={P.t + 14} fontSize={12} fontWeight={600} fill="var(--text-2)">
          {teams[0]} ↑
        </text>
        <text x={P.l + 8} y={H - P.b - 8} fontSize={12} fontWeight={600} fill="var(--text-2)">
          {teams[1]} ↓
        </text>
        {hp && <circle cx={x(hp.i)} cy={y(hp.p)} r={5} fill="var(--text)" stroke="var(--bg-2)" strokeWidth={2} />}
      </svg>
      {hp && (
        <Tip x={x(hp.i)} y={y(hp.p)} w={W} h={H}>
          <div style={{ fontWeight: 600 }}>
            Inn {hp.inn} · {hp.over.toFixed(1)} ov
          </div>
          <div className="tnum">
            <span style={{ color: colors[0] }}>●</span> {teams[0]} {(hp.p * 100).toFixed(0)}% <span style={{ color: colors[1], marginLeft: 6 }}>●</span> {teams[1]} {((1 - hp.p) * 100).toFixed(0)}%
          </div>
        </Tip>
      )}
    </div>
  )
}

/* ---------- Donut: scoring breakdown ---------- */

export function Donut({ parts, size = 160, center }: { parts: { label: string; value: number; color: string }[]; size?: number; center?: ReactNode }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  const R = 64, C = 2 * Math.PI * R
  let acc = 0
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div className="row gap-20 wrap">
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg viewBox="0 0 160 160" width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={80} cy={80} r={R} fill="none" stroke="var(--fill-2)" strokeWidth={18} />
          {parts.map((p, i) => {
            const len = (p.value / total) * C
            const el = (
              <motion.circle
                key={p.label}
                cx={80}
                cy={80}
                r={R}
                fill="none"
                stroke={p.color}
                strokeWidth={hover === i ? 22 : 18}
                strokeDasharray={`${Math.max(0, len - 2)} ${C}`}
                strokeDashoffset={-acc}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                style={{ transition: 'stroke-width .25s' }}
              />
            )
            acc += len
            return el
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          {hover != null ? (
            <div>
              <div className="tnum" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>
                {parts[hover].value}
              </div>
              <div className="cap faint">{parts[hover].label}</div>
            </div>
          ) : (
            center
          )}
        </div>
      </div>
      <div className="stack gap-6 grow" style={{ minWidth: 140 }}>
        {parts.map((p, i) => (
          <div key={p.label} className="row gap-8 foot" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} style={{ opacity: hover != null && hover !== i ? 0.5 : 1, transition: 'opacity .2s' }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flex: 'none' }} />
            <span className="grow muted">{p.label}</span>
            <span className="tnum" style={{ fontWeight: 600 }}>
              {p.value}
            </span>
            <span className="tnum faint" style={{ width: 38, textAlign: 'right' }}>
              {Math.round((p.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Partnerships ---------- */

export function PartnershipBars({ list, color }: { list: Partnership[]; color: string }) {
  const max = Math.max(...list.map((p) => p.runs), 1)
  return (
    <div className="stack gap-12">
      {list.map((p) => (
        <div key={p.wicket} className="stack gap-4">
          <div className="row between foot">
            <span className="muted ellipsis">
              <b style={{ color: 'var(--text)' }}>{ordinal(p.wicket)} wkt</b> · {p.a.split(' ').slice(-1)} & {p.b.split(' ').slice(-1)}
            </span>
            <span className="tnum" style={{ fontWeight: 700 }}>
              {p.runs}
              {p.unbroken ? '*' : ''} <span className="faint" style={{ fontWeight: 400 }}>({p.balls})</span>
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--fill-2)', overflow: 'hidden', display: 'flex', gap: 2 }}>
            <motion.div style={{ background: color, borderRadius: 99, height: '100%' }} initial={{ width: 0 }} whileInView={{ width: `${(p.aRuns / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }} />
            <motion.div style={{ background: color, opacity: 0.45, borderRadius: 99, height: '100%' }} initial={{ width: 0 }} whileInView={{ width: `${(Math.max(0, p.runs - p.aRuns) / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.1, ease: [0.32, 0.72, 0, 1] }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th')

/* ---------- Wagon wheel (8 scoring zones) ---------- */

const ZONES_RHB = ['Fine leg', 'Square leg', 'Mid-wicket', 'Long on', 'Long off', 'Cover', 'Point', 'Third man']

export function WagonWheel({ zones, color, leftHanded }: { zones: number[]; color: string; leftHanded?: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const total = zones.reduce((a, b) => a + b, 0) || 1
  const max = Math.max(...zones, 1)
  const R = 92, c = 110
  // Viewed from behind the batter, bowler at the top. Zones sweep clockwise from fine leg
  // (behind square on the leg side) to third man. Right-hander: leg side on the left.
  const sector = (i: number, r: number) => {
    const a0 = ((90 + 45 * i) * Math.PI) / 180
    const a1 = a0 + Math.PI / 4
    const p = (a: number) => `${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`
    return `M${c},${c}L${p(a0)}A${r},${r} 0 0 1 ${p(a1)}Z`
  }
  return (
    <div className="row gap-20 wrap center">
      <svg viewBox="0 0 220 220" width={220} height={220} role="img" aria-label="Scoring zones">
        <circle cx={c} cy={c} r={R + 8} fill="color-mix(in srgb, var(--green) 10%, transparent)" stroke="var(--hair)" />
        <circle cx={c} cy={c} r={R * 0.48} fill="none" stroke="var(--hair)" strokeDasharray="3 4" />
        <rect x={c - 5} y={c - 46} width={10} height={50} rx={3} fill="color-mix(in srgb, #c8a56a 55%, var(--fill))" />
        <text x={c} y={14} textAnchor="middle" className="axis-label">Bowler</text>
        <text x={leftHanded ? 206 : 14} y={c + 4} textAnchor={leftHanded ? 'end' : 'start'} className="axis-label">Leg</text>
        <text x={leftHanded ? 14 : 206} y={c + 4} textAnchor={leftHanded ? 'start' : 'end'} className="axis-label">Off</text>
        <g transform={leftHanded ? 'translate(220,0) scale(-1,1)' : undefined}>
        {zones.map((z, i) => (
          <motion.path
            key={i}
            d={sector(i, 18 + (z / max) * (R - 18))}
            fill={color}
            fillOpacity={0.25 + (z / max) * 0.65}
            stroke="var(--bg-2)"
            strokeWidth={2}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            style={{ transformOrigin: `${c}px ${c}px` }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
          />
        ))}
        </g>
      </svg>
      <div className="stack gap-6" style={{ minWidth: 160 }}>
        {zones.map((z, i) => (
          <div key={i} className="row gap-8 foot" style={{ opacity: hover != null && hover !== i ? 0.45 : 1 }}>
            <span className="grow muted">{ZONES_RHB[i]}</span>
            <span className="tnum" style={{ fontWeight: 600 }}>
              {z}
            </span>
            <span className="tnum faint" style={{ width: 36, textAlign: 'right' }}>
              {Math.round((z / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Bowler pitch map (length × line) ---------- */

const LENGTHS = ['Full toss', 'Yorker', 'Full', 'Good', 'Back of length', 'Short']
const LINES = ['Wide off', 'Off', 'Stumps', 'Leg', 'Wide leg']

export function PitchMap({ map, title }: { map?: number[][][]; title: string }) {
  const [hover, setHover] = useState<[number, number] | null>(null)
  if (!map?.length) return null
  const cells = map.flatMap((row) => row.map((c) => c?.[2] ?? 0))
  const max = Math.max(...cells, 1)
  const balls = cells.reduce((a, b) => a + b, 0)
  if (!balls) return null
  const hv = hover ? map[hover[0]][hover[1]] : null
  return (
    <div className="stack gap-8" style={{ alignItems: 'center' }}>
      <div className="foot muted" style={{ fontWeight: 600 }}>
        {title} <span className="faint">· {balls} balls</span>
      </div>
      <div style={{ position: 'relative', padding: '10px 14px', borderRadius: 18, background: 'linear-gradient(180deg, color-mix(in srgb, #c8a56a 28%, var(--fill-2)), color-mix(in srgb, #c8a56a 12%, var(--fill-2)))' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 30px)', gap: 3 }}>
          {map.map((row, ri) =>
            row.map((c, ci) => {
              const n = c?.[2] ?? 0
              return (
                <motion.div
                  key={`${ri}-${ci}`}
                  onPointerEnter={() => setHover([ri, ci])}
                  onPointerLeave={() => setHover(null)}
                  initial={{ opacity: 0, scale: 0.6 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: (ri * 5 + ci) * 0.012 }}
                  style={{
                    height: 26,
                    borderRadius: 6,
                    background: n ? `color-mix(in srgb, var(--accent) ${18 + (n / max) * 82}%, transparent)` : 'rgba(255,255,255,0.18)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    color: n / max > 0.5 ? 'white' : 'var(--text-2)',
                    outline: c?.[1] ? '2px solid var(--red)' : 'none',
                    outlineOffset: -2,
                  }}
                >
                  {n || ''}
                </motion.div>
              )
            }),
          )}
        </div>
      </div>
      <div className="cap faint" style={{ minHeight: 16, textAlign: 'center' }}>
        {hover && hv ? `${LENGTHS[hover[0]]} · ${LINES[hover[1]]}: ${hv[2]} balls, ${hv[0]} runs${hv[1] ? `, ${hv[1]} wkt` : ''}` : 'Bowler’s view · red outline = wicket'}
      </div>
    </div>
  )
}

/* ---------- Horizontal comparison bar ---------- */

export function CompareBar({ label, a, b, colors, fmt = (v: number) => String(v) }: { label: string; a: number; b: number; colors: [string, string]; fmt?: (v: number) => string }) {
  const t = a + b || 1
  return (
    <div className="stack gap-6">
      <div className="row between foot">
        <span className="tnum" style={{ fontWeight: 700 }}>
          {fmt(a)}
        </span>
        <span className="muted">{label}</span>
        <span className="tnum" style={{ fontWeight: 700 }}>
          {fmt(b)}
        </span>
      </div>
      <div className="prob">
        <motion.div style={{ background: colors[0], borderRadius: 99 }} initial={{ flexGrow: 1 }} whileInView={{ flexGrow: a / t || 0.001 }} viewport={{ once: true }} transition={{ duration: 1 }} />
        <motion.div style={{ background: colors[1], borderRadius: 99 }} initial={{ flexGrow: 1 }} whileInView={{ flexGrow: b / t || 0.001 }} viewport={{ once: true }} transition={{ duration: 1 }} />
      </div>
    </div>
  )
}
