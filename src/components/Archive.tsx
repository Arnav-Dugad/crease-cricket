import { motion, useInView } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseYmd, useApi, ymd } from '../lib/api'
import { groupsFromScorepanel, shortLeague } from '../lib/normalize'
import { Icon } from './Icon'
import { TeamLogo } from './Media'
import { Rail } from './Rail'
import { SectionHead } from './UI'

export const ARCHIVE_START = new Date(2005, 0, 1)

/** Month calendar for jumping to any date since 2005. */
export function CalendarPicker({ value, onPick }: { value: string; onPick: (d: string) => void }) {
  const sel = parseYmd(value)
  const [cursor, setCursor] = useState(new Date(sel.getFullYear(), sel.getMonth(), 1))
  const today = new Date()
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const startDow = (first.getDay() + 6) % 7 // Monday first
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))]
  const years = Array.from({ length: today.getFullYear() + 1 - ARCHIVE_START.getFullYear() + 1 }, (_, i) => ARCHIVE_START.getFullYear() + i).reverse()
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))
  return (
    <div className="calendar">
      <div className="row between gap-8" style={{ marginBottom: 14 }}>
        <button className="icon-btn" onClick={() => move(-1)} disabled={cursor <= ARCHIVE_START} aria-label="Previous month">
          <Icon name="back" size={18} />
        </button>
        <div className="row gap-8">
          <select className="chip" value={cursor.getMonth()} onChange={(e) => setCursor(new Date(cursor.getFullYear(), +e.target.value, 1))} aria-label="Month">
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={m}>
                {new Date(2000, m, 1).toLocaleDateString(undefined, { month: 'long' })}
              </option>
            ))}
          </select>
          <select className="chip" value={cursor.getFullYear()} onChange={(e) => setCursor(new Date(+e.target.value, cursor.getMonth(), 1))} aria-label="Year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button className="icon-btn" onClick={() => move(1)} aria-label="Next month">
          <Icon name="chevron" size={18} />
        </button>
      </div>
      <div className="cal-grid cap faint">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} style={{ textAlign: 'center' }}>
            {d}
          </span>
        ))}
      </div>
      <motion.div key={`${cursor.getFullYear()}-${cursor.getMonth()}`} className="cal-grid" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        {cells.map((d, i) =>
          d ? (
            <button
              key={i}
              className={`cal-day ${ymd(d) === value ? 'on' : ''} ${ymd(d) === ymd(today) ? 'today' : ''}`}
              onClick={() => onPick(ymd(d))}
            >
              {d.getDate()}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </motion.div>
      <div className="row gap-8 wrap" style={{ marginTop: 14 }}>
        {[
          ['Today', today],
          ['2023 WC final', new Date(2023, 10, 19)],
          ['2011 WC final', new Date(2011, 3, 2)],
          ['2019 WC final', new Date(2019, 6, 14)],
          ['2024 T20 WC final', new Date(2024, 5, 29)],
        ].map(([l, d]) => (
          <button key={l as string} className="chip" style={{ height: 30, fontSize: 13 }} onClick={() => onPick(ymd(d as Date))}>
            {l as string}
          </button>
        ))}
      </div>
    </div>
  )
}

function YearCard({ date }: { date: string }) {
  const d = useApi<unknown[]>(`/api/day/${date}`, { staleMs: 86400_000 })
  const top = useMemo(
    () =>
      groupsFromScorepanel((d.data ?? []) as never[])
        .filter((g) => g.tier <= 1 || g.matches.some((m) => m.intl && !m.women))
        .flatMap((g) => g.matches.filter((m) => m.intl))
        .slice(0, 2),
    [d.data],
  )
  if (!top.length) return null
  return (
    <>
      {top.map((m) => (
        <Link key={m.id} to={`/match/${m.leagueId}/${m.id}`} className="card interactive mcard" viewTransition style={{ minHeight: 0 }}>
          <div className="top">
            <span className="badge">{date.slice(0, 4)}</span>
            {m.format && <span className="badge fmt">{m.format}</span>}
            <span className="ellipsis grow" style={{ textAlign: 'right' }}>
              {shortLeague(m.leagueName)}
            </span>
          </div>
          {m.teams.map((t) => (
            <div key={t.id} className={`trow ${m.state === 'post' && !t.winner && m.teams.some((x) => x.winner) ? 'lost' : ''}`}>
              <TeamLogo src={t.logo} name={t.name} color={t.color} size={26} />
              <div className="tname">{t.name}</div>
              <div className="tscore" style={{ fontSize: 16 }}>
                {t.innings.map((i) => `${i.runs}${i.wkts < 10 ? '/' + i.wkts : ''}`).join(' & ')}
              </div>
            </div>
          ))}
          <div className="status win">{m.status}</div>
        </Link>
      ))}
    </>
  )
}

/** Notable international matches played on this calendar date in past years. */
export function OnThisDay({ date }: { date: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, margin: '300px' })
  const d = parseYmd(date)
  const years = Array.from({ length: d.getFullYear() - 2006 }, (_, i) => d.getFullYear() - 1 - i).filter((y) => y >= 2006)
  return (
    <section className="section" ref={ref}>
      <SectionHead title="On this day." sub={`${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} through the years.`} />
      {seen && (
        <Rail label="On this day">
          {years.map((y) => (
            <YearCard key={y} date={`${y}${date.slice(4)}`} />
          ))}
        </Rail>
      )}
    </section>
  )
}
