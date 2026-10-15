import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { distinctPair } from '../components/charts/Charts'
import { Icon } from '../components/Icon'
import { Avatar, TeamLogo, useWiki } from '../components/Media'
import { Analytics } from '../components/match/Analytics'
import { Commentary } from '../components/match/Commentary'
import { Scorecard } from '../components/match/Scorecard'
import { Info, Squads, Summary } from '../components/match/Summary'
import { ErrorState, Segmented, Skel, StateBadge, pageMotion } from '../components/UI'
import { useApi } from '../lib/api'
import { aggregate, ballKind, ballLabel, chaseWinProb, firstInningsWinProb, isLegal, projectedScore, type InningsAgg } from '../lib/analytics'
import { countdown, shortLeague, startLabel, toMatch } from '../lib/normalize'
import type { Ball, BallsResponse, MatchLite, TeamLite } from '../lib/types'
import { venueQuery } from './Home'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MatchCtx {
  league: string
  event: string
  summary: any
  m: MatchLite
  balls: Ball[]
  ballsPartial: boolean
  innings: InningsAgg[]
  colorOf: (teamIdOrAbbr: string) => string
  live: boolean
}

type Tab = 'summary' | 'scorecard' | 'commentary' | 'analytics' | 'squads' | 'info'

function leagueNameOf(h: any): string {
  return h?.league?.name ?? h?.description?.match(/,\s*(.+?)\s+at\s+/)?.[1] ?? ''
}

function HeroTeam({ t, m, align }: { t: TeamLite; m: MatchLite; align: 'left' | 'right' }) {
  const lost = m.state === 'post' && !t.winner && m.teams.some((x) => x.winner)
  const batting = m.state === 'in' && t.innings.some((i) => i.isCurrent && i.desc !== 'complete')
  return (
    <div className="stack gap-10" style={{ alignItems: align === 'left' ? 'flex-start' : 'flex-end', textAlign: align, flex: 1, minWidth: 0, opacity: lost ? 0.62 : 1 }}>
      <TeamLogo src={t.logo} name={t.name} color={t.color} size={72} />
      <div style={{ fontWeight: 600, fontSize: 'clamp(15px, 2.2vw, 22px)', lineHeight: 1.15, maxWidth: '100%' }}>
        {t.name} {t.winner && <span title="Winner">🏆</span>}
      </div>
      <div className="tnum" style={{ fontSize: 'clamp(30px, 6vw, 56px)', fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1 }}>
        {t.innings.length ? (
          t.innings.map((i, k) => (
            <span key={k} style={{ opacity: k < t.innings.length - 1 ? 0.55 : 1, fontSize: k < t.innings.length - 1 ? '0.6em' : undefined }}>
              {k > 0 && <span style={{ opacity: 0.5, fontSize: '0.6em' }}> & </span>}
              {i.runs}
              {i.wkts < 10 ? `/${i.wkts}` : ''}
            </span>
          ))
        ) : (
          <span style={{ opacity: 0.4 }}>—</span>
        )}
      </div>
      {t.innings.length > 0 && (
        <div className="foot" style={{ opacity: 0.75 }}>
          {batting && <span className="live-dot" style={{ display: 'inline-block', marginRight: 8 }} />}
          {t.innings[t.innings.length - 1].overs} ov{t.innings[t.innings.length - 1].target ? ` · target ${t.innings[t.innings.length - 1].target}` : ''}
        </div>
      )}
    </div>
  )
}

