import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { matchHref, MatchCard } from '../components/MatchCard'
import { LeagueLogo, TeamLogo, useWiki } from '../components/Media'
import { NewsCard } from '../components/NewsCard'
import { CardSkeleton, Reveal, SectionHead, Skel, StateBadge, pageMotion } from '../components/UI'
import { addDays, useApi, ymd } from '../lib/api'
import { countdown, groupsFromScorepanel, matchPriority, shortLeague } from '../lib/normalize'
import type { MatchLite, NewsArticle, TeamLite } from '../lib/types'

export function venueQuery(m: { venue: string; city?: string }) {
  return m.venue ? `${m.venue.split(',')[0]} ${m.city ?? ''} cricket ground` : null
}

function HeroTeam({ t, m, align }: { t: TeamLite; m: MatchLite; align: 'left' | 'right' }) {
  const lost = m.state === 'post' && !t.winner && m.teams.some((x) => x.winner)
  return (
    <div className="stack gap-12" style={{ alignItems: align === 'left' ? 'flex-start' : 'flex-end', textAlign: align, minWidth: 0, flex: 1, opacity: lost ? 0.6 : 1 }}>
      <TeamLogo src={t.logo} name={t.name} color={t.color} size={64} />
      <div style={{ fontWeight: 600, fontSize: 'clamp(15px, 2vw, 19px)', lineHeight: 1.2, maxWidth: '100%' }} className="ellipsis">
        {t.name}
      </div>
      {m.state !== 'pre' && (
        <div className="tnum" style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>
          {t.innings.length ? t.innings.map((i) => `${i.runs}${i.wkts < 10 ? '/' + i.wkts : ''}`).join(' & ') : 'Yet to bat'}
        </div>
      )}
      {t.innings.length > 0 && m.format !== 'Test' && <div style={{ fontSize: 13, opacity: 0.7 }}>{t.innings[t.innings.length - 1].overs} overs</div>}
    </div>
  )
}

function HeroCard({ m }: { m: MatchLite }) {
  const wiki = useWiki(venueQuery(m))
  const img = wiki.data?.image
  const [a, b] = m.teams
  return (
    <Link to={matchHref(m)} className="hero-card" style={{ display: 'flex', flexDirection: 'column', scrollSnapAlign: 'center' }}>
      <div className="bg-img">
        {img ? (
          <motion.img src={img} alt={m.venue} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: `radial-gradient(120% 90% at 0% 0%, ${a.color} 0%, transparent 55%), radial-gradient(120% 90% at 100% 100%, ${b.color} 0%, transparent 55%), #0b0b0f` }} />
        )}
      </div>
      <div className="bg-shade" />
      <div className="row gap-8 wrap" style={{ padding: '22px 24px 0' }}>
        <StateBadge m={m} />
        {m.format && (
          <span className="badge" style={{ background: 'rgba(255,255,255,.16)', color: 'white' }}>
            {m.format}
          </span>
        )}
        <span className="foot" style={{ opacity: 0.85, fontWeight: 500 }}>
          {shortLeague(m.leagueName)}
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <div className="hero-glass" style={{ margin: 14, padding: 'clamp(18px, 3vw, 28px)' }}>
        <div className="foot" style={{ opacity: 0.75, marginBottom: 16 }}>
          {m.desc.split(',')[0]}
          {m.venue && ` · ${m.venue.split(',')[0]}`}
        </div>
        <div className="row gap-16" style={{ alignItems: 'flex-end' }}>
          <HeroTeam t={a} m={m} align="left" />
          {m.state === 'pre' ? (
            <div style={{ textAlign: 'center', paddingBottom: 4, flex: 'none' }}>
              <div className="tnum" style={{ fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 700, letterSpacing: '-0.03em' }}>
                {new Date(m.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </div>
              <div className="foot" style={{ opacity: 0.7 }}>{new Date(m.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            </div>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.55, paddingBottom: 8 }}>VS</div>
          )}
          <HeroTeam t={b} m={m} align="right" />
        </div>
        <div className="row between gap-12" style={{ marginTop: 20, paddingTop: 16, borderTop: '0.5px solid rgba(255,255,255,.18)' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: m.state === 'in' ? '#ff8aa5' : 'white' }} className="ellipsis">
            {m.state === 'pre' ? `Starts in ${countdown(m.date)}` : m.status || m.detail}
          </div>
          <span className="btn light" style={{ height: 36, padding: '0 16px', fontSize: 14, flex: 'none' }}>
            Match Centre <Icon name="chevron" size={14} stroke={2.4} />
          </span>
        </div>
      </div>
    </Link>
  )
}

