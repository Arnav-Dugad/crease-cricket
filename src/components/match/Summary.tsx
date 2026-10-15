import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { aggregate, ballKind, ballLabel, winProbSeries, type InningsAgg } from '../../lib/analytics'
import { buildLeaders, buildSquads, noteOf } from '../../lib/scorecard'
import type { Ball, Video, WikiInfo } from '../../lib/types'
import type { MatchCtx } from '../../pages/Match'
import { Legend, WinProbChart } from '../charts/Charts'
import { Icon } from '../Icon'
import { biggestSwings } from '../../lib/impact'
import { Avatar, TeamLogo } from '../Media'
import { HeadToHead, VenueProfile, WeatherCard, WhereToWatch } from './Conditions'
import { KeyMatchups, WhoBowlsNext } from './Matchups'
import { MatchStory } from './Story'
import { Reveal, SectionHead } from '../UI'
import { VideoRail } from '../Video'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Moment {
  ball: Ball
  kind: 'wicket' | 'fifty' | 'hundred' | 'bigover' | 'result'
  title: string
  text: string
}

/** Derive narrative "key moments" from the ball log: wickets, milestones, big overs. */
function keyMoments(innings: InningsAgg[]): Moment[] {
  const out: Moment[] = []
  for (const inn of innings) {
    const milestones = new Map<string, number>()
    for (const b of inn.balls) {
      if (b.w) out.push({ ball: b, kind: 'wicket', title: `Wicket · ${inn.team} ${b.runs}/${b.wkts}`, text: b.wtext || b.short })
      if (b.bat) {
        const prev = milestones.get(b.bat.id) ?? 0
        const mark = b.bat.r >= 100 ? 100 : b.bat.r >= 50 ? 50 : 0
        if (mark > prev) {
          milestones.set(b.bat.id, mark)
          out.push({ ball: b, kind: mark === 100 ? 'hundred' : 'fifty', title: `${b.bat.n} ${mark === 100 ? 'hundred' : 'fifty'}`, text: `${b.bat.r} off ${b.bat.b} balls (${b.bat['4'] ?? 0}×4, ${b.bat['6'] ?? 0}×6)` })
        }
      }
    }
    for (const o of inn.overs) {
      if (o.runs >= (inn.limit && inn.limit <= 120 ? 18 : 15)) {
        const last = o.balls[o.balls.length - 1]
        out.push({ ball: last, kind: 'bigover', title: `${o.runs}-run over`, text: `${inn.team} took ${o.runs} off ${o.bowler ?? 'the over'} in over ${o.over}` })
      }
    }
  }
  return out.sort((a, b) => a.ball.inn - b.ball.inn || a.ball.seq - b.ball.seq)
}

const MOMENT_STYLE: Record<Moment['kind'], { color: string; icon: 'ball' | 'star' | 'bolt' | 'trophy' }> = {
  wicket: { color: 'var(--red)', icon: 'ball' },
  fifty: { color: 'var(--accent)', icon: 'star' },
  hundred: { color: 'var(--purple)', icon: 'star' },
  bigover: { color: 'var(--orange)', icon: 'bolt' },
  result: { color: 'var(--green)', icon: 'trophy' },
}

