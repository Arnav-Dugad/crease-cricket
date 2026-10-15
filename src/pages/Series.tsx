import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MatchCard } from '../components/MatchCard'
import { SeasonInsights, SeasonLeaders } from '../components/SeasonStats'
import { useSeasonAggregate } from '../lib/season'
import { LeagueLogo, TeamLogo } from '../components/Media'
import { NewsCard } from '../components/NewsCard'
import { CardSkeleton, CountUp, Empty, ErrorState, Reveal, Segmented, Skel, pageMotion } from '../components/UI'
import { useApi } from '../lib/api'
import { leagueLogo, shortLeague, teamColor, toMatch } from '../lib/normalize'
import type { MatchLite, NewsArticle } from '../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type SeriesResp = { league: any; events: any[]; standings: any }

interface Row {
  id: string
  name: string
  abbr: string
  logo?: string
  color: string
  rank: number
  p: number
  w: number
  l: number
  nr: number
  pts: number
  nrr: string
  q: boolean
}

function standingsTables(st: any): { name: string; rows: Row[] }[] {
  if (!st) return []
  const groups = st.children?.length ? st.children : [st]
  return groups
    .map((g: any) => {
      const entries = g.standings?.entries ?? []
      const rows: Row[] = entries.map((e: any) => {
        const s: Record<string, any> = {}
        for (const x of e.stats ?? []) s[x.name] = x.displayValue ?? x.value
        return {
          id: String(e.team?.id),
          name: e.team?.displayName,
          abbr: e.team?.abbreviation,
          logo: e.team?.logos?.[0]?.href,
          color: teamColor(e.team?.color, e.team?.displayName ?? ''),
          rank: +s.rank || 0,
          p: +s.matchesPlayed || 0,
          w: +s.matchesWon || 0,
          l: +s.matchesLost || 0,
          nr: +s.noresult || 0,
          pts: +s.matchPoints || 0,
          nrr: s.netrr ?? '-',
          q: s.qualified === 'Y',
        }
      })
      rows.sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.pts - a.pts)
      return { name: g.name || g.standings?.displayName || '', rows }
    })
    .filter((t: any) => t.rows.length)
}