function HeroCarousel({ matches }: { matches: MatchLite[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = () => {
      const mid = el.scrollLeft + el.clientWidth / 2
      let best = 0, bd = Infinity
      Array.from(el.children).forEach((c, i) => {
        const h = c as HTMLElement
        const d = Math.abs(h.offsetLeft - el.offsetLeft + h.clientWidth / 2 - mid)
        if (d < bd) { bd = d; best = i }
      })
      setIdx(best)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  const go = (i: number) => {
    const el = ref.current
    if (!el) return
    const child = el.children[i] as HTMLElement | undefined
    child && el.scrollTo({ left: child.offsetLeft - el.offsetLeft - (el.clientWidth - child.clientWidth) / 2, behavior: 'smooth' })
  }
  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} className="hero-rail" style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'min(92%, 1100px)', gap: 16, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', padding: '6px 4%', margin: '0 -4%' }}>
        {matches.map((m) => (
          <HeroCard key={m.id} m={m} />
        ))}
      </div>
      {matches.length > 1 && (
        <div className="row center gap-8" style={{ marginTop: 18 }}>
          {matches.map((m, i) => (
            <button key={m.id} aria-label={`Show ${m.title}`} onClick={() => go(i)} style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 99, background: i === idx ? 'var(--text)' : 'var(--fill)', transition: 'all .4s var(--ease)' }} />
          ))}
        </div>
      )}
    </div>
  )
}

