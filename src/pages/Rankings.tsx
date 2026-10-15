import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../components/Media'
import { ErrorState, Reveal, SectionHead, Segmented, Skel, pageMotion } from '../components/UI'
import { useApi } from '../lib/api'
import { NATIONS, nationLogo } from '../lib/flags'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RankTable {
  title: string
  asOf: string | null
  gender: string
  format: 'Test' | 'ODI' | 'T20I'
  rows: { code: string; matches: number; points: number; rating: number }[]
}

function nameOf(code: string, women: boolean) {
  const n = NATIONS[code]?.name ?? code
  return women ? `${n} Women` : n
}

function Podium({ rows, women }: { rows: RankTable['rows']; women: boolean }) {
  const order = [rows[1], rows[0], rows[2]].filter(Boolean)
  const h = [150, 190, 130]
  return (
    <div className="podium">
      {order.map((r, k) => {
        const place = r === rows[0] ? 1 : r === rows[1] ? 2 : 3
        const n = NATIONS[r.code]
        return (
          <motion.div key={r.code} className="podium-step" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 18, delay: 0.1 + k * 0.08 }}>
            <TeamLogo src={n ? nationLogo(n, 320) : null} name={nameOf(r.code, women)} size={place === 1 ? 84 : 66} />
            <div className="headline" style={{ marginTop: 10, textAlign: 'center' }}>
              {nameOf(r.code, women)}
            </div>
            <div className="tnum" style={{ fontSize: place === 1 ? 34 : 28, fontWeight: 700, letterSpacing: '-0.04em' }}>
              {r.rating}
            </div>
            <motion.div className={`podium-block p${place}`} initial={{ height: 0 }} animate={{ height: h[k] }} transition={{ type: 'spring', stiffness: 90, damping: 16, delay: 0.2 + k * 0.1 }}>
              <span>{place}</span>
            </motion.div>
          </motion.div>
        )
      })}
    </div>
  )
}

