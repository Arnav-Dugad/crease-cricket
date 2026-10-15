import { motion } from 'motion/react'
import { useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { MatchCard } from '../components/MatchCard'
import { LeagueLogo } from '../components/Media'
import { CardSkeleton, Empty, ErrorState, Reveal, Segmented, pageMotion, spring } from '../components/UI'
import { addDays, parseYmd, prefetch, useApi, ymd } from '../lib/api'
import { groupsFromScorepanel, shortLeague } from '../lib/normalize'
import type { MatchLite } from '../lib/types'

type Filter = 'all' | 'live' | 'intl' | 'leagues' | 'women'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'intl', label: 'International' },
  { value: 'leagues', label: 'Leagues' },
  { value: 'women', label: 'Women' },
]

const FORMATS = ['All formats', 'T20', 'ODI', 'Test']

function DateStrip({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const today = new Date()
  const days = useMemo(() => Array.from({ length: 29 }, (_, i) => addDays(today, i - 14)), [today.toDateString()])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector('.day.on') as HTMLElement | null
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [value])
  return (
    <div className="datestrip" ref={ref}>
      {days.map((d) => {
        const k = ymd(d)
        const on = k === value
        const isToday = k === ymd(today)
        return (
          <button key={k} className={`day ${on ? 'on' : ''} ${isToday ? 'today' : ''}`} onClick={() => onChange(k)} onMouseEnter={() => prefetch(`/api/day/${k}`)}>
            {on && <motion.span layoutId="day-pill" className="pill-bg" transition={spring} />}
            <span className="dw">{isToday ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className="dn tnum">{d.getDate()}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function Matches() {
  const [sp, setSp] = useSearchParams()
  const date = sp.get('date') ?? ymd(new Date())
  const filter = (sp.get('f') as Filter) ?? 'all'
  const fmt = sp.get('fmt') ?? 'All formats'
  const isToday = date === ymd(new Date())
  const day = useApi<unknown[]>(`/api/day/${date}`, { poll: isToday ? 30_000 : undefined })
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp)
    if (v == null) n.delete(k)
    else n.set(k, v)
    setSp(n, { replace: true })
  }

  const groups = useMemo(() => {
    const keep = (m: MatchLite) =>
      (filter === 'all' || (filter === 'live' && m.state === 'in') || (filter === 'intl' && m.intl) || (filter === 'leagues' && !m.intl) || (filter === 'women' && m.women)) &&
      (fmt === 'All formats' || m.format === fmt || (fmt === 'Test' && /test|first/i.test(m.format)))
    return groupsFromScorepanel((day.data ?? []) as never[])
      .map((g) => ({ ...g, matches: g.matches.filter(keep) }))
      .filter((g) => g.matches.length)
  }, [day.data, filter, fmt])

  const total = groups.reduce((s, g) => s + g.matches.length, 0)
  const d = parseYmd(date)

  return (
    <motion.div className="page" {...pageMotion}>
      <div className="row between wrap gap-16" style={{ alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Schedule & scores
          </div>
          <h1 className="large-title">{isToday ? 'Today’s matches' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
        </div>
        {!isToday && (
          <button className="chip" onClick={() => set('date', null)}>
            <Icon name="calendar" size={15} /> Jump to today
          </button>
        )}
      </div>

      <DateStrip value={date} onChange={(v) => set('date', v === ymd(new Date()) ? null : v)} />

      <div className="row wrap gap-12" style={{ margin: '20px 0 28px' }}>
        <Segmented value={filter} options={FILTERS} onChange={(v) => set('f', v === 'all' ? null : v)} layout="filter-pill" />
        <div className="scroll-x" style={{ margin: 0, padding: 0 }}>
          {FORMATS.map((f) => (
            <button key={f} className={`chip ${fmt === f ? 'on' : ''}`} onClick={() => set('fmt', f === 'All formats' ? null : f)}>
              {f}
            </button>
          ))}
        </div>
        {!day.loading && <span className="foot faint" style={{ marginLeft: 'auto' }}>{total} match{total === 1 ? '' : 'es'}</span>}
      </div>

      {day.loading ? (
        <div className="grid auto">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : day.error && !day.data ? (
        <ErrorState onRetry={day.refresh} />
      ) : groups.length === 0 ? (
        <Empty title={filter === 'live' ? 'Nothing live right now' : 'No matches'} text="Try another day or filter." />
      ) : (
        <div className="stack gap-32">
          {groups.map((g, gi) => (
            <Reveal key={g.id} delay={Math.min(gi, 6) * 0.04}>
              <Link to={`/series/${g.id}`} className="row gap-12" style={{ marginBottom: 14 }}>
                <LeagueLogo src={g.logo} name={g.name} size={36} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title3 ellipsis">{shortLeague(g.name)}</div>
                  <div className="foot faint">
                    {g.matches.length} match{g.matches.length > 1 ? 'es' : ''}
                    {g.matches.some((m) => m.state === 'in') && <span style={{ color: 'var(--live)' }}> · Live</span>}
                  </div>
                </div>
                <Icon name="chevron" size={16} className="faint" />
              </Link>
              <div className="grid auto">
                {g.matches.map((m) => (
                  <MatchCard key={m.id} m={m} showLeague={false} />
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </motion.div>
  )
}
