import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { distinctPair, MiniWorm } from '../components/charts/Charts'
import { Icon } from '../components/Icon'
import { TeamLogo } from '../components/Media'
import { Odometer } from '../components/Odometer'
import { Empty, Skel, StateBadge, pageMotion } from '../components/UI'
import { useApi, ymd } from '../lib/api'
import { aggregate, ballKind, ballLabel, winProbSeries } from '../lib/analytics'
import { modelFor, trainedWinModel, useModel } from '../lib/hist'
import { groupsFromScorepanel, matchPriority, shortLeague, toMatch } from '../lib/normalize'
import type { BallsResponse, MatchLite } from '../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

function MultiCard({ league, event, onRemove }: { league: string; event: string; onRemove: () => void }) {
  const s = useApi<any>(`/api/match/${league}/${event}`, { poll: 20_000 })
  const m = useMemo(() => (s.data?.header ? toMatch(s.data.header, { id: league, name: s.data.header?.league?.name ?? '' }) : null), [s.data, league])
  const live = m?.state === 'in'
  const b = useApi<BallsResponse>(m && m.state !== 'pre' ? `/api/balls/${league}/${event}${live ? '?live=1' : ''}` : null, { poll: live ? 20_000 : undefined })
  const innings = useMemo(() => aggregate(b.data?.balls ?? []), [b.data])
  const model = useModel()
  const trained = useMemo(() => (m ? trainedWinModel(modelFor(model.data, innings[0]?.limit ?? 0, m.women)) : null), [model.data, innings, m])
  const wp = useMemo(() => winProbSeries(innings, trained), [innings, trained])
  if (!m)
    return (
      <div className="card pad">
        <Skel h={220} />
      </div>
    )
  const [c1, c2] = distinctPair(m.teams[0].color, m.teams[1].color)
  const colorOf = (id: string) => (id === m.teams[0].id ? c1 : c2)
  const last6 = (b.data?.balls ?? []).slice(-6)
  const p = wp.length > 1 ? wp[wp.length - 1].p : null
  const firstBat = innings[0]?.teamId
  const pA = p == null ? null : firstBat === m.teams[0].id ? p : 1 - p
  return (
    <motion.div layout className="card multi-card" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="row gap-8" style={{ marginBottom: 12 }}>
        <StateBadge m={m} />
        <span className="foot faint ellipsis grow">{shortLeague(m.leagueName || m.desc)}</span>
        <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={onRemove} aria-label="Remove from view">
          <Icon name="x" size={15} />
        </button>
      </div>
      {m.teams.map((t) => {
        const last = t.innings[t.innings.length - 1]
        return (
          <div key={t.id} className="row gap-10" style={{ marginBottom: 8 }}>
            <TeamLogo src={t.logo} name={t.name} color={t.color} size={30} />
            <span className="grow ellipsis" style={{ fontWeight: 600 }}>
              {t.name}
            </span>
            {last && (
              <span className="tnum" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>
                <Odometer value={`${last.runs}${last.wkts < 10 ? '/' + last.wkts : ''}`} />
                <span className="foot faint" style={{ fontWeight: 500 }}>
                  {' '}
                  ({last.overs})
                </span>
              </span>
            )}
          </div>
        )
      })}
      {innings.length > 0 && (
        <div style={{ margin: '6px 0 10px' }}>
          <MiniWorm innings={innings} colors={innings.map((i) => colorOf(i.teamId))} />
        </div>
      )}
      {pA != null && (
        <div style={{ marginBottom: 10 }}>
          <div className="row between cap faint" style={{ marginBottom: 4 }}>
            <span>
              {m.teams[0].abbr} {Math.round(pA * 100)}%
            </span>
            <span>
              {Math.round((1 - pA) * 100)}% {m.teams[1].abbr}
            </span>
          </div>
          <div className="prob" style={{ height: 6 }}>
            <div style={{ flexGrow: pA, background: c1, borderRadius: 99 }} />
            <div style={{ flexGrow: 1 - pA, background: c2, borderRadius: 99 }} />
          </div>
        </div>
      )}
      <div className="row gap-6 wrap" style={{ marginBottom: 10 }}>
        {last6.map((x) => (
          <span key={x.id} className={`ball sm ${ballKind(x)}`}>
            {ballLabel(x)}
          </span>
        ))}
      </div>
      <div className="row between gap-8">
        <span className="foot ellipsis" style={{ color: live ? 'var(--live)' : 'var(--text-2)' }}>
          {m.status || m.detail}
        </span>
        <Link to={`/match/${league}/${event}`} className="link" viewTransition>
          Open <Icon name="chevron" size={13} />
        </Link>
      </div>
    </motion.div>
  )
}

export default function Multi() {
  const [sp, setSp] = useSearchParams()
  const day = useApi<unknown[]>(`/api/day/${ymd(new Date())}`, { poll: 30_000 })
  const candidates: MatchLite[] = useMemo(
    () =>
      groupsFromScorepanel((day.data ?? []) as never[])
        .flatMap((g) => g.matches.map((m) => ({ m, p: matchPriority(m, g.tier) })))
        .sort((a, b) => b.p - a.p)
        .map((x) => x.m),
    [day.data],
  )
  const chosen = (sp.get('ids')?.split(',').filter(Boolean) ?? candidates.filter((m) => m.state === 'in').slice(0, 4).map((m) => `${m.leagueId}:${m.id}`)).slice(0, 4)
  const set = (ids: string[]) => setSp(ids.length ? { ids: ids.join(',') } : {}, { replace: true })
  const toggle = (key: string) => set(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key].slice(-4))
  return (
    <motion.div className="page" {...pageMotion}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Up to four at once
      </div>
      <h1 className="large-title" style={{ marginBottom: 18 }}>
        Multi-match view
      </h1>
      <div className="scroll-x" style={{ marginBottom: 24 }}>
        {candidates.slice(0, 30).map((m) => {
          const key = `${m.leagueId}:${m.id}`
          const on = chosen.includes(key)
          return (
            <button key={key} className={`chip ${on ? 'on' : ''}`} onClick={() => toggle(key)}>
              {m.state === 'in' && <span className="live-dot" />}
              {m.teams[0].abbr} v {m.teams[1].abbr}
            </button>
          )
        })}
      </div>
      {day.loading && !chosen.length ? (
        <Skel h={300} r={24} />
      ) : chosen.length === 0 ? (
        <Empty title="Pick matches to follow" text="Choose up to four matches above — live games are selected automatically when available." />
      ) : (
        <div className={`multi-grid n${chosen.length}`}>
          {chosen.map((k) => {
            const [league, event] = k.split(':')
            return <MultiCard key={k} league={league} event={event} onRemove={() => toggle(k)} />
          })}
        </div>
      )}
    </motion.div>
  )
}
