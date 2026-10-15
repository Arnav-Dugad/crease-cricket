import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { InningsAgg, WinPoint } from '../../lib/analytics'
import { impactRatings, partnershipPressure } from '../../lib/impact'
import type { MatchCtx } from '../../pages/Match'
import { PressureChart } from '../charts/Charts'
import { Avatar } from '../Media'
import { Segmented } from '../UI'

export function ImpactTable({ ctx, innings, wp }: { ctx: MatchCtx; innings: InningsAgg[]; wp: WinPoint[] }) {
  const rows = useMemo(() => impactRatings(innings, wp), [innings, wp])
  const [sort, setSort] = useState<'total' | 'wpa'>(wp.length > 2 ? 'wpa' : 'total')
  const list = [...rows].sort((a, b) => (sort === 'wpa' ? b.wpa - a.wpa : b.total - a.total)).slice(0, 10)
  if (!list.length) return null
  const max = Math.max(...list.map((r) => Math.abs(sort === 'wpa' ? r.wpa * 100 : r.total)), 1)
  const teamIdOf = (abbr: string) => ctx.m.teams.find((t) => t.abbr === abbr)?.id ?? abbr
  return (
    <div className="card pad">
      <div className="row between wrap gap-12" style={{ marginBottom: 14 }}>
        <div>
          <div className="title3">Impact ratings</div>
          <div className="foot faint">
            {sort === 'wpa' ? 'Win probability added — how much each player moved their side’s chances, ball by ball' : 'Runs above par: each ball valued against the phase average, plus the value of wickets'}
          </div>
        </div>
        {wp.length > 2 && (
          <Segmented
            value={sort}
            onChange={setSort}
            layout="impact-sort"
            options={[
              { value: 'wpa', label: 'Win prob added' },
              { value: 'total', label: 'Runs above par' },
            ]}
          />
        )}
      </div>
      <div className="stack gap-10">
        {list.map((r, i) => {
          const v = sort === 'wpa' ? r.wpa * 100 : r.total
          const color = ctx.colorOf(teamIdOf(r.team))
          return (
            <div key={r.id} className="row gap-12">
              <span className="tnum faint" style={{ width: 16, fontWeight: 600 }}>
                {i + 1}
              </span>
              <Link to={`/player/${r.id}`}>
                <Avatar id={r.id} name={r.name} size={34} ring={color} />
              </Link>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row between gap-8">
                  <span className="ellipsis" style={{ fontWeight: 600, fontSize: 15 }}>
                    {r.name}
                  </span>
                  <span className="tnum" style={{ fontWeight: 700, color: v >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {v >= 0 ? '+' : ''}
                    {v.toFixed(sort === 'wpa' ? 0 : 1)}
                    {sort === 'wpa' ? '%' : ''}
                  </span>
                </div>
                <div className="row gap-8">
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--fill-2)', overflow: 'hidden' }}>
                    <motion.div style={{ height: '100%', borderRadius: 99, background: color, width: `${(Math.abs(v) / max) * 100}%`, transformOrigin: 'left center' }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.04 }} />
                  </div>
                  <span className="cap faint tnum" style={{ width: 150, textAlign: 'right' }}>
                    {r.balls ? `${r.runs} (${r.balls})` : ''}
                    {r.balls && r.bowled ? ' · ' : ''}
                    {r.bowled ? `${r.wkts}/${r.conceded}` : ''}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PartnershipPressure({ ctx, innings }: { ctx: MatchCtx; innings: InningsAgg[] }) {
  const [sel, setSel] = useState<number | null>(null)
  const inn = innings.find((i) => i.inn === sel) ?? innings[innings.length - 1]
  const parts = useMemo(() => (inn ? partnershipPressure(inn).filter((p) => p.points.length >= 8) : []), [inn])
  if (!inn || !parts.length) return null
  const color = ctx.colorOf(inn.teamId)
  return (
    <div className="card pad">
      <div className="row between wrap gap-12" style={{ marginBottom: 14 }}>
        <div>
          <div className="title3">Partnership pressure</div>
          <div className="foot faint">Rolling 12-ball run rate through each stand · red bands mark dot-ball squeezes (3+ in a row)</div>
        </div>
        {innings.length > 1 && <Segmented value={String(inn.inn)} onChange={(v) => setSel(+v)} layout="press-inn" options={innings.map((i) => ({ value: String(i.inn), label: i.team }))} />}
      </div>
      <div className="grid cols-3" style={{ gap: 14 }}>
        {parts.slice(0, 6).map((p) => {
          const maxDots = Math.max(...p.points.map((x) => x.dots))
          return (
            <div key={p.wicket} className="mini-stat stack gap-6" style={{ padding: 12 }}>
              <div className="row between foot">
                <b className="ellipsis">
                  {p.a.split(' ').slice(-1)} & {p.b.split(' ').slice(-1)}
                </b>
                <span className="tnum faint">
                  {p.runs} ({p.points.length})
                </span>
              </div>
              <PressureChart points={p.points} color={color} />
              <div className="cap faint">{maxDots >= 3 ? `Longest squeeze: ${maxDots} dots` : 'Kept the strike moving'}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
