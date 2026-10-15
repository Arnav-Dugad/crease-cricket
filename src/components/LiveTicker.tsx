import { useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApi, ymd } from '../lib/api'
import { setLiveBadge } from '../lib/live'
import { groupsFromScorepanel, matchPriority, oversStr } from '../lib/normalize'
import type { MatchLite } from '../lib/types'
import { TeamLogo } from './Media'

function TickerItem({ m }: { m: MatchLite }) {
  const sc = (i: number) => {
    const t = m.teams[i]
    const last = t.innings[t.innings.length - 1]
    return last ? `${last.runs}${last.wkts < 10 ? '/' + last.wkts : ''}${m.format !== 'Test' ? ` (${oversStr(last.overs)})` : ''}` : ''
  }
  return (
    <Link to={`/match/${m.leagueId}/${m.id}`} className="ticker-item" viewTransition>
      <span className="live-dot" />
      <TeamLogo src={m.teams[0].logo} name={m.teams[0].name} color={m.teams[0].color} size={18} flat />
      <b>{m.teams[0].abbr}</b>
      <span className="tnum">{sc(0)}</span>
      <span className="faint">v</span>
      <TeamLogo src={m.teams[1].logo} name={m.teams[1].name} color={m.teams[1].color} size={18} flat />
      <b>{m.teams[1].abbr}</b>
      <span className="tnum">{sc(1)}</span>
    </Link>
  )
}

/**
 * Scrolling strip of every live match, shown under the navigation on all pages
 * (hidden on the match page itself and when nothing is live). Pauses on hover.
 */
export function LiveTicker() {
  const { pathname } = useLocation()
  const day = useApi<unknown[]>(`/api/day/${ymd(new Date())}`, { poll: 30_000 })
  const live = useMemo(
    () =>
      groupsFromScorepanel((day.data ?? []) as never[])
        .flatMap((g) => g.matches.filter((m) => m.state === 'in').map((m) => ({ m, p: matchPriority(m, g.tier) })))
        .sort((a, b) => b.p - a.p)
        .map((x) => x.m),
    [day.data],
  )
  useEffect(() => setLiveBadge(live.length), [live.length])
  if (!live.length || pathname.startsWith('/match/')) return null
  const items = live.length < 4 ? [...live, ...live, ...live] : [...live, ...live]
  return (
    <div className="ticker glass" aria-label="Live matches">
      <span className="ticker-label">
        <span className="live-dot" /> LIVE
      </span>
      <div className="ticker-viewport">
        <div className="ticker-track" style={{ animationDuration: `${Math.max(24, live.length * 14)}s` }}>
          {items.map((m, i) => (
            <TickerItem key={`${m.id}-${i}`} m={m} />
          ))}
        </div>
      </div>
    </div>
  )
}