function Greeting() {
  const h = new Date().getHours()
  return <>{h < 5 ? 'Late night cricket.' : h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.'}</>
}

export default function Home() {
  const today = new Date()
  const dToday = useApi<unknown[]>(`/api/day/${ymd(today)}`, { poll: 30_000 })
  const dYest = useApi<unknown[]>(`/api/day/${ymd(addDays(today, -1))}`)
  const dTmr = useApi<unknown[]>(`/api/day/${ymd(addDays(today, 1))}`)
  const dPlus2 = useApi<unknown[]>(`/api/day/${ymd(addDays(today, 2))}`)
  const dPlus3 = useApi<unknown[]>(`/api/day/${ymd(addDays(today, 3))}`)
  const news = useApi<NewsArticle[]>('/api/news')

  const groupsToday = useMemo(() => groupsFromScorepanel((dToday.data ?? []) as never[]), [dToday.data])
  const groupsYest = useMemo(() => groupsFromScorepanel((dYest.data ?? []) as never[]), [dYest.data])
  const groupsTmr = useMemo(() => groupsFromScorepanel((dTmr.data ?? []) as never[]), [dTmr.data])
  const groupsLater = useMemo(() => groupsFromScorepanel([...(dPlus2.data ?? []), ...(dPlus3.data ?? [])] as never[]), [dPlus2.data, dPlus3.data])

  const featured = useMemo(() => {
    const all = [...groupsToday, ...groupsYest, ...groupsTmr, ...groupsLater].flatMap((g) => g.matches.map((m) => ({ m, p: matchPriority(m, g.tier) })))
    const seen = new Set<string>()
    return all
      .sort((a, b) => b.p - a.p)
      .filter(({ m }) => !seen.has(m.id) && seen.add(m.id))
      .slice(0, 6)
      .map((x) => x.m)
  }, [groupsToday, groupsYest, groupsTmr, groupsLater])

  const live = useMemo(() => {
    const ids = new Set<string>()
    return [...groupsYest, ...groupsToday].flatMap((g) => g.matches).filter((m) => m.state === 'in' && !ids.has(m.id) && ids.add(m.id))
  }, [groupsToday, groupsYest])
  const results = useMemo(() => [...groupsToday, ...groupsYest].flatMap((g) => g.matches.filter((m) => m.state === 'post').map((m) => ({ m, t: g.tier }))).sort((a, b) => a.t - b.t || +new Date(b.m.date) - +new Date(a.m.date)).slice(0, 12).map((x) => x.m), [groupsToday, groupsYest])
  const upcoming = useMemo(() => {
    const ids = new Set(live.map((m) => m.id))
    return [...groupsToday, ...groupsTmr, ...groupsLater].flatMap((g) => g.matches.filter((m) => m.state === 'pre' && m.teams[0].name !== 'TBC' && !ids.has(m.id)).map((m) => ({ m, t: g.tier }))).sort((a, b) => a.t - b.t || +new Date(a.m.date) - +new Date(b.m.date)).slice(0, 12).map((x) => x.m)
  }, [groupsToday, groupsTmr, groupsLater, live])

  const loading = dToday.loading && dYest.loading
  const liveCount = live.length

  return (
    <motion.div className="page" {...pageMotion}>
      <Reveal>
        <div className="row between wrap gap-16" style={{ marginBottom: 28, alignItems: 'flex-end' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <h1 className="hero-title">
              <Greeting /> <br className="hide-sm" />
              <span className="gradient-text">Cricket, beautifully live.</span>
            </h1>
          </div>
          <AnimatePresence>
            {liveCount > 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="card row gap-10" style={{ padding: '10px 16px', borderRadius: 99 }}>
                <span className="live-dot" />
                <span className="sub" style={{ fontWeight: 600 }}>
                  {liveCount} match{liveCount > 1 ? 'es' : ''} live now
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>

      {loading ? (
        <Skel h={440} r={32} />
      ) : featured.length ? (
        <Reveal y={30}>
          <HeroCarousel matches={featured} />
        </Reveal>
      ) : null}

      {live.length > 0 && (
        <section className="section">
          <SectionHead title="Live now." sub="Ball by ball, as it happens." to="/matches" />
          <div className="rail">
            {live.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead title="Today." sub="Across every competition." to="/matches" linkText="Full schedule" />
        {dToday.loading ? (
          <div className="grid auto">
            {Array.from({ length: 3 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : groupsToday.length === 0 ? (
          <div className="card empty">
            <div className="title3">A quiet day on the circuit</div>
            <div className="sub">No matches scheduled today — explore results and upcoming fixtures below.</div>
          </div>
        ) : (
          <div className="stack gap-16">
            {groupsToday.slice(0, 6).map((g, gi) => (
              <Reveal key={g.id} delay={gi * 0.05}>
                <div className="row gap-12" style={{ margin: '8px 0 12px' }}>
                  <LeagueLogo src={g.logo} name={g.name} size={30} />
                  <Link to={`/series/${g.id}`} className="headline grow ellipsis">
                    {shortLeague(g.name)}
                  </Link>
                  <span className="foot faint">
                    {g.matches.length} match{g.matches.length > 1 ? 'es' : ''}
                  </span>
                </div>
                <div className="grid auto">
                  {g.matches.slice(0, 6).map((m) => (
                    <MatchCard key={m.id} m={m} showLeague={false} />
                  ))}
                </div>
              </Reveal>
            ))}
            {groupsToday.length > 6 && (
              <Link to="/matches" className="btn ghost" style={{ alignSelf: 'center' }}>
                {groupsToday.length - 6} more competitions today
              </Link>
            )}
          </div>
        )}
      </section>

      {news.data && news.data.length > 0 && (
        <section className="section">
          <SectionHead title="Top stories." sub="The latest from around the game." to="/news" />
          <div className="news-grid">
            {news.data.slice(0, 5).map((a, i) => (
              <Reveal key={a.id} delay={i * 0.06} className={i === 0 ? 'news-lead' : ''}>
                <NewsCard a={a} big={i === 0} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="section">
          <SectionHead title="Results." sub="How it finished." to="/matches" />
          <div className="rail">
            {results.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="section">
          <SectionHead title="Coming up." sub="Set your alarms." to="/matches" />
          <div className="rail">
            {upcoming.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}
    </motion.div>
  )
}
