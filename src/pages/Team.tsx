import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FollowTeamButton } from '../components/Follow'
import { MatchCard } from '../components/MatchCard'
import { Avatar, Img, TeamLogo, useTsdbTeam, useWiki } from '../components/Media'
import { Rail } from '../components/Rail'
import { Empty, Reveal, SectionHead, Skel, pageMotion } from '../components/UI'
import { addDays, useApi, ymd } from '../lib/api'
import { nationOf } from '../lib/flags'
import { useHistTeam } from '../lib/hist'
import { byStateThenDate, groupsFromScorepanel, hashColor } from '../lib/normalize'
import { buildSquads } from '../lib/scorecard'
import type { MatchLite } from '../lib/types'

const OFFSETS = Array.from({ length: 15 }, (_, i) => i - 7)

export default function Team() {
  const { id = '', name: rawName = '' } = useParams()
  const today = new Date()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const days = OFFSETS.map((o) => useApi<unknown[]>(`/api/day/${ymd(addDays(today, o))}`))
  const matches: MatchLite[] = useMemo(() => {
    const all = groupsFromScorepanel(days.flatMap((d) => (d.data ?? []) as never[])).flatMap((g) => g.matches)
    const seen = new Set<string>()
    return all.filter((m) => m.teams.some((t) => t.id === id) && !seen.has(m.id) && seen.add(m.id)).sort(byStateThenDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, days.map((d) => d.data))
  const self = matches.flatMap((m) => m.teams).find((t) => t.id === id)
  const name = self?.name ?? decodeURIComponent(rawName)
  const color = self?.color ?? hashColor(name)
  const tsdb = useTsdbTeam(nationOf(name) ? null : name)
  const wiki = useWiki(name ? `${name} cricket team` : null)
  const hist = useHistTeam(name)

  // Squad from the most recent match that has rosters
  const recent = [...matches].filter((m) => m.state !== 'pre').sort((a, b) => +new Date(b.date) - +new Date(a.date))[0] ?? matches[0]
  const sum = useApi<unknown>(recent ? `/api/match/${recent.leagueId}/${recent.id}` : null)
  const squad = useMemo(() => buildSquads(sum.data).find((s) => s.teamId === id), [sum.data, id])

  const hero = tsdb.data?.fanart?.[0] ?? (wiki.data?.image && /cricket/i.test(wiki.data.extract ?? '') ? wiki.data.image : null)
  const about = tsdb.data?.description ?? (/cricket/i.test(wiki.data?.extract ?? '') ? wiki.data?.extract : null)
  const loadingDays = days.every((d) => d.loading)
  const fmts = Object.entries(hist.data?.formats ?? {})

  return (
    <motion.div className="page" {...pageMotion}>
      <div className="hero-card" style={{ minHeight: 0 }}>
        <div className="bg-img">
          {hero ? (
            <Img srcs={[hero]} alt={name} priority imgStyle={{ width: '100%', height: '100%', objectFit: 'cover' }} style={{ position: 'absolute', inset: 0 }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: `radial-gradient(120% 120% at 10% 0%, ${color}, transparent 60%), #0b0b0f` }} />
          )}
        </div>
        <div className="bg-shade" />
        <div className="row gap-20 wrap" style={{ padding: 'clamp(22px, 4vw, 40px)', paddingTop: 'clamp(90px, 14vw, 160px)', alignItems: 'flex-end' }}>
          <span style={{ viewTransitionName: 'vt-logo-a', borderRadius: '50%', display: 'inline-flex' } as React.CSSProperties}>
            <TeamLogo src={self?.logo} name={name} color={color} size={104} />
          </span>
          <div className="grow" style={{ minWidth: 220 }}>
            <div className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}>
              {nationOf(name) ? 'National team' : tsdb.data?.founded ? `Founded ${tsdb.data.founded}` : 'Team'}
            </div>
            <h1 className="hero-title" style={{ fontSize: 'clamp(34px, 6vw, 64px)', color: 'white' }}>
              {name}
            </h1>
            {tsdb.data?.stadium && <div className="sub" style={{ opacity: 0.8 }}>Home: {tsdb.data.stadium}</div>}
          </div>
          <FollowTeamButton team={{ id, name, logo: self?.logo, color }} onDark />
        </div>
      </div>

      {fmts.length > 0 && (
        <Reveal>
          <div className="grid cols-3 section" style={{ marginTop: 24 }}>
            {fmts.map(([f, r]) => {
              const pct = r.played ? Math.round((r.won / Math.max(1, r.played - (r.noResult ?? 0))) * 100) : 0
              return (
                <div key={f} className="card stat-tile">
                  <div className="l">{f} since {hist.data?.formsSince?.slice(0, 4)}</div>
                  <div className="v">{pct}%</div>
                  <div className="s">
                    {r.won} won · {r.lost} lost{r.drawn ? ` · ${r.drawn} drawn` : ''} · {r.played} played
                  </div>
                </div>
              )
            })}
          </div>
        </Reveal>
      )}

      <section className="section">
        <SectionHead title="This fortnight." sub="Live, recent and upcoming." />
        {loadingDays ? (
          <Skel h={170} r={24} />
        ) : matches.length ? (
          <Rail>
            {matches.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </Rail>
        ) : (
          <Empty title="No matches in the last or next seven days" />
        )}
      </section>

      {hist.data?.recent?.length ? (
        <section className="section">
          <SectionHead title="Form." sub="Last ten results · Cricsheet." />
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="row gap-8 wrap" style={{ padding: '18px 20px' }}>
              {hist.data.recent.map((r, i) => (
                <span key={i} className={`form-chip ${r.result}`} title={`${r.result} vs ${r.opp}, ${r.d}`}>
                  {r.result}
                </span>
              ))}
            </div>
            <div className="list">
              {hist.data.recent.slice(0, 6).map((r, i) => (
                <div key={i} className="lrow foot">
                  <span className={`form-chip sm ${r.result}`}>{r.result}</span>
                  <span className="grow ellipsis">
                    vs <b>{r.opp}</b> {r.margin ? `· ${r.margin}` : ''}
                  </span>
                  <span className="faint hide-sm ellipsis" style={{ maxWidth: 220 }}>
                    {r.ev}
                  </span>
                  <span className="faint tnum" style={{ width: 86, textAlign: 'right' }}>
                    {new Date(r.d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {squad && (
        <section className="section">
          <SectionHead title="Squad." sub={recent ? `From ${recent.desc.split(',')[0]}` : undefined} />
          <div className="grid auto">
            {squad.players.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 10) * 0.02}>
                <Link to={`/player/${p.id}`} className="card interactive row gap-14" style={{ padding: 14, gap: 14 }} viewTransition>
                  <Avatar src={p.headshot} id={p.id} name={p.name} size={52} ring={color} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row gap-6">
                      <span className="headline ellipsis" style={{ fontSize: 15 }}>
                        {p.name}
                      </span>
                      {p.captain && <span className="badge upcoming">C</span>}
                      {p.keeper && <span className="badge">WK</span>}
                    </div>
                    <div className="cap faint ellipsis">{[p.role, ...p.styles].filter(Boolean).join(' · ')}</div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {about && (
        <section className="section">
          <SectionHead title="About." />
          <div className="card pad prose" style={{ fontSize: 16 }}>
            {about}
          </div>
        </section>
      )}
    </motion.div>
  )
}