function Standings({ tables }: { tables: { name: string; rows: Row[] }[] }) {
  return (
    <div className="stack gap-24">
      {tables.map((t, ti) => {
        const maxPts = Math.max(...t.rows.map((r) => r.pts), 1)
        return (
          <div key={ti} className="card" style={{ overflow: 'hidden' }}>
            {tables.length > 1 && t.name && (
              <div className="group-head">
                <div className="title3">{t.name}</div>
              </div>
            )}
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>P</th>
                    <th>W</th>
                    <th>L</th>
                    <th>NR</th>
                    <th>NRR</th>
                    <th style={{ minWidth: 120 }}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="l">
                        <div className="row gap-12">
                          <span className="tnum faint" style={{ width: 18, fontWeight: 600 }}>
                            {r.rank || i + 1}
                          </span>
                          <TeamLogo src={r.logo} name={r.name} color={r.color} size={28} />
                          <span style={{ fontWeight: 600 }} className="hide-sm">
                            {r.name}
                          </span>
                          <span style={{ fontWeight: 600 }} className="show-sm">
                            {r.abbr}
                          </span>
                          {r.q && <span className="badge result">Q</span>}
                        </div>
                      </td>
                      <td>{r.p}</td>
                      <td>{r.w}</td>
                      <td>{r.l}</td>
                      <td>{r.nr}</td>
                      <td style={{ color: String(r.nrr).startsWith('-') ? 'var(--red)' : 'var(--green)' }}>{r.nrr}</td>
                      <td>
                        <div className="row gap-10" style={{ justifyContent: 'flex-end' }}>
                          <div style={{ width: 64, height: 6, borderRadius: 99, background: 'var(--fill-2)', overflow: 'hidden' }} className="hide-sm">
                            <motion.div style={{ height: '100%', background: r.color, borderRadius: 99, width: `${(r.pts / maxPts) * 100}%`, transformOrigin: 'left center' }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: i * 0.04 }} />
                          </div>
                          <b>{r.pts}</b>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

type Tab = 'fixtures' | 'results' | 'table' | 'stats' | 'insights' | 'news'

export default function Series() {
  const { league = '' } = useParams()
  const s = useApi<SeriesResp>(`/api/series/${league}`, { poll: 60_000 })
  const news = useApi<NewsArticle[]>(`/api/news/${league}`)
  const lg = s.data?.league
  const name: string = lg?.name ?? ''
  const matches: MatchLite[] = useMemo(() => (s.data?.events ?? []).map((e) => toMatch(e, { id: league, name })), [s.data, league, name])
  const tables = useMemo(() => standingsTables(s.data?.standings), [s.data])
  const upcoming = matches.filter((m) => m.state !== 'post').sort((a, b) => (a.state === 'in' ? -1 : b.state === 'in' ? 1 : +new Date(a.date) - +new Date(b.date)))
  const results = matches.filter((m) => m.state === 'post').sort((a, b) => +new Date(b.date) - +new Date(a.date))
  const relatedNews = (news.data ?? []).filter((a) => a.categories?.some((c) => String(c.leagueId) === league))
  const [tab, setTab] = useState<Tab | null>(null)
  const active: Tab = tab ?? (upcoming.length ? 'fixtures' : tables.length ? 'table' : 'results')
  const done = results.length
  const season = useSeasonAggregate(league, matches, active === 'stats' || active === 'insights')
  const totalM = matches.length
  const first = matches.reduce<string | null>((m, x) => (!m || x.date < m ? x.date : m), null)
  const last = matches.reduce<string | null>((m, x) => (!m || x.date > m ? x.date : m), null)

  const options: { value: Tab; label: string }[] = [
    { value: 'fixtures', label: `Fixtures${upcoming.length ? ` · ${upcoming.length}` : ''}` },
    { value: 'results', label: `Results${results.length ? ` · ${results.length}` : ''}` },
    ...(tables.length ? [{ value: 'table' as Tab, label: 'Table' }] : []),
    ...(results.length >= 2 ? [{ value: 'stats' as Tab, label: 'Stats' }, { value: 'insights' as Tab, label: 'Insights' }] : []),
    ...(relatedNews.length ? [{ value: 'news' as Tab, label: 'News' }] : []),
  ]

  if (s.error && !s.data) return <div className="page"><ErrorState onRetry={s.refresh} /></div>

  return (
    <motion.div className="page" {...pageMotion}>
      <Reveal>
        <div className="card" style={{ padding: 'clamp(22px, 4vw, 40px)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, zIndex: -1, opacity: 0.5, background: 'radial-gradient(80% 120% at 100% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%)' }} />
          <div className="row gap-20 wrap">
            {s.loading ? <Skel w={88} h={88} r={26} /> : <LeagueLogo src={lg?.logos?.[0]?.href ?? leagueLogo(league)} name={name || 'Series'} size={88} />}
            <div className="grow" style={{ minWidth: 220 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {lg?.abbreviation && lg.abbreviation !== name ? lg.abbreviation : 'Series'}
              </div>
              {s.loading ? <Skel w="60%" h={40} /> : <h1 className="large-title">{shortLeague(name)}</h1>}
              {first && last && (
                <div className="sub muted" style={{ marginTop: 6 }}>
                  {new Date(first).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – {new Date(last).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}
            </div>
            {totalM > 0 && (
              <div className="row gap-24">
                <div className="stat-tile" style={{ padding: 0 }}>
                  <div className="v">
                    <CountUp value={totalM} />
                  </div>
                  <div className="l">Matches</div>
                </div>
                <div className="stat-tile" style={{ padding: 0 }}>
                  <div className="v">
                    <CountUp value={done} />
                  </div>
                  <div className="l">Completed</div>
                </div>
              </div>
            )}
          </div>
          {totalM > 0 && (
            <div style={{ marginTop: 24, height: 6, borderRadius: 99, background: 'var(--fill-2)', overflow: 'hidden' }}>
              <motion.div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, var(--accent), var(--purple))' }} initial={{ width: 0 }} animate={{ width: `${(done / totalM) * 100}%` }} transition={{ duration: 1.2, ease: [0.32, 0.72, 0, 1] }} />
            </div>
          )}
        </div>
      </Reveal>

      <div className="sticky-tabs">
        <Segmented value={active} options={options} onChange={setTab} layout="series-tab" />
      </div>

      {s.loading ? (
        <div className="grid auto">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : active === 'table' ? (
        <Standings tables={tables} />
      ) : active === 'stats' ? (
        <SeasonLeaders s={season} />
      ) : active === 'insights' ? (
        <SeasonInsights s={season} />
      ) : active === 'news' ? (
        <div className="grid auto">
          {relatedNews.map((a) => (
            <NewsCard key={a.id} a={a} />
          ))}
        </div>
      ) : (
        (() => {
          const list = active === 'fixtures' ? upcoming : results
          if (!list.length) return <Empty title={active === 'fixtures' ? 'No upcoming fixtures' : 'No results yet'} />
          return (
            <div className="grid auto">
              {list.map((m, i) => (
                <Reveal key={m.id} delay={Math.min(i, 9) * 0.03}>
                  <MatchCard m={m} showLeague={false} />
                </Reveal>
              ))}
            </div>
          )
        })()
      )}
    </motion.div>
  )
}