/** Live situation panel: batters, bowler, this over, required rate, projection & win probability. */
function LivePanel({ ctx }: { ctx: MatchCtx }) {
  const { innings, balls, m, colorOf } = ctx
  const last = balls[balls.length - 1]
  const inn = innings[innings.length - 1]
  if (!last || !inn) return null
  const thisOver = inn.overs[inn.overs.length - 1]?.balls ?? []
  const limit = last.limit || inn.limit
  const legal = inn.legal
  const left = last.rem ?? (limit ? limit - legal : 0)
  const crr = legal ? (inn.total / legal) * 6 : 0
  const chasing = !!last.target && inn.inn >= 2 && limit > 0 && limit <= 300
  const need = chasing ? last.target - inn.total : 0
  const rrr = chasing && left > 0 ? (need / left) * 6 : 0
  const limited = limit > 0 && limit <= 300 && innings.length <= 2
  let pBat: number | null = null
  if (limited) pBat = chasing ? chaseWinProb(need, left, 10 - inn.wkts, limit) : innings.length === 1 ? firstInningsWinProb(inn.total, left, 10 - inn.wkts, limit) : null
  const batTeam = m.teams.find((t) => t.id === inn.teamId) ?? m.teams[0]
  const bowlTeam = m.teams.find((t) => t.id !== batTeam.id) ?? m.teams[1]
  const [ca, cb] = [colorOf(batTeam.id), colorOf(bowlTeam.id)]
  return (
    <div className="hero-glass" style={{ padding: 'clamp(16px, 2.5vw, 22px)', marginTop: 14 }}>
      <div className="grid cols-3" style={{ gap: 18 }}>
        <div className="stack gap-10">
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,.6)' }}>
            At the crease
          </div>
          {[last.bat, last.nsb].filter(Boolean).map((b, i) => (
            <Link key={b!.id} to={`/player/${b!.id}`} className="row gap-10">
              <Avatar src={`https://a.espncdn.com/i/headshots/cricket/players/full/${b!.id}.png`} name={b!.n} size={34} />
              <span className="grow ellipsis" style={{ fontWeight: i === 0 ? 700 : 500 }}>
                {b!.n}
                {i === 0 ? ' *' : ''}
              </span>
              <span className="tnum" style={{ fontWeight: 700 }}>
                {b!.r}
                <span style={{ opacity: 0.6, fontWeight: 400 }}> ({b!.b})</span>
              </span>
            </Link>
          ))}
        </div>
        <div className="stack gap-10">
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,.6)' }}>
            Bowling · this over
          </div>
          {last.bowl && (
            <Link to={`/player/${last.bowl.id}`} className="row gap-10">
              <Avatar src={`https://a.espncdn.com/i/headshots/cricket/players/full/${last.bowl.id}.png`} name={last.bowl.n} size={34} />
              <span className="grow ellipsis" style={{ fontWeight: 600 }}>
                {last.bowl.n}
              </span>
              <span className="tnum" style={{ fontWeight: 700 }}>
                {last.bowl.w}-{last.bowl.r} <span style={{ opacity: 0.6, fontWeight: 400 }}>({last.bowl.o})</span>
              </span>
            </Link>
          )}
          <div className="row gap-6 wrap">
            <AnimatePresence initial={false}>
              {thisOver.map((b) => (
                <motion.span key={b.id} className={`ball sm ${ballKind(b)}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
                  {ballLabel(b)}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div className="stack gap-10">
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,.6)' }}>
            Situation
          </div>
          <div className="row gap-16 wrap tnum">
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{crr.toFixed(2)}</div>
              <div className="cap" style={{ opacity: 0.6 }}>
                Run rate
              </div>
            </div>
            {chasing ? (
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{rrr.toFixed(2)}</div>
                <div className="cap" style={{ opacity: 0.6 }}>
                  Required
                </div>
              </div>
            ) : limited && left > 0 ? (
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{projectedScore(inn.total, left, 10 - inn.wkts, limit)}</div>
                <div className="cap" style={{ opacity: 0.6 }}>
                  Projected
                </div>
              </div>
            ) : null}
          </div>
          {chasing && need > 0 && (
            <div className="foot" style={{ fontWeight: 600 }}>
              Need {need} off {left} ball{left === 1 ? '' : 's'}
            </div>
          )}
        </div>
      </div>
      {pBat != null && (
        <div style={{ marginTop: 18 }}>
          <div className="row between foot" style={{ marginBottom: 8, fontWeight: 600 }}>
            <span>
              {batTeam.abbr} {Math.round(pBat * 100)}%
            </span>
            <span style={{ opacity: 0.6, fontWeight: 500 }}>Win probability · model</span>
            <span>
              {Math.round((1 - pBat) * 100)}% {bowlTeam.abbr}
            </span>
          </div>
          <div className="prob" style={{ height: 10 }}>
            <div style={{ flexGrow: pBat, background: ca, borderRadius: 99 }} />
            <div style={{ flexGrow: 1 - pBat, background: cb, borderRadius: 99 }} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function Match() {
  const { league = '', event = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const summary = useApi<any>(`/api/match/${league}/${event}`, { poll: 20_000 })
  const h = summary.data?.header
  const m = useMemo(() => {
    if (!h) return null
    const x = toMatch(h, { id: league, name: leagueNameOf(h) })
    const v = summary.data?.gameInfo?.venue
    if (!x.venue && v) {
      x.venue = v.fullName ?? ''
      x.city = v.address?.city ?? ''
    }
    return x
  }, [h, league, summary.data])
  const live = m?.state === 'in'
  const balls = useApi<BallsResponse>(m && m.state !== 'pre' ? `/api/balls/${league}/${event}${live ? '?live=1' : ''}` : null, { poll: live ? 20_000 : undefined, staleMs: live ? 15_000 : 3600_000 })
  const innings = useMemo(() => aggregate(balls.data?.balls ?? []), [balls.data])
  const wiki = useWiki(m ? venueQuery(m) : null)

  const colorOf = useMemo(() => {
    if (!m) return () => '#0A84FF'
    const [c1, c2] = distinctPair(m.teams[0].color, m.teams[1].color)
    return (k: string) => (k === m.teams[0].id || k === m.teams[0].abbr ? c1 : k === m.teams[1].id || k === m.teams[1].abbr ? c2 : '#8E8E93')
  }, [m])

  const hasBalls = innings.length > 0
  const tabs: { value: Tab; label: string }[] = [
    { value: 'summary', label: 'Summary' },
    ...(m && m.state !== 'pre' ? [{ value: 'scorecard' as Tab, label: 'Scorecard' }] : []),
    ...(hasBalls ? [{ value: 'commentary' as Tab, label: 'Commentary' }] : []),
    ...(hasBalls ? [{ value: 'analytics' as Tab, label: 'Analytics' }] : []),
    { value: 'squads', label: 'Squads' },
    { value: 'info', label: 'Info' },
  ]
  const tabParam = sp.get('tab') as Tab | null
  const tab: Tab = tabs.some((t) => t.value === tabParam) ? tabParam! : 'summary'

  if (summary.error && !summary.data)
    return (
      <div className="page">
        <ErrorState onRetry={summary.refresh} text="This match couldn’t be loaded." />
      </div>
    )

  const ctx: MatchCtx | null = m
    ? { league, event, summary: summary.data, m, balls: balls.data?.balls ?? [], ballsPartial: !!balls.data?.partial, innings, colorOf, live: !!live }
    : null
  const img = wiki.data?.image
  const legalBalls = innings[innings.length - 1]?.balls.filter(isLegal).length ?? 0

  return (
    <motion.div className="page" {...pageMotion}>
      <div className="hero-card" style={{ minHeight: 0, borderRadius: 'var(--r-xl)' }}>
        <div className="bg-img">
          {img ? (
            <motion.img src={img} alt={m?.venue} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} style={{ filter: 'saturate(1.1)' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: m ? `radial-gradient(120% 90% at 0% 0%, ${m.teams[0].color} 0%, transparent 55%), radial-gradient(120% 90% at 100% 100%, ${m.teams[1].color} 0%, transparent 55%), #0b0b0f` : '#111' }} />
          )}
        </div>
        <div className="bg-shade" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.55) 40%, rgba(0,0,0,.85))' }} />
        <div style={{ padding: 'clamp(16px, 3vw, 28px)' }}>
          <div className="row gap-8 wrap" style={{ marginBottom: 'clamp(18px, 4vw, 40px)' }}>
            {m ? (
              <>
                <StateBadge m={m} />
                {m.format && (
                  <span className="badge" style={{ background: 'rgba(255,255,255,.16)', color: 'white' }}>
                    {m.format}
                  </span>
                )}
                <Link to={`/series/${league}`} className="foot row gap-4" style={{ fontWeight: 600, opacity: 0.9 }}>
                  {shortLeague(m.leagueName)} <Icon name="chevron" size={12} stroke={2.4} />
                </Link>
                <span className="foot" style={{ opacity: 0.65 }}>
                  {m.desc.split(',')[0]}
                </span>
              </>
            ) : (
              <Skel w={240} h={22} style={{ opacity: 0.4 }} />
            )}
          </div>
          {m ? (
            <div className="row gap-16" style={{ alignItems: 'flex-end' }}>
              <HeroTeam t={m.teams[0]} m={m} align="left" />
              <div className="foot" style={{ opacity: 0.5, fontWeight: 700, paddingBottom: 30 }}>
                VS
              </div>
              <HeroTeam t={m.teams[1]} m={m} align="right" />
            </div>
          ) : (
            <Skel h={180} style={{ opacity: 0.3 }} />
          )}
          {m && (
            <div className="row between gap-12 wrap" style={{ marginTop: 26, paddingTop: 18, borderTop: '0.5px solid rgba(255,255,255,.2)' }}>
              <div style={{ fontSize: 'clamp(15px, 2vw, 18px)', fontWeight: 600, color: live ? '#ff8aa5' : 'white' }}>{m.state === 'pre' ? `Starts in ${countdown(m.date)}` : m.status || m.detail}</div>
              <div className="foot row gap-6" style={{ opacity: 0.75 }}>
                <Icon name="pin" size={14} /> {m.venue.split(',')[0] || 'Venue TBC'}
                <span className="dot-sep" />
                <Icon name="clock" size={14} /> {startLabel(m.date)}
              </div>
            </div>
          )}
          {ctx && live && hasBalls && legalBalls >= 0 && <LivePanel ctx={ctx} />}
        </div>
      </div>

      <div className="sticky-tabs">
        <Segmented
          value={tab}
          options={tabs}
          layout="match-tab"
          onChange={(v) => {
            const n = new URLSearchParams(sp)
            if (v === 'summary') n.delete('tab')
            else n.set('tab', v)
            setSp(n, { replace: true })
          }}
        />
      </div>

      {!ctx ? (
        <div className="stack gap-16">
          <Skel h={240} r={24} />
          <Skel h={160} r={24} />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}>
            {tab === 'summary' && <Summary ctx={ctx} />}
            {tab === 'scorecard' && <Scorecard ctx={ctx} />}
            {tab === 'commentary' && <Commentary ctx={ctx} />}
            {tab === 'analytics' && <Analytics ctx={ctx} />}
            {tab === 'squads' && <Squads ctx={ctx} />}
            {tab === 'info' && <Info ctx={ctx} wiki={wiki.data} />}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  )
}
