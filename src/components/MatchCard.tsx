import { Link } from 'react-router-dom'
import { prefetch } from '../lib/api'
import { oversStr, shortLeague, startLabel } from '../lib/normalize'
import type { MatchLite, TeamLite } from '../lib/types'
import { TeamLogo } from './Media'
import { StateBadge } from './UI'

export function matchHref(m: MatchLite) {
  return `/match/${m.leagueId}/${m.id}`
}

function TeamScore({ t, m, size = 30 }: { t: TeamLite; m: MatchLite; size?: number }) {
  const inns = t.innings
  const lost = m.state === 'post' && !t.winner && m.teams.some((x) => x.winner)
  const batting = m.state === 'in' && inns.some((i) => i.isCurrent && i.desc !== 'complete')
  const last = inns[inns.length - 1]
  const showOvers = last && m.format !== 'Test' && m.format !== 'First-class'
  return (
    <div className={`trow ${lost ? 'lost' : ''} ${batting ? 'batting' : ''}`}>
      <TeamLogo src={t.logo} name={t.name} color={t.color} size={size} />
      <div className="tname">{t.name}</div>
      <div className="tscore">
        {inns.length > 1 && m.format !== 'T20' && m.format !== 'ODI' && (
          <span style={{ fontWeight: 500, color: 'var(--text-3)', fontSize: 14, marginRight: 6 }}>
            {inns.slice(0, -1).map((i) => `${i.runs}${i.wkts < 10 ? '/' + i.wkts : ''}`).join(' & ')} &amp;
          </span>
        )}
        {last ? `${last.runs}${last.wkts < 10 ? '/' + last.wkts : ''}` : ''}
        {showOvers && <small>({oversStr(last.overs)})</small>}
      </div>
    </div>
  )
}

export function MatchCard({ m, showLeague = true }: { m: MatchLite; showLeague?: boolean }) {
  const winning = m.state === 'post' && m.teams.some((t) => t.winner)
  return (
    <Link to={matchHref(m)} className="card interactive mcard" onMouseEnter={() => prefetch(`/api/match/${m.leagueId}/${m.id}`)}>
      <div className="top">
        <StateBadge m={m} />
        {m.format && <span className="badge fmt">{m.format}</span>}
        <span className="ellipsis grow" style={{ textAlign: 'right' }}>
          {showLeague ? shortLeague(m.leagueName) : m.desc.split(',')[0]}
        </span>
      </div>
      <div className="stack gap-6">
        <TeamScore t={m.teams[0]} m={m} />
        <TeamScore t={m.teams[1]} m={m} />
      </div>
      <div className={`status ${m.state === 'in' ? 'live' : winning ? 'win' : ''}`}>
        {m.state === 'pre' ? (
          <span>
            {startLabel(m.date)}
            {m.city && <span className="dot-sep faint">{m.city}</span>}
          </span>
        ) : (
          m.status || m.detail
        )}
      </div>
    </Link>
  )
}

/** Compact row for dense lists (schedule, series fixtures). */
export function MatchRow({ m }: { m: MatchLite }) {
  const [a, b] = m.teams
  const sc = (t: TeamLite) => t.innings.map((i) => `${i.runs}${i.wkts < 10 ? '/' + i.wkts : ''}`).join(' & ')
  return (
    <Link to={matchHref(m)} className="lrow" onMouseEnter={() => prefetch(`/api/match/${m.leagueId}/${m.id}`)}>
      <div className="stack gap-8 grow">
        <div className="row gap-10">
          <TeamLogo src={a.logo} name={a.name} color={a.color} size={24} />
          <span className={`grow ellipsis ${m.state === 'post' && !a.winner && b.winner ? 'faint' : ''}`} style={{ fontWeight: 600, fontSize: 15 }}>
            {a.name}
          </span>
          <span className="tnum" style={{ fontWeight: 700, fontSize: 15 }}>
            {sc(a)}
          </span>
        </div>
        <div className="row gap-10">
          <TeamLogo src={b.logo} name={b.name} color={b.color} size={24} />
          <span className={`grow ellipsis ${m.state === 'post' && !b.winner && a.winner ? 'faint' : ''}`} style={{ fontWeight: 600, fontSize: 15 }}>
            {b.name}
          </span>
          <span className="tnum" style={{ fontWeight: 700, fontSize: 15 }}>
            {sc(b)}
          </span>
        </div>
        <div className="foot muted row gap-8" style={{ color: m.state === 'in' ? 'var(--live)' : undefined }}>
          {m.state === 'in' && <span className="live-dot" />}
          <span className="ellipsis">{m.state === 'pre' ? `${startLabel(m.date)} · ${m.desc.split(',')[0]}` : m.status || m.detail}</span>
        </div>
      </div>
    </Link>
  )
}