function RankingTable({ t }: { t: RankTable }) {
  const women = t.gender.startsWith('Women')
  const max = Math.max(...t.rows.map((r) => r.rating), 1)
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Team</th>
              <th className="hide-sm">Matches</th>
              <th className="hide-sm">Points</th>
              <th style={{ minWidth: 150 }}>Rating</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => {
              const n = NATIONS[r.code]
              return (
                <tr key={r.code}>
                  <td className="l">
                    <div className="row gap-12">
                      <span className="tnum faint" style={{ width: 22, fontWeight: 600 }}>
                        {i + 1}
                      </span>
                      <TeamLogo src={n ? nationLogo(n) : null} name={nameOf(r.code, women)} size={28} />
                      <span style={{ fontWeight: 600 }}>{nameOf(r.code, women)}</span>
                    </div>
                  </td>
                  <td className="hide-sm muted">{r.matches}</td>
                  <td className="hide-sm muted">{r.points.toLocaleString()}</td>
                  <td>
                    <div className="row gap-10" style={{ justifyContent: 'flex-end' }}>
                      <div style={{ width: 90, height: 6, borderRadius: 99, background: 'var(--fill-2)', overflow: 'hidden' }}>
                        <motion.div style={{ height: '100%', borderRadius: 99, background: i < 3 ? 'var(--accent)' : 'var(--text-3)', width: `${(r.rating / max) * 100}%`, transformOrigin: 'left center' }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: Math.min(i, 12) * 0.03 }} />
                      </div>
                      <b className="tnum" style={{ width: 34 }}>
                        {r.rating}
                      </b>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WtcTable() {
  const st = useApi<any>('/api/standings/19430', { staleMs: 3600_000 })
  const rows = useMemo(() => {
    const g = st.data?.children?.[0]?.standings ?? st.data?.standings
    return (g?.entries ?? [])
      .map((e: any) => {
        const s: Record<string, number> = {}
        for (const x of e.stats ?? []) s[x.name] = +x.value || +x.displayValue || 0
        const played = s.matchesPlayed ?? 0
        // ICC ranks the WTC on percentage of points won (12 points available per Test)
        const pct = played ? (s.matchPoints / (played * 12)) * 100 : 0
        return { team: e.team, played, won: s.matchesWon ?? 0, lost: s.matchesLost ?? 0, drawn: s.matchesDraw ?? 0, pts: s.matchPoints ?? 0, pct }
      })
      .sort((a: any, b: any) => b.pct - a.pct)
  }, [st.data])
  const season = st.data?.children?.[0]?.standings?.season
  if (st.loading) return <Skel h={300} r={24} />
  if (!rows.length) return null
  return (
    <section className="section">
      <SectionHead title="World Test Championship." sub={season ? `${season}–${String(+season + 2).slice(-2)} cycle` : 'Current cycle'} to="/series/19430" linkText="Fixtures" />
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Team</th>
                <th>P</th>
                <th>W</th>
                <th>L</th>
                <th>D</th>
                <th className="hide-sm">Pts</th>
                <th style={{ minWidth: 120 }}>PCT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={r.team?.id} className={i < 2 ? 'hl' : ''}>
                  <td className="l">
                    <div className="row gap-12">
                      <span className="tnum faint" style={{ width: 18, fontWeight: 600 }}>
                        {i + 1}
                      </span>
                      <TeamLogo src={r.team?.logos?.[0]?.href} name={r.team?.displayName ?? ''} size={28} />
                      <span style={{ fontWeight: 600 }}>{r.team?.displayName}</span>
                      {i < 2 && <span className="badge result hide-sm">Final spot</span>}
                    </div>
                  </td>
                  <td>{r.played}</td>
                  <td>{r.won}</td>
                  <td>{r.lost}</td>
                  <td>{r.drawn}</td>
                  <td className="hide-sm muted">{r.pts}</td>
                  <td>
                    <b className="tnum">{r.pct.toFixed(1)}%</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cap faint" style={{ padding: '10px 20px 14px' }}>
          Top two after the cycle contest the final. PCT = percentage of available points won.
        </div>
      </div>
    </section>
  )
}

export default function Rankings() {
  const r = useApi<{ tables: RankTable[] }>('/api/rankings', { staleMs: 3600_000 })
  const [gender, setGender] = useState<"Men's" | "Women's">("Men's")
  const [format, setFormat] = useState<'Test' | 'ODI' | 'T20I'>('Test')
  const tables = (r.data?.tables ?? []).filter((t) => t.gender === gender)
  const fmts = tables.map((t) => t.format)
  const f = fmts.includes(format) ? format : fmts[0]
  const t = tables.find((x) => x.format === f)
  return (
    <motion.div className="page" {...pageMotion}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        ICC
      </div>
      <h1 className="large-title" style={{ marginBottom: 20 }}>
        Rankings
      </h1>
      <div className="row wrap gap-12" style={{ marginBottom: 28 }}>
        <Segmented value={gender} onChange={setGender} layout="rank-gender" options={[{ value: "Men's", label: "Men's" }, { value: "Women's", label: "Women's" }]} />
        <Segmented value={f ?? 'Test'} onChange={(v) => setFormat(v as 'Test' | 'ODI' | 'T20I')} layout="rank-format" options={(fmts.length ? fmts : ['Test', 'ODI', 'T20I']).map((x) => ({ value: x, label: x }))} />
      </div>
      {r.loading ? (
        <Skel h={420} r={28} />
      ) : r.error && !r.data ? (
        <ErrorState onRetry={r.refresh} />
      ) : t ? (
        <motion.div key={t.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Reveal>
            <div className="card podium-card">
              <div className="row between wrap gap-8">
                <div className="title3">{t.title}</div>
                {t.asOf && <span className="foot faint">As of {t.asOf}</span>}
              </div>
              <Podium rows={t.rows} women={gender === "Women's"} />
            </div>
          </Reveal>
          <div style={{ height: 16 }} />
          <RankingTable t={t} />
          <div className="cap faint" style={{ marginTop: 10 }}>
            Source: ICC rankings via Wikipedia’s maintained tables.{' '}
            <Link to="/series" className="link" style={{ fontSize: 12 }}>
              Browse series
            </Link>
          </div>
        </motion.div>
      ) : null}
      {gender === "Men's" && <WtcTable />}
    </motion.div>
  )
}
