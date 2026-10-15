import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { ballKind, ballLabel, type OverAgg } from '../../lib/analytics'
import type { MatchCtx } from '../../pages/Match'

type Filter = 'all' | 'wickets' | 'boundaries'

function OverBlock({ o, team, color }: { o: OverAgg; team: string; color: string }) {
  const balls = [...o.balls].reverse()
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="row gap-12" style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--hair)', background: 'var(--fill-2)' }}>
        <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: color }} />
        <div className="grow">
          <div style={{ fontWeight: 700 }}>
            Over {o.over} <span className="faint" style={{ fontWeight: 500 }}>· {o.bowler}</span>
          </div>
          <div className="row gap-4 wrap" style={{ marginTop: 6 }}>
            {o.balls.map((b) => (
              <span key={b.id} className={`ball sm ${ballKind(b)}`}>
                {ballLabel(b)}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tnum" style={{ fontWeight: 700, fontSize: 18 }}>
            {team} {o.total}/{o.wktsTotal}
          </div>
          <div className="foot faint tnum">
            {o.runs} run{o.runs === 1 ? '' : 's'}
            {o.wkts ? ` · ${o.wkts} wkt` : ''}
          </div>
        </div>
      </div>
      <div className="list">
        {balls.map((b) => (
          <motion.div key={b.id} className="row gap-16" style={{ padding: '14px 20px', alignItems: 'flex-start' }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="stack gap-6" style={{ alignItems: 'center', width: 40, flex: 'none' }}>
              <span className="foot faint tnum" style={{ fontWeight: 600 }}>
                {b.ov}
              </span>
              <span className={`ball ${ballKind(b)}`}>{ballLabel(b)}</span>
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: b.w ? 'var(--red)' : undefined }}>{b.short}</div>
              {b.text && <div className="sub muted" style={{ marginTop: 4, lineHeight: 1.5 }}>{b.text}</div>}
              {b.w && b.wtext && (
                <div className="foot" style={{ marginTop: 8, padding: '8px 12px', borderRadius: 12, background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)', fontWeight: 600 }}>
                  {b.wtext}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export function Commentary({ ctx }: { ctx: MatchCtx }) {
  const { innings } = ctx
  const [inn, setInn] = useState<number>(innings[innings.length - 1]?.inn ?? 1)
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(12)
  const cur = innings.find((i) => i.inn === inn) ?? innings[innings.length - 1]
  const overs = useMemo(() => {
    if (!cur) return []
    const keep = (o: OverAgg) => ({ ...o, balls: o.balls.filter((b) => filter === 'all' || (filter === 'wickets' ? b.w : ballKind(b) === 'four' || ballKind(b) === 'six')) })
    return [...cur.overs].reverse().map(keep).filter((o) => o.balls.length)
  }, [cur, filter])
  if (!cur) return null
  return (
    <div>
      <div className="row wrap gap-12" style={{ marginBottom: 20 }}>
        <div className="scroll-x" style={{ margin: 0, padding: 0 }}>
          {innings.map((i) => (
            <button key={i.inn} className={`chip ${i.inn === cur.inn ? 'on' : ''}`} onClick={() => setInn(i.inn)}>
              {i.team} · Inn {i.inn}
            </button>
          ))}
        </div>
        <div className="scroll-x" style={{ margin: 0, padding: 0, marginLeft: 'auto' }}>
          {(['all', 'wickets', 'boundaries'] as Filter[]).map((f) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>
              {f}
            </button>
          ))}
        </div>
      </div>
      {ctx.ballsPartial && <div className="foot faint" style={{ marginBottom: 12 }}>Showing the most recent part of this long match.</div>}
      <div className="stack gap-16">
        <AnimatePresence initial={false}>
          {overs.slice(0, limit).map((o) => (
            <motion.div key={`${cur.inn}-${o.over}`} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <OverBlock o={o} team={cur.team} color={ctx.colorOf(cur.teamId)} />
            </motion.div>
          ))}
        </AnimatePresence>
        {overs.length === 0 && <div className="card empty">Nothing to show for this filter.</div>}
        {overs.length > limit && (
          <button className="btn ghost" style={{ alignSelf: 'center' }} onClick={() => setLimit((l) => l + 12)}>
            Show earlier overs
          </button>
        )}
      </div>
    </div>
  )
}
