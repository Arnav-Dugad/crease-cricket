import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FormChart } from '../components/charts/Charts'
import { FollowPlayerButton } from '../components/Follow'
import { Icon } from '../components/Icon'
import { TeamLogo, useWiki } from '../components/Media'
import { CountUp, ErrorState, Reveal, SectionHead, Segmented, Skel, pageMotion } from '../components/UI'
import { VideoRail } from '../components/Video'
import { useApi } from '../lib/api'
import { useHistPlayers, type PlayerFormatKey, type PlayerFormatStats } from '../lib/hist'
import { espnImg, isDefaultHeadshot, teamColor } from '../lib/normalize'
import { usePersonImage } from '../lib/people'
import type { Video } from '../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const FORMAT_LABEL: Record<PlayerFormatKey, string> = {
  Test_intl: 'Tests',
  ODI_intl: 'ODIs',
  T20I: 'T20Is',
  Test: 'First-class',
  ODI: 'List A',
  T20: 'All T20s',
}
const ORDER: PlayerFormatKey[] = ['Test_intl', 'ODI_intl', 'T20I', 'T20', 'ODI', 'Test']
const PHASE: Record<string, string> = { pp: 'Powerplay', mid: 'Middle', death: 'Death' }

function Tile({ label, value, sub, dec = 0 }: { label: string; value: number | null | undefined; sub?: string; dec?: number }) {
  return (
    <div className="card stat-tile">
      <div className="l">{label}</div>
      <div className="v">{value == null || !isFinite(value) ? '–' : <CountUp value={value} decimals={dec} />}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  )
}

