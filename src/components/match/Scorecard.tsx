import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fallOfWickets, partnerships } from '../../lib/analytics'
import { buildScorecards, type InningsCard } from '../../lib/scorecard'
import type { MatchCtx } from '../../pages/Match'
import { PartnershipBars } from '../charts/Charts'
import { Avatar, TeamLogo } from '../Media'

function InningsTabs({ cards, value, onChange }: { cards: InningsCard[]; value: number; onChange: (p: number) => void }) {
  const ordinalInn = (c: InningsCard) => {
    const k = cards.filter((x) => x.teamId === c.teamId && x.period <= c.period).length
    return cards.length > 2 ? (k === 1 ? '1st inn' : '2nd inn') : ''
  }
  return (
    <div className="scroll-x" style={{ marginBottom: 20 }}>
      {cards.map((c) => (
        <button key={c.period} className={`chip ${value === c.period ? 'on' : ''}`} onClick={() => onChange(c.period)} style={{ height: 42, paddingLeft: 8 }}>
          <TeamLogo src={c.logo} name={c.team} color={c.color} size={26} />
          <span style={{ fontWeight: 600 }}>{c.abbr}</span>
          <span className="tnum">
            {c.runs}
            {c.wkts < 10 ? `/${c.wkts}` : ''}
          </span>
          {ordinalInn(c) && <span style={{ opacity: 0.6, fontSize: 12 }}>{ordinalInn(c)}</span>}
        </button>
      ))}
    </div>
  )
}

