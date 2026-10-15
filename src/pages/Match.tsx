import { AnimatePresence, motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Celebration, type Moment } from '../components/Celebration'
import { distinctPair } from '../components/charts/Charts'
import { FollowTeamButton } from '../components/Follow'
import { Icon } from '../components/Icon'
import { Analytics } from '../components/match/Analytics'
import { Commentary } from '../components/match/Commentary'
import { Scorecard } from '../components/match/Scorecard'
import { Info, Squads, Summary } from '../components/match/Summary'
import { Avatar, TeamLogo, useWiki } from '../components/Media'
import { Odometer } from '../components/Odometer'
import { ErrorState, Segmented, Skel, StateBadge, pageMotion } from '../components/UI'
import { useApi } from '../lib/api'
import { aggregate, ballKind, ballLabel, isLegal, projectedScore, winProbSeries, type InningsAgg } from '../lib/analytics'
import { useImageTint } from '../lib/color'
import { histFormat, modelFor, trainedWinModel, useHistVenue, useModel, venueFormatKey, type TrainedWinModel } from '../lib/hist'
import { lockScreenActive, lockScreenSupported, startLockScreen, stopLockScreen, updateLockScreen, useLiveChannel } from '../lib/live'
import { countdown, espnImg, shortLeague, startLabel, toMatch } from '../lib/normalize'
import { prefersReducedMotion } from '../lib/prefs'
import type { Ball, BallsResponse, MatchLite, TeamLite, WikiInfo } from '../lib/types'
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
  trained: TrainedWinModel | null
  wiki?: WikiInfo
}

type Tab = 'summary' | 'scorecard' | 'commentary' | 'analytics' | 'squads' | 'info'

function leagueNameOf(h: any): string {
  return h?.league?.name ?? h?.description?.match(/,\s*(.+?)\s+at\s+/)?.[1] ?? ''
}

const utcYmd = (iso: string) => iso.slice(0, 10).replace(/-/g, '')

function HeroTeam({ t, m, align, vt }: { t: TeamLite; m: MatchLite; align: 'left' | 'right'; vt: string }) {
  const lost = m.state === 'post' && !t.winner && m.teams.some((x) => x.winner)
  const batting = m.state === 'in' && t.innings.some((i) => i.isCurrent && i.desc !== 'complete')
  const last = t.innings[t.innings.length - 1]
  return (
    <div className="stack gap-10" style={{ alignItems: align === 'left' ? 'flex-start' : 'flex-end', textAlign: align, flex: 1, minWidth: 0, opacity: lost ? 0.62 : 1 }}>
      <div className="row gap-8" style={{ flexDirection: align === 'left' ? 'row' : 'row-reverse' }}>
        <Link to={`/team/${t.id}/${encodeURIComponent(t.name)}`} style={{ viewTransitionName: vt, borderRadius: '50%', display: 'inline-flex' } as CSSProperties} viewTransition>
          <TeamLogo src={t.logo} name={t.name} color={t.color} size={72} />
        </Link>
        {t.name !== 'TBC' && <FollowTeamButton team={{ id: t.id, name: t.name, logo: t.logo, color: t.color }} compact onDark />}
      </div>
      <div style={{ fontWeight: 600, fontSize: 'clamp(15px, 2.2vw, 22px)', lineHeight: 1.15, maxWidth: '100%' }}>
        {t.name} {t.winner && <span title="Winner">🏆</span>}
      </div>
      <div className="tnum" style={{ fontSize: 'clamp(30px, 6vw, 56px)', fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1 }}>
        {t.innings.length ? (
          <>
            {t.innings.slice(0, -1).map((i, k) => (
              <span key={k} style={{ opacity: 0.55, fontSize: '0.6em' }}>
                {i.runs}
                {i.wkts < 10 ? `/${i.wkts}` : ''}
                <span style={{ opacity: 0.6 }}> & </span>
              </span>
            ))}
            <Odometer value={`${last.runs}${last.wkts < 10 ? '/' + last.wkts : ''}`} />
          </>
        ) : (
          <span style={{ opacity: 0.4 }}>{m.state === 'pre' ? '' : '—'}</span>
        )}
      </div>
      {last && (
        <div className="foot" style={{ opacity: 0.8 }}>
          {batting && <span className="live-dot" style={{ display: 'inline-block', marginRight: 8 }} />}
          {last.overs} ov{last.target ? ` · target ${last.target}` : ''}
        </div>
      )}
    </div>
  )
}