function Career({ fs, color }: { fs: PlayerFormatStats; color: string }) {
  const bat = fs.bat
  const bowl = fs.bowl
  const batPhases = Object.entries(bat?.phases ?? {}).filter(([, p]) => p && p.balls > 0)
  const bowlPhases = Object.entries(bowl?.phases ?? {}).filter(([, p]) => p && p.balls > 0)
  const dis = Object.entries(bowl?.dismissals ?? {}).sort((a, b) => b[1] - a[1])
  const disTotal = dis.reduce((s, [, n]) => s + n, 0) || 1
  const showBat = bat && bat.inns > 0
  const showBowl = bowl && (bowl.wkts >= 5 || bowl.balls >= 600)
  return (
    <div className="stack gap-24">
      {showBat && (
        <Reveal>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Batting
          </div>
          <div className="grid cols-4">
            <Tile label="Runs" value={bat.runs} sub={`${bat.inns} innings · ${fs.matches} matches`} />
            <Tile label="Average" value={bat.avg} dec={2} sub={`${bat.notOuts} not outs`} />
            <Tile label="Strike rate" value={bat.sr} dec={1} sub={`${bat.fours} fours · ${bat.sixes} sixes`} />
            <Tile label="Best" value={bat.hs} sub={`${bat.hsNotOut ? 'not out · ' : ''}${bat.hundreds} hundreds · ${bat.fifties} fifties`} />
          </div>
        </Reveal>
      )}
      {showBat && batPhases.length > 0 && (
        <Reveal>
          <div className="card pad">
            <div className="title3" style={{ marginBottom: 4 }}>
              Batting by phase
            </div>
            <div className="foot faint" style={{ marginBottom: 16 }}>
              Strike rate and average in each phase of the innings
            </div>
            <div className="grid cols-3" style={{ gap: 14 }}>
              {batPhases.map(([k, p]) => {
                const sr = (p!.runs / p!.balls) * 100
                return (
                  <div key={k} className="mini-stat stack gap-6">
                    <div className="row between">
                      <span className="headline">{PHASE[k]}</span>
                      <span className="cap faint">{p!.balls} balls</span>
                    </div>
                    <div className="tnum" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>
                      {sr.toFixed(0)} <span className="foot faint">SR</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--fill-2)', overflow: 'hidden' }}>
                      <motion.div style={{ height: '100%', background: color, borderRadius: 99, width: `${Math.min(100, sr / 2)}%`, transformOrigin: 'left center' }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} />
                    </div>
                    <div className="cap faint">
                      {p!.runs} runs · {p!.outs ? `avg ${(p!.runs / p!.outs).toFixed(1)}` : 'not dismissed'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Reveal>
      )}
      {showBowl && (
        <Reveal>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Bowling
          </div>
          <div className="grid cols-4">
            <Tile label="Wickets" value={bowl.wkts} sub={`${bowl.inns} innings`} />
            <Tile label="Economy" value={bowl.econ} dec={2} sub={`${Math.round((bowl.dots / Math.max(1, bowl.balls)) * 100)}% dot balls`} />
            <Tile label="Average" value={bowl.avg} dec={2} sub={bowl.sr ? `strike rate ${bowl.sr.toFixed(1)}` : undefined} />
            <Tile label="Best" value={bowl.best.w} sub={`${bowl.best.w}/${bowl.best.r} · ${bowl.fiveW} five-fors`} />
          </div>
        </Reveal>
      )}
      {showBowl && (bowlPhases.length > 0 || dis.length > 0) && (
        <Reveal>
          <div className="grid cols-2" style={{ alignItems: 'start' }}>
            {bowlPhases.length > 0 && (
              <div className="card pad">
                <div className="title3" style={{ marginBottom: 14 }}>
                  Bowling by phase
                </div>
                <div className="stack gap-14">
                  {bowlPhases.map(([k, p]) => {
                    const econ = (p!.runs / p!.balls) * 6
                    return (
                      <div key={k} className="stack gap-6">
                        <div className="row between foot">
                          <b>{PHASE[k]}</b>
                          <span className="tnum muted">
                            econ {econ.toFixed(2)} · {p!.wkts} wkts · {Math.round(p!.balls / 6)} ov
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 99, background: 'var(--fill-2)', overflow: 'hidden' }}>
                          <motion.div style={{ height: '100%', background: color, borderRadius: 99, width: `${Math.min(100, (econ / 12) * 100)}%`, transformOrigin: 'left center' }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {dis.length > 0 && (
              <div className="card pad">
                <div className="title3" style={{ marginBottom: 14 }}>
                  How the wickets came
                </div>
                <div className="stack gap-10">
                  {dis.map(([k, n], i) => (
                    <div key={k} className="row gap-10 foot">
                      <span className="grow" style={{ textTransform: 'capitalize' }}>
                        {k}
                      </span>
                      <div style={{ width: '45%', height: 8, borderRadius: 99, background: 'var(--fill-2)', overflow: 'hidden' }}>
                        <motion.div style={{ height: '100%', borderRadius: 99, background: ['var(--blue)', 'var(--purple)', 'var(--orange)', 'var(--teal)', 'var(--green)', 'var(--text-3)'][i % 6], width: `${(n / disTotal) * 100}%`, transformOrigin: 'left center' }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.05 }} />
                      </div>
                      <span className="tnum" style={{ width: 70, textAlign: 'right', fontWeight: 600 }}>
                        {n} <span className="faint">({Math.round((n / disTotal) * 100)}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Reveal>
      )}
      {fs.field && (fs.field.catches || fs.field.stumpings) ? (
        <div className="foot muted">
          Fielding: {fs.field.catches} catches{fs.field.stumpings ? ` · ${fs.field.stumpings} stumpings` : ''}
          {fs.field.runOuts ? ` · ${fs.field.runOuts} run-outs` : ''}
        </div>
      ) : null}
    </div>
  )
}

export default function Player() {
  const { id = '' } = useParams()
  const p = useApi<any>(`/api/player/${id}`)
  const a = p.data
  const hist = useHistPlayers([id])
  const h = hist.data?.[id]
  const wd = usePersonImage(id)
  const tsdb = useApi<{ cutout: string | null; render: string | null; thumb: string | null } | null>(a?.displayName ? `/api/tsdb/player?name=${encodeURIComponent(a.displayName)}` : null, { staleMs: 86400_000 })
  const wiki = useWiki(a?.displayName ? `${a.fullName ?? a.displayName} cricketer` : null)
  const w = wiki.data && /cricket/i.test(wiki.data.extract ?? '') ? wiki.data : null
  const formats = ORDER.filter((k) => h?.formats[k] && (h.formats[k]!.bat?.inns || h.formats[k]!.bowl?.balls))
  const [fmt, setFmt] = useState<PlayerFormatKey | null>(null)
  const active = fmt && formats.includes(fmt) ? fmt : formats[0]

  // Portrait priority: transparent cutout (TheSportsDB) → ESPN headshot → Wikidata photo
  const cutout = tsdb.data?.cutout ?? tsdb.data?.render ?? null
  const headshot = !isDefaultHeadshot(a?.headshot?.href) ? espnImg(a?.headshot?.href, 600) : null
  const photo = wd?.img2x ?? w?.image ?? null
  const portrait = cutout ?? headshot ?? photo
  const isCutout = !!(cutout || headshot) && portrait !== photo
  const team = a?.team
  const color = teamColor(team?.color, team?.displayName ?? 'x')

  const form = useMemo(
    () =>
      (h?.recent ?? [])
        .filter((r) => r.r != null || r.w != null)
        .slice(0, 12)
        .reverse()
        .map((r) => {
          const batFirst = (h?.formats.T20?.bat?.runs ?? 0) + (h?.formats.ODI?.bat?.runs ?? 0) >= ((h?.formats.T20?.bowl?.wkts ?? 0) + (h?.formats.ODI?.bowl?.wkts ?? 0)) * 20
          const useBat = r.r != null && (batFirst || r.w == null)
          return {
            label: (r.opp ?? '').replace(/ Women$/, '').split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase(),
            value: useBat ? r.r! : r.w!,
            out: useBat ? r.out : undefined,
            good: useBat ? (r.r ?? 0) >= (r.f === 'T20' ? 30 : 50) : (r.w ?? 0) >= 3,
            sub: `${new Date(r.d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${r.f} vs ${r.opp} · ${r.r != null ? `${r.r}${r.out === false ? '*' : ''} (${r.b})` : ''}${r.w != null ? ` ${r.w}/${r.rc}` : ''}`,
            bat: useBat,
          }
        }),
    [h],
  )
  const formIsBat = form.length ? form.filter((f) => f.bat).length >= form.length / 2 : true

  const facts: [string, string | undefined][] = [
    ['Role', a?.position?.name],
    ['Batting', a?.batStyle?.[0]?.description ?? a?.batStyle?.description],
    ['Bowling', a?.bowlStyle?.[0]?.description ?? a?.bowlStyle?.description],
    ['Born', a?.displayDOB ? new Date(a.displayDOB.split('/').reverse().join('-')).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : undefined],
    ['Age', a?.age ? String(a.age) : undefined],
    ['Team', team?.displayName],
  ]
  if (p.error && !a)
    return (
      <div className="page">
        <ErrorState onRetry={p.refresh} text="This player profile couldn’t be loaded." />
      </div>
    )
  return (
    <motion.div className="page" style={{ '--team-a': color } as React.CSSProperties} {...pageMotion}>
      <div className="card player-hero" style={{ overflow: 'hidden', padding: 0 }}>
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
                  {wd?.desc && <span className="badge fmt">{wd.desc}</span>}
                  <FollowPlayerButton id={id} name={a.displayName} />
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
          <div style={{ flex: '1 1 300px', minHeight: 360, position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            {portrait ? (
              <motion.img
                key={portrait}
                src={portrait}
                alt={a?.displayName}
                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
                style={
                  isCutout
                    ? { width: 'min(440px, 92%)', maxHeight: 460, height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 30px 40px rgba(0,0,0,.28))' }
                    : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', maskImage: 'linear-gradient(90deg, transparent, #000 30%)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 30%)' }
                }
              />
            ) : (
              !p.loading && <Icon name="users" size={120} stroke={0.8} style={{ color: 'var(--text-3)', alignSelf: 'center' }} />
            )}
          </div>
        </div>
      </div>

      {formats.length > 0 && h && (
        <section className="section" style={{ marginTop: 32 }}>
          <div className="row between wrap gap-12" style={{ marginBottom: 18 }}>
            <h2 className="title1">Career</h2>
            <Segmented value={active!} onChange={setFmt} layout="career-fmt" options={formats.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))} />
          </div>
          <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Career fs={h.formats[active!]!} color={color} />
          </motion.div>
          <div className="cap faint" style={{ marginTop: 10 }}>
            From Cricsheet ball-by-ball records (coverage may be incomplete for older or lower-profile matches).
          </div>
        </section>
      )}

      {form.length > 2 && (
        <section className="section">
          <SectionHead title="Form." sub={`Last ${form.length} matches · ${formIsBat ? 'runs' : 'wickets'}`} />
          <div className="card pad">
            <FormChart items={form} color={color} />
          </div>
        </section>
      )}

      <div className="grid cols-2 section" style={{ alignItems: 'start' }}>
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