function KeyMoments({ ctx }: { ctx: MatchCtx }) {
  const moments = useMemo(() => keyMoments(ctx.innings), [ctx.innings])
  if (!moments.length) return null
  const list = moments.slice(-14).reverse()
  return (
    <div className="card pad">
      <div className="title3" style={{ marginBottom: 16 }}>
        Key moments
      </div>
      <div className="stack" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 15, top: 8, bottom: 8, width: 2, background: 'var(--fill)', borderRadius: 2 }} />
        {list.map((mo, i) => {
          const st = MOMENT_STYLE[mo.kind]
          return (
            <motion.div key={mo.ball.id + mo.kind} className="row gap-14" style={{ alignItems: 'flex-start', padding: '8px 0', gap: 14 }} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.04 }}>
              <span style={{ width: 32, height: 32, borderRadius: 99, flex: 'none', display: 'grid', placeItems: 'center', background: st.color, color: 'white', boxShadow: '0 0 0 4px var(--bg-2)', zIndex: 1 }}>
                <Icon name={st.icon} size={15} stroke={2.2} />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row gap-8">
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{mo.title}</span>
                  <span className="cap faint tnum">
                    Inn {mo.ball.inn} · {mo.ball.ov}
                  </span>
                </div>
                <div className="foot muted">{mo.text}</div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function Performers({ ctx }: { ctx: MatchCtx }) {
  const leaders = useMemo(() => buildLeaders(ctx.summary), [ctx.summary])
  if (!leaders.length) return null
  return (
    <div className="grid cols-4">
      {leaders.slice(0, 8).map((l, i) => (
        <Reveal key={`${l.id}-${l.stat}-${l.period}`} delay={i * 0.04}>
          <Link to={`/player/${l.id}`} className="card interactive stack gap-12" style={{ padding: 18, alignItems: 'flex-start', height: '100%' }}>
            <div className="row gap-12" style={{ width: '100%' }}>
              <Avatar src={l.headshot} id={l.id} name={l.name} size={48} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ellipsis" style={{ fontWeight: 600, fontSize: 15 }}>
                  {l.name}
                </div>
                <div className="cap faint">
                  {l.team} · Inn {l.period}
                </div>
              </div>
            </div>
            <div className="row gap-8" style={{ alignItems: 'baseline' }}>
              <span className="tnum" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {l.value}
              </span>
              <span className="foot muted">{l.stat.toLowerCase()}</span>
            </div>
            <div style={{ height: 4, width: '100%', borderRadius: 99, background: l.teamColor, opacity: 0.85 }} />
          </Link>
        </Reveal>
      ))}
    </div>
  )
}

export function Summary({ ctx }: { ctx: MatchCtx }) {
  const { summary, m, innings, colorOf } = ctx
  const potm = m.potm
  const article = summary?.article
  const videos: Video[] = summary?.videos ?? []
  const wp = useMemo(() => winProbSeries(innings.length ? innings : aggregate([]), ctx.trained), [innings, ctx.trained])
  const swings = useMemo(() => biggestSwings(innings, wp, 4), [innings, wp])
  const toss = noteOf(summary, 'toss')
  const firstBat = innings[0]?.teamId
  const order = firstBat && firstBat === m.teams[1].id ? [m.teams[1], m.teams[0]] : [m.teams[0], m.teams[1]]
  const lastBalls = ctx.balls.slice(-12)
  return (
    <div className="stack gap-24">
      {m.state === 'pre' && (
        <div className="card pad stack gap-8">
          <div className="title3">Match preview</div>
          <div className="sub muted">
            {m.teams[0].name} take on {m.teams[1].name} {m.venue ? `at ${m.venue}` : ''}. {toss ? `Toss: ${toss}.` : 'The toss is yet to happen.'} Live scores, ball-by-ball commentary and the win predictor will appear here once play begins.
          </div>
        </div>
      )}

      {ctx.live && <WhoBowlsNext ctx={ctx} />}

      {m.state !== 'post' && (
        <div className="grid cols-2" style={{ alignItems: 'start' }}>
          <HeadToHead ctx={ctx} />
          <WeatherCard ctx={ctx} wiki={ctx.wiki} />
        </div>
      )}

      <div className="grid cols-2" style={{ alignItems: 'stretch' }}>
        {potm && (
          <Reveal>
            <Link to={`/player/${potm.id}`} className="card interactive row gap-16" style={{ padding: 20, height: '100%', overflow: 'hidden' }}>
              <Avatar src={potm.headshot} id={potm.id} name={potm.name} size={84} />
              <div className="grow">
                <div className="eyebrow" style={{ color: 'var(--orange)' }}>
                  ★ Player of the match
                </div>
                <div className="title2" style={{ marginTop: 4 }}>
                  {potm.name}
                </div>
              </div>
              <Icon name="chevron" size={18} className="faint" />
            </Link>
          </Reveal>
        )}
        {lastBalls.length > 0 && (
          <Reveal delay={0.05}>
            <div className="card pad stack gap-12" style={{ height: '100%' }}>
              <div className="row between">
                <div className="headline">{ctx.live ? 'Latest deliveries' : 'Final deliveries'}</div>
                <span className="foot faint">{lastBalls[lastBalls.length - 1].team}</span>
              </div>
              <div className="row gap-6 wrap">
                {lastBalls.map((b) => (
                  <span key={b.id} className={`ball ${ballKind(b)}`} title={b.short}>
                    {ballLabel(b)}
                  </span>
                ))}
              </div>
              <div className="foot muted">{lastBalls[lastBalls.length - 1].short}</div>
            </div>
          </Reveal>
        )}
      </div>

      {wp.length > 2 && (
        <Reveal>
          <div className="card pad">
            <div className="row between wrap gap-12" style={{ marginBottom: 14 }}>
              <div>
                <div className="title3">Win probability</div>
                <div className="foot faint">
                  {ctx.trained ? `Trained on Cricsheet ball-by-ball history (${ctx.trained.name})` : 'Resource-based estimate'} · updated every ball · biggest swings marked
                </div>
              </div>
              <Legend items={[{ label: order[0].abbr, color: colorOf(order[0].id) }, { label: order[1].abbr, color: colorOf(order[1].id) }]} />
            </div>
            <WinProbChart points={wp} teams={[order[0].abbr, order[1].abbr]} colors={[colorOf(order[0].id), colorOf(order[1].id)]} swings={swings} />
          </div>
        </Reveal>
      )}

      <Performers ctx={ctx} />

      <MatchStory ctx={ctx} />

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <KeyMatchups ctx={ctx} />
        {m.state === 'post' && <HeadToHead ctx={ctx} />}
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <KeyMoments ctx={ctx} />
        {article?.headline && (
          <Reveal>
            <a href={article.links?.web?.href ?? `https://www.espncricinfo.com`} target="_blank" rel="noreferrer" className="card interactive pad stack gap-10">
              <div className="eyebrow" style={{ color: 'var(--accent)' }}>
                {article.type === 'Recap' ? 'Match report' : 'Story'}
              </div>
              <div className="title2">{article.headline}</div>
              <div className="sub muted">{article.description}</div>
              <span className="link" style={{ marginTop: 6 }}>
                Read full report <Icon name="external" size={13} />
              </span>
            </a>
          </Reveal>
        )}
      </div>

      {videos.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <SectionHead title="Highlights & reaction." />
          <VideoRail videos={videos} />
        </section>
      )}
    </div>
  )
}

export function Squads({ ctx }: { ctx: MatchCtx }) {
  const squads = useMemo(() => buildSquads(ctx.summary), [ctx.summary])
  if (!squads.length) return <div className="card empty">Squads haven’t been announced yet.</div>
  return (
    <div className="grid cols-2" style={{ alignItems: 'start' }}>
      {squads.map((s) => (
        <div key={s.teamId} className="card" style={{ overflow: 'hidden' }}>
          <div className="group-head" style={{ borderBottom: '0.5px solid var(--hair)' }}>
            <TeamLogo src={s.logo} name={s.team} color={ctx.colorOf(s.teamId)} size={36} />
            <div className="title3 grow">{s.team}</div>
            <span className="foot faint">{s.players.length} players</span>
          </div>
          <div className="list">
            {s.players.map((p) => (
              <Link key={p.id} to={`/player/${p.id}`} className="lrow">
                <Avatar src={p.headshot} id={p.id} name={p.name} size={40} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row gap-6">
                    <span className="ellipsis" style={{ fontWeight: 600, fontSize: 15 }}>
                      {p.name}
                    </span>
                    {p.captain && <span className="badge upcoming">C</span>}
                    {p.keeper && <span className="badge">WK</span>}
                    {!p.starter && <span className="badge fmt">Sub</span>}
                  </div>
                  <div className="foot faint ellipsis">{[p.role, ...p.styles].filter(Boolean).join(' · ')}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Info({ ctx, wiki }: { ctx: MatchCtx; wiki?: WikiInfo }) {
  const { summary, m } = ctx
  const gi = summary?.gameInfo ?? {}
  const officials: any[] = gi.officials ?? []
  const notes: any[] = summary?.notes ?? []
  const facts: [string, string | undefined][] = [
    ['Series', m.leagueName],
    ['Match', m.desc.split(',')[0]],
    ['Format', m.format],
    ['Date', new Date(m.date).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })],
    ['Toss', noteOf(summary, 'toss')],
    ['Match days', noteOf(summary, 'matchdays')],
    ['Hours of play', noteOf(summary, 'hoursofplay')],
    ['Season', noteOf(summary, 'season')],
  ]
  const matchNotes = notes.filter((n) => n.type === 'matchnote')
  return (
    <div className="stack gap-24">
      {m.venue && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="grid cols-2" style={{ gap: 0 }}>
            <div style={{ minHeight: 240, background: 'var(--fill-2)', position: 'relative' }}>
              {wiki?.image && <img src={wiki.image} alt={m.venue} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />}
            </div>
            <div className="stack gap-10" style={{ padding: 24 }}>
              <div className="eyebrow">Venue</div>
              <div className="title2">{m.venue}</div>
              {gi.venue?.capacity ? <div className="sub muted">Capacity {Number(gi.venue.capacity).toLocaleString()}</div> : null}
              {wiki?.extract && <div className="foot muted" style={{ lineHeight: 1.55 }}>{wiki.extract}</div>}
              {wiki?.url && (
                <a href={wiki.url} target="_blank" rel="noreferrer" className="link">
                  Wikipedia <Icon name="external" size={13} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <WeatherCard ctx={ctx} wiki={wiki} />
        <VenueProfile ctx={ctx} />
      </div>
      <WhereToWatch ctx={ctx} />
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="group-head">
            <div className="title3">Match details</div>
          </div>
          <div className="list">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="lrow" style={{ alignItems: 'flex-start' }}>
                  <span className="foot faint" style={{ width: 110, flex: 'none', paddingTop: 1 }}>
                    {k}
                  </span>
                  <span className="sub">{v}</span>
                </div>
              ))}
          </div>
        </div>
        {officials.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="group-head">
              <div className="title3">Officials</div>
            </div>
            <div className="list">
              {officials.map((o, i) => (
                <div key={i} className="lrow">
                  <span style={{ position: 'relative', flex: 'none' }}>
                    <Avatar id={String(o.links?.href ?? '').match(/player\/(\d+)/)?.[1] ?? null} src={null} name={o.displayName} size={40} />
                    {o.flag?.href && <img src={o.flag.href} alt={o.flag.alt} width={18} height={18} className="flag-badge" />}
                  </span>
                  <span className="grow stack">
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{o.displayName}</span>
                    <span className="cap faint">{o.flag?.alt}</span>
                  </span>
                  <span className="foot faint" style={{ textTransform: 'capitalize' }}>
                    {o.position?.displayName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {matchNotes.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="group-head">
            <div className="title3">Match notes</div>
          </div>
          <div className="list">
            {matchNotes.map((n, i) => (
              <div key={i} className="lrow foot" style={{ fontWeight: /innings$/.test(n.text) ? 700 : 400, color: /innings$/.test(n.text) ? 'var(--text)' : 'var(--text-2)' }}>
                {n.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