export function Scorecard({ ctx }: { ctx: MatchCtx }) {
  const cards = useMemo(() => buildScorecards(ctx.summary), [ctx.summary])
  const [sel, setSel] = useState<number | null>(null)
  const period = sel ?? cards[cards.length - 1]?.period
  const card = cards.find((c) => c.period === period)
  const inn = ctx.innings.find((i) => i.inn === period)
  const parts = useMemo(() => (inn ? partnerships(inn) : []), [inn])
  const fow = useMemo(() => (inn ? fallOfWickets(inn) : []), [inn])
  if (!card) return <div className="card empty">The scorecard will appear once play gets underway.</div>
  const topRuns = Math.max(...card.batting.map((b) => b.runs))
  const bestBowl = card.bowling.reduce((m, b) => (b.wkts > m.wkts || (b.wkts === m.wkts && b.runs < m.runs) ? b : m), card.bowling[0])
  const color = ctx.colorOf(card.teamId)
  return (
    <div>
      <InningsTabs cards={cards} value={period} onChange={setSel} />
      <div className="stack gap-24">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="group-head" style={{ borderBottom: '0.5px solid var(--hair)', paddingBottom: 16 }}>
            <TeamLogo src={card.logo} name={card.team} color={color} size={40} />
            <div className="grow">
              <div className="title3">{card.team}</div>
              <div className="foot faint">
                {card.overs} overs{card.rr ? ` · RR ${card.rr}` : ''}
                {card.target ? ` · Target ${card.target}` : ''}
              </div>
            </div>
            <div className="tnum" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>
              {card.runs}
              {card.wkts < 10 ? `/${card.wkts}` : ''}
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Batter</th>
                  <th>R</th>
                  <th>B</th>
                  <th>4s</th>
                  <th>6s</th>
                  <th>SR</th>
                </tr>
              </thead>
              <tbody>
                {card.batting.map((b, i) => (
                  <motion.tr key={b.id} className={b.active ? 'hl' : ''} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }}>
                    <td className="l" style={{ whiteSpace: 'normal', minWidth: 210 }}>
                      <Link to={`/player/${b.id}`} className="row gap-12">
                        <Avatar src={b.headshot} name={b.name} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>
                            {b.name}
                            {b.captain && <span className="faint"> (c)</span>}
                            {b.keeper && <span className="faint"> †</span>}
                            {b.active && <span style={{ color: 'var(--live)' }}> *</span>}
                          </div>
                          <div className="foot faint">{b.notOut ? (b.active ? 'batting' : 'not out') : b.out}</div>
                        </div>
                      </Link>
                    </td>
                    <td className={b.runs === topRuns && b.runs >= 20 ? 'strong' : ''} style={{ fontWeight: 700, color: b.runs >= 100 ? 'var(--purple)' : b.runs >= 50 ? 'var(--accent)' : undefined }}>
                      {b.runs}
                    </td>
                    <td className="muted">{b.balls}</td>
                    <td className="muted">{b.fours}</td>
                    <td className="muted">{b.sixes}</td>
                    <td className="muted">{b.sr}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lrow foot" style={{ borderTop: '0.5px solid var(--hair)' }}>
            <span className="grow muted">
              <b style={{ color: 'var(--text)' }}>Extras</b> (b {card.extras.b}, lb {card.extras.lb}, w {card.extras.w}, nb {card.extras.nb}
              {card.extras.pen ? `, pen ${card.extras.pen}` : ''})
            </span>
            <b className="tnum">{card.extras.total}</b>
          </div>
          <div className="lrow" style={{ borderTop: '0.5px solid var(--hair)' }}>
            <span className="grow headline">Total</span>
            <span className="tnum headline">
              {card.runs}
              {card.wkts < 10 ? `/${card.wkts}` : ' all out'} <span className="faint" style={{ fontWeight: 400 }}>({card.overs} ov)</span>
            </span>
          </div>
          {card.yetToBat.length > 0 && card.batting.length < 11 && (
            <div className="lrow foot" style={{ borderTop: '0.5px solid var(--hair)', alignItems: 'flex-start' }}>
              <span className="faint" style={{ flex: 'none', width: 90 }}>
                {card.desc === 'complete' || card.wkts >= 10 ? 'Did not bat' : 'Yet to bat'}
              </span>
              <span className="muted">
                {card.yetToBat.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ', '}
                    <Link to={`/player/${p.id}`}>{p.name}</Link>
                  </span>
                ))}
              </span>
            </div>
          )}
          {fow.length > 0 && (
            <div className="lrow foot" style={{ borderTop: '0.5px solid var(--hair)', alignItems: 'flex-start' }}>
              <span className="faint" style={{ flex: 'none', width: 90 }}>
                Fall of wickets
              </span>
              <span className="muted tnum" style={{ lineHeight: 1.7 }}>
                {fow.map((f, i) => (
                  <span key={i} style={{ whiteSpace: 'nowrap' }}>
                    {i > 0 && <span className="faint"> · </span>}
                    <b style={{ color: 'var(--text)' }}>
                      {f.score}-{f.n}
                    </b>{' '}
                    ({f.batter.split(' ').slice(-1)}, {f.over})
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="group-head">
            <div className="title3 grow">Bowling</div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Bowler</th>
                  <th>O</th>
                  <th>M</th>
                  <th>R</th>
                  <th>W</th>
                  <th>Econ</th>
                  <th>0s</th>
                  <th>4s</th>
                  <th>6s</th>
                  <th>WD</th>
                  <th>NB</th>
                </tr>
              </thead>
              <tbody>
                {card.bowling.map((b) => (
                  <tr key={b.id} className={b.active ? 'hl' : ''}>
                    <td className="l" style={{ minWidth: 190 }}>
                      <Link to={`/player/${b.id}`} className="row gap-12">
                        <Avatar src={b.headshot} name={b.name} size={36} />
                        <span style={{ fontWeight: 600 }}>
                          {b.name}
                          {b.active && <span style={{ color: 'var(--live)' }}> *</span>}
                        </span>
                      </Link>
                    </td>
                    <td>{b.overs}</td>
                    <td className="muted">{b.maidens}</td>
                    <td>{b.runs}</td>
                    <td style={{ fontWeight: 700, color: b === bestBowl && b.wkts > 0 ? 'var(--accent)' : undefined }}>{b.wkts}</td>
                    <td className="muted">{b.econ}</td>
                    <td className="muted">{b.dots}</td>
                    <td className="muted">{b.fours}</td>
                    <td className="muted">{b.sixes}</td>
                    <td className="muted">{b.wides}</td>
                    <td className="muted">{b.noballs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {parts.length > 0 && (
          <div className="card pad">
            <div className="title3" style={{ marginBottom: 16 }}>
              Partnerships
            </div>
            <PartnershipBars list={parts} color={color} />
          </div>
        )}
      </div>
    </div>
  )
}
