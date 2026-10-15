import { motion } from 'motion/react'
import { useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { TeamLogo, useWiki } from '../components/Media'
import { Reveal, SectionHead, Skel, ErrorState, pageMotion } from '../components/UI'
import { VideoRail } from '../components/Video'
import { useApi } from '../lib/api'
import { espnImg, isDefaultHeadshot, teamColor } from '../lib/normalize'
import type { Video } from '../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function Player() {
  const { id = '' } = useParams()
  const p = useApi<any>(`/api/player/${id}`)
  const a = p.data
  const wiki = useWiki(a?.displayName ? `${a.fullName ?? a.displayName} cricketer` : null)
  const w = wiki.data && /cricket/i.test(wiki.data.extract ?? '') ? wiki.data : null
  const headshot = !isDefaultHeadshot(a?.headshot?.href) ? espnImg(a?.headshot?.href, 600) : null
  const portrait = headshot ?? w?.image ?? null
  const team = a?.team
  const color = teamColor(team?.color, team?.displayName ?? 'x')
  const facts: [string, string | undefined][] = [
    ['Role', a?.position?.name],
    ['Batting', a?.batStyle?.[0]?.description ?? a?.batStyle?.description],
    ['Bowling', a?.bowlStyle?.[0]?.description ?? a?.bowlStyle?.description],
    ['Born', a?.displayDOB ? new Date(a.displayDOB.split('/').reverse().join('-')).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : undefined],
    ['Age', a?.age ? String(a.age) : undefined],
    ['Team', team?.displayName],
  ]
  if (p.error && !a) return <div className="page"><ErrorState onRetry={p.refresh} text="This player profile couldn’t be loaded." /></div>
  return (
    <motion.div className="page" {...pageMotion}>
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: -1, background: `radial-gradient(90% 120% at 85% 10%, color-mix(in srgb, ${color} 45%, transparent), transparent 60%), radial-gradient(60% 80% at 0% 100%, color-mix(in srgb, ${color} 18%, transparent), transparent 70%)` }} />
        <div className="row wrap" style={{ alignItems: 'stretch' }}>
          <div className="stack gap-16" style={{ flex: '1 1 380px', padding: 'clamp(24px, 4vw, 48px)', justifyContent: 'center' }}>
            {a ? (
              <>
                <div className="row gap-10">
                  {team && <TeamLogo src={team.logos?.[0]?.href} name={team.displayName} color={color} size={30} />}
                  <span className="eyebrow">{team?.displayName ?? 'Cricketer'}</span>
                </div>
                <h1 className="hero-title" style={{ fontSize: 'clamp(40px, 6.5vw, 72px)' }}>
                  {a.firstName && a.lastName ? (
                    <>
                      <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>{a.firstName}</span>
                      <br />
                      {a.lastName}
                    </>
                  ) : (
                    a.displayName
                  )}
                </h1>
                <div className="row gap-8 wrap">
                  {a.position?.name && <span className="badge upcoming">{a.position.name}</span>}
                  {a.age && <span className="badge">{a.age} years</span>}
                  {a.active === false && <span className="badge">Retired</span>}
                </div>
              </>
            ) : (
              <>
                <Skel w={160} h={14} />
                <Skel w="80%" h={64} />
                <Skel w={200} h={22} />
              </>
            )}
          </div>
          <div style={{ flex: '1 1 300px', minHeight: 340, position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            {portrait ? (
              <motion.img
                src={portrait}
                alt={a?.displayName}
                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
                style={
                  headshot
                    ? { width: 'min(420px, 90%)', height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 30px 40px rgba(0,0,0,.25))' }
                    : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', maskImage: 'linear-gradient(90deg, transparent, #000 30%)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 30%)' }
                }
              />
            ) : (
              !p.loading && <Icon name="users" size={120} stroke={0.8} style={{ color: 'var(--text-3)', alignSelf: 'center' }} />
            )}
          </div>
        </div>
      </div>

      <div className="grid cols-2 section" style={{ alignItems: 'start', marginTop: 24 }}>
        <Reveal>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="group-head">
              <div className="title3">Profile</div>
            </div>
            <div className="list">
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="lrow">
                    <span className="foot faint" style={{ width: 90 }}>
                      {k}
                    </span>
                    <span className="sub" style={{ fontWeight: 500 }}>
                      {v}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </Reveal>
        {w?.extract && (
          <Reveal delay={0.05}>
            <div className="card pad stack gap-12">
              <div className="title3">Biography</div>
              <div className="prose" style={{ fontSize: 16 }}>
                {w.extract}
              </div>
              {w.url && (
                <a href={w.url} target="_blank" rel="noreferrer" className="link">
                  Continue on Wikipedia <Icon name="external" size={13} />
                </a>
              )}
            </div>
          </Reveal>
        )}
      </div>

      {a?.videos?.length > 0 && (
        <section className="section">
          <SectionHead title="Watch." sub="Recent clips." />
          <VideoRail videos={a.videos as Video[]} />
        </section>
      )}
    </motion.div>
  )
}
