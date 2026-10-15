import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { LeagueLogo } from '../components/Media'
import { Reveal, SectionHead, Skel, pageMotion } from '../components/UI'
import { addDays, prefetch, useApi, ymd } from '../lib/api'
import { groupsFromScorepanel, shortLeague } from '../lib/normalize'
import type { LeagueGroup } from '../lib/types'

const OFFSETS = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]

function useDays() {
  const today = new Date()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return OFFSETS.map((o) => useApi<unknown[]>(`/api/day/${ymd(addDays(today, o))}`))
}

const BUCKETS: { key: string; title: string; sub: string; test: (g: LeagueGroup) => boolean }[] = [
  { key: 'intl', title: 'International.', sub: 'Tours, tri-series and ICC events.', test: (g) => g.matches.some((m) => m.intl && !m.women) },
  { key: 'league', title: 'Franchise leagues.', sub: 'T20 cricket’s biggest stages.', test: (g) => g.tier === 2 },
  { key: 'women', title: 'Women’s cricket.', sub: 'International and domestic.', test: (g) => g.matches.some((m) => m.women) },
  { key: 'domestic', title: 'Domestic & more.', sub: 'First-class, List A and associates.', test: () => true },
]

export default function SeriesList() {
  const days = useDays()
  const loading = days.every((d) => d.loading)
  const groups = useMemo(() => {
    const all = groupsFromScorepanel(days.flatMap((d) => (d.data ?? []) as never[]))
    const used = new Set<string>()
    return BUCKETS.map((b) => {
      const gs = all.filter((g) => !used.has(g.id) && b.test(g))
      gs.forEach((g) => used.add(g.id))
      return { ...b, groups: gs }
    }).filter((b) => b.groups.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, days.map((d) => d.data))

  return (
    <motion.div className="page" {...pageMotion}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        This week & next
      </div>
      <h1 className="large-title" style={{ marginBottom: 32 }}>
        Series
      </h1>
      {loading ? (
        <div className="grid auto">
          {Array.from({ length: 6 }, (_, i) => (
            <Skel key={i} h={96} r={24} />
          ))}
        </div>
      ) : (
        groups.map((b) => (
          <section key={b.key} style={{ marginBottom: 48 }}>
            <SectionHead title={b.title} sub={b.sub} />
            <div className="grid auto">
              {b.groups.map((g, i) => {
                const live = g.matches.filter((m) => m.state === 'in').length
                const next = g.matches.filter((m) => m.state === 'pre').sort((a, c) => +new Date(a.date) - +new Date(c.date))[0]
                return (
                  <Reveal key={g.id} delay={Math.min(i, 8) * 0.03}>
                    <Link to={`/series/${g.id}`} className="card interactive row gap-16" style={{ padding: 18 }} onMouseEnter={() => prefetch(`/api/series/${g.id}`)}>
                      <LeagueLogo src={g.logo} name={g.name} size={52} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="headline ellipsis">{shortLeague(g.name)}</div>
                        <div className="foot muted ellipsis">
                          {live ? <span style={{ color: 'var(--live)', fontWeight: 600 }}>● {live} live · </span> : null}
                          {next ? `Next: ${next.teams[0].abbr} v ${next.teams[1].abbr}, ${new Date(next.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : `${g.matches.length} recent match${g.matches.length > 1 ? 'es' : ''}`}
                        </div>
                      </div>
                      <Icon name="chevron" size={16} className="faint" />
                    </Link>
                  </Reveal>
                )
              })}
            </div>
          </section>
        ))
      )}
    </motion.div>
  )
}