/** Live situation panel: batters, bowler, this over, required rate, projection & win probability. */
function LivePanel({ ctx, wpNow }: { ctx: MatchCtx; wpNow: number | null }) {
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
  // wpNow = P(team batting first wins)
  const pBat = wpNow == null || !limited ? null : inn.inn === 1 ? wpNow : 1 - wpNow
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
              <Avatar id={b!.id} name={b!.n} size={34} />
              <span className="grow ellipsis" style={{ fontWeight: i === 0 ? 700 : 500 }}>
                {b!.n}
                {i === 0 ? ' *' : ''}
              </span>
              <span className="tnum" style={{ fontWeight: 700 }}>
                <Odometer value={String(b!.r)} />
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
              <Avatar id={last.bowl.id} name={last.bowl.n} size={34} />
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
            <span style={{ opacity: 0.6, fontWeight: 500 }}>Win probability · {ctx.trained ? 'trained model' : 'model'}</span>
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

/** Detect celebration-worthy deliveries that arrived since the last update. */
function useCelebrations(balls: Ball[], enabled: boolean): Moment | null {
  const seen = useRef<string | null>(null)
  const [moment, setMoment] = useState<Moment | null>(null)
  useEffect(() => {
    const last = balls[balls.length - 1]
    if (!last) return
    const prev = seen.current
    seen.current = last.id
    if (!enabled || !prev || prev === last.id) return
    const idx = balls.findIndex((b) => b.id === prev)
    const fresh = idx >= 0 ? balls.slice(idx + 1) : []
    if (!fresh.length) return
    let best: Moment | null = null
    const rank = { hundred: 5, wicket: 4, fifty: 3, six: 2, four: 1 }
    for (const b of fresh) {
      let m: Moment | null = null
      if (b.w) m = { kind: 'wicket', key: b.id, title: b.wtext?.split(/\s+(?=c |b |lbw|st |run out)/)[0] || b.bat?.n || 'Wicket', sub: b.wtext || b.short }
      else if (b.bat && b.bat.r >= 100 && b.bat.r - b.r < 100) m = { kind: 'hundred', key: b.id, title: `${b.bat.n} — hundred!`, sub: `${b.bat.r} off ${b.bat.b}` }
      else if (b.bat && b.bat.r >= 50 && b.bat.r - b.r < 50) m = { kind: 'fifty', key: b.id, title: `${b.bat.n} — fifty`, sub: `${b.bat.r} off ${b.bat.b}` }
      else if (ballKind(b) === 'six') m = { kind: 'six', key: b.id, title: b.bat?.n ?? 'Six!', sub: b.short }
      else if (ballKind(b) === 'four') m = { kind: 'four', key: b.id, title: b.bat?.n ?? 'Four!', sub: b.short }
      if (m && (!best || rank[m.kind] >= rank[best.kind])) best = m
    }
    if (best) setMoment(best)
  }, [balls, enabled])
  return moment
}

function LockScreenButton({ ctx }: { ctx: MatchCtx }) {
  const [on, setOn] = useState(lockScreenActive())
  const last = ctx.balls[ctx.balls.length - 1]
  const inn = ctx.innings[ctx.innings.length - 1]
  useEffect(() => {
    if (!on || !inn) return
    const bat = ctx.m.teams.find((t) => t.id === inn.teamId)
    const need = last?.target ? last.target - inn.total : 0
    updateLockScreen(
      `${bat?.abbr ?? inn.team} ${inn.total}/${inn.wkts} (${Math.floor(inn.legal / 6)}.${inn.legal % 6})`,
      need > 0 ? `Need ${need} off ${last?.rem ?? '?'}` : last?.short ?? ctx.m.status,
      ctx.m.title,
      bat?.logo ? espnImg(bat.logo, 256) : null,
    )
  }, [on, inn, last, ctx.m])
  useEffect(() => () => stopLockScreen(), [])
  if (!lockScreenSupported()) return null
  return (
    <button
      className={`hero-pill ${on ? 'on' : ''}`}
      onClick={async () => {
        if (on) {
          stopLockScreen()
          setOn(false)
        } else setOn(await startLockScreen())
      }}
      title="Show the live score on your lock screen (uses media controls)"
    >
      <Icon name="lock" size={14} /> {on ? 'On lock screen' : 'Lock screen'}
    </button>
  )
}

export default function Match() {
  const { league = '', event = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const reduced = prefersReducedMotion()

  // First load without a version key; once we know the match is live, a WebSocket tick id
  // becomes part of the URL so every viewer pulls the same fresh, edge-cached payload.
  const first = useApi<any>(`/api/match/${league}/${event}`, { poll: 60_000 })
  const isLive = first.data?.header?.competitions?.[0]?.status?.type?.state === 'in'
  const matchDate = first.data?.header?.competitions?.[0]?.date as string | undefined
  const channel = useLiveChannel(league, event, matchDate ? utcYmd(matchDate) : null, isLive)
  const v = channel.state === 'live' && channel.tick ? `?v=${channel.tick}` : ''
  const fallbackPoll = isLive && channel.state !== 'live' ? 20_000 : undefined
  const summary = useApi<any>(`/api/match/${league}/${event}${v}`, { poll: fallbackPoll })
  const data = summary.data ?? first.data
  const h = data?.header
  const m = useMemo(() => {
    if (!h) return null
    const x = toMatch(h, { id: league, name: leagueNameOf(h) })
    const venue = data?.gameInfo?.venue
    if (!x.venue && venue) {
      x.venue = venue.fullName ?? ''
      x.city = venue.address?.city ?? ''
    }
    return x
  }, [h, league, data])
  const live = m?.state === 'in'
  const balls = useApi<BallsResponse>(m && m.state !== 'pre' ? `/api/balls/${league}/${event}${live ? (v ? `${v}&live=1` : '?live=1') : ''}` : null, {
    poll: live ? fallbackPoll : undefined,
    staleMs: live ? 15_000 : 3600_000,
  })
  const innings = useMemo(() => aggregate(balls.data?.balls ?? []), [balls.data])
  const wiki = useWiki(m ? venueQuery(m) : null)

  // trained win-probability model, calibrated with the venue's own par score
  const model = useModel()
  const limit = innings[0]?.limit ?? 0
  const venueHist = useHistVenue(m?.venue || null, m?.city)
  const trained = useMemo(() => {
    if (!m) return null
    const fm = modelFor(model.data, limit, m.women)
    const vb = venueHist.data?.formats?.[venueFormatKey(histFormat(m.format, limit), m.women)]
    return trainedWinModel(fm, vb?.parByOver, vb?.parN)
  }, [model.data, limit, m, venueHist.data])
  const wpNow = useMemo(() => {
    const s = winProbSeries(innings, trained)
    return s.length > 1 ? s[s.length - 1].p : null
  }, [innings, trained])

  const colorOf = useMemo(() => {
    if (!m) return () => '#0A84FF'
    const [c1, c2] = distinctPair(m.teams[0].color, m.teams[1].color)
    return (k: string) => (k === m.teams[0].id || k === m.teams[0].abbr ? c1 : k === m.teams[1].id || k === m.teams[1].abbr ? c2 : '#8E8E93')
  }, [m])

  const moment = useCelebrations(balls.data?.balls ?? [], !!live)
  const img = wiki.data?.image
  const tint = useImageTint(img)

  // parallax + tilt on the hero
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()
  const bgY = useTransform(scrollY, [0, 600], [0, reduced ? 0 : 120])
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const srx = useSpring(rx, { stiffness: 120, damping: 18 })
  const sry = useSpring(ry, { stiffness: 120, damping: 18 })
  const onTilt = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== 'mouse') return
    const r = heroRef.current?.getBoundingClientRect()
    if (!r) return
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 3)
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 3)
  }

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

  if (first.error && !data)
    return (
      <div className="page">
        <ErrorState onRetry={first.refresh} text="This match couldn’t be loaded." />
      </div>
    )

  const ctx: MatchCtx | null = m
    ? { league, event, summary: data, m, balls: balls.data?.balls ?? [], ballsPartial: !!balls.data?.partial, innings, colorOf, live: !!live, trained, wiki: wiki.data }
    : null
  const accents = m ? ({ '--team-a': colorOf(m.teams[0].id), '--team-b': colorOf(m.teams[1].id), '--tint': tint ?? 'transparent' } as CSSProperties) : undefined
  const legalBalls = innings[innings.length - 1]?.balls.filter(isLegal).length ?? 0

  return (
    <motion.div className="page match-page" style={accents} {...pageMotion}>
      <Celebration moment={moment} />
      <motion.div ref={heroRef} className="hero-card match-hero" style={{ minHeight: 0, borderRadius: 'var(--r-xl)', rotateX: srx, rotateY: sry, transformPerspective: 1200 }} onPointerMove={onTilt} onPointerLeave={() => (rx.set(0), ry.set(0))}>
        <motion.div className="bg-img" style={{ y: bgY, bottom: -120 }}>
          {img ? (
            <motion.img src={img} alt={m?.venue} fetchPriority="high" initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1.06 }} transition={{ duration: 1.2 }} style={{ filter: 'saturate(1.1)' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: m ? `radial-gradient(120% 90% at 0% 0%, ${m.teams[0].color} 0%, transparent 55%), radial-gradient(120% 90% at 100% 100%, ${m.teams[1].color} 0%, transparent 55%), #0b0b0f` : '#111' }} />
          )}
        </motion.div>
        <div className="bg-shade" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.55) 40%, rgba(0,0,0,.85))' }} />
        <div className="team-glow" />
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
                <Link to={`/series/${league}`} className="foot row gap-4" style={{ fontWeight: 600, opacity: 0.9 }} viewTransition>
                  {shortLeague(m.leagueName)} <Icon name="chevron" size={12} stroke={2.4} />
                </Link>
                <span className="foot" style={{ opacity: 0.65 }}>
                  {m.desc.split(',')[0]}
                </span>
                <span style={{ flex: 1 }} />
                {live && channel.state === 'live' && (
                  <span className="hero-pill" title="Real-time updates over a live connection">
                    <span className="live-dot" /> Real-time
                  </span>
                )}
                {live && <LockScreenButton ctx={ctx!} />}
              </>
            ) : (
              <Skel w={240} h={22} style={{ opacity: 0.4 }} />
            )}
          </div>
          {m ? (
            <div className="row gap-16" style={{ alignItems: 'flex-end' }}>
              <HeroTeam t={m.teams[0]} m={m} align="left" vt="vt-logo-a" />
              <div style={{ textAlign: 'center', paddingBottom: 30, flex: 'none' }}>
                {m.state === 'pre' ? (
                  <>
                    <div className="tnum" style={{ fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 700, letterSpacing: '-0.03em' }}>
                      {new Date(m.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div className="foot" style={{ opacity: 0.7 }}>
                      {new Date(m.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </div>
                  </>
                ) : (
                  <span className="foot" style={{ opacity: 0.5, fontWeight: 700 }}>
                    VS
                  </span>
                )}
              </div>
              <HeroTeam t={m.teams[1]} m={m} align="right" vt="vt-logo-b" />
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
          {ctx && live && hasBalls && legalBalls >= 0 && <LivePanel ctx={ctx} wpNow={wpNow} />}
        </div>
      </motion.div>

      <div className="sticky-tabs">
        <Segmented
          value={tab}
          options={tabs}
          layout="match-tab"
          onChange={(nv) => {
            const n = new URLSearchParams(sp)
            if (nv === 'summary') n.delete('tab')
            else n.set('tab', nv)
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
