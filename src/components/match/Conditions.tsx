import { motion } from 'motion/react'
import { useMemo } from 'react'
import { useApi } from '../../lib/api'
import { whereToWatch } from '../../lib/broadcast'
import { histFormat, useH2H, useHistVenue, venueFormatKey } from '../../lib/hist'
import type { WikiInfo } from '../../lib/types'
import type { MatchCtx } from '../../pages/Match'
import { Icon } from '../Icon'
import { TeamLogo } from '../Media'
import { Skel } from '../UI'

/* ---------------- Weather (Open-Meteo) ---------------- */

interface Weather {
  current: { temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number; dew_point_2m: number; weather_code: number; cloud_cover: number; wind_speed_10m: number; wind_direction_10m: number; precipitation: number; is_day: number }
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[]; dew_point_2m: number[]; relative_humidity_2m: number[] }
  timezone: string
}

const WMO: Record<number, [string, string]> = {
  0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'], 45: ['Fog', '🌫️'], 48: ['Fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'], 61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️'],
}
const wmo = (c: number) => WMO[c] ?? WMO[Math.floor(c / 10) * 10] ?? ['—', '🌡️']

export function useVenueWeather(ctx: MatchCtx, wiki?: WikiInfo) {
  const q = wiki?.lat != null && wiki?.lon != null ? `lat=${wiki.lat}&lon=${wiki.lon}` : ctx.m.city ? `q=${encodeURIComponent(ctx.m.city)}` : null
  return useApi<Weather & { lat: number; lon: number }>(q ? `/api/weather?${q}` : null, { staleMs: 15 * 60_000 })
}

export function WeatherCard({ ctx, wiki }: { ctx: MatchCtx; wiki?: WikiInfo }) {
  const w = useVenueWeather(ctx, wiki)
  const start = +new Date(ctx.m.date)
  // match hours: from start (or now if live) for ~8 hours, within the 3-day forecast
  const hours = useMemo(() => {
    if (!w.data) return []
    const from = Math.max(Date.now() - 3600_000, start - 3600_000)
    return w.data.hourly.time
      .map((t, i) => ({ t: new Date(t), p: w.data!.hourly.precipitation_probability[i], temp: w.data!.hourly.temperature_2m[i], code: w.data!.hourly.weather_code[i], dew: w.data!.hourly.dew_point_2m[i] }))
      .filter((h) => +h.t >= from)
      .slice(0, 9)
  }, [w.data, start])
  if (!w.data && !w.loading) return null
  if (!w.data)
    return (
      <div className="card pad">
        <Skel h={90} />
      </div>
    )
  const c = w.data.current
  const [label, emoji] = wmo(c.weather_code)
  const spread = c.temperature_2m - c.dew_point_2m
  const evening = new Date(ctx.m.date).getHours() >= 14
  const dew = spread < 4 ? 'Heavy dew likely' : spread < 8 ? (evening ? 'Dew may set in later' : 'Some moisture in the air') : 'Dry conditions'
  const rainMax = Math.max(0, ...hours.map((h) => h.p ?? 0))
  return (
    <div className="card pad stack gap-14" style={{ gap: 14 }}>
      <div className="row between">
        <div>
          <div className="title3">Conditions</div>
          <div className="foot faint">{ctx.m.venue.split(',')[0] || ctx.m.city} · now</div>
        </div>
        <span style={{ fontSize: 38 }} aria-hidden>
          {emoji}
        </span>
      </div>
      <div className="row gap-20 wrap tnum">
        <div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>{Math.round(c.temperature_2m)}°</div>
          <div className="cap faint">{label}</div>
        </div>
        <div className="stack gap-4 foot">
          <span className="row gap-6">
            <Icon name="drop" size={14} /> Humidity {c.relative_humidity_2m}%
          </span>
          <span className="row gap-6">
            <Icon name="wind" size={14} /> Wind {Math.round(c.wind_speed_10m)} km/h
          </span>
          <span className="row gap-6">
            <Icon name="cloud" size={14} /> Cloud {c.cloud_cover}%
          </span>
        </div>
      </div>
      <div className="row gap-8 wrap">
        <span className={`badge ${spread < 4 ? 'upcoming' : ''}`}>💧 {dew}</span>
        <span className={`badge ${rainMax >= 50 ? 'live' : rainMax >= 25 ? 'upcoming' : 'result'}`}>{rainMax >= 50 ? '🌧 Rain threat' : rainMax >= 25 ? 'Chance of showers' : 'Rain unlikely'}</span>
        {c.cloud_cover > 70 && <span className="badge">Overcast — helps swing</span>}
      </div>
      {hours.length > 0 && (
        <div className="hours">
          {hours.map((h) => (
            <div key={+h.t} className="hour">
              <span className="cap faint">{h.t.toLocaleTimeString(undefined, { hour: 'numeric' })}</span>
              <span aria-hidden>{wmo(h.code)[1]}</span>
              <span className="foot tnum" style={{ fontWeight: 600 }}>
                {Math.round(h.temp)}°
              </span>
              <span className="cap tnum" style={{ color: (h.p ?? 0) >= 40 ? 'var(--blue)' : 'var(--text-3)' }}>
                {h.p ?? 0}%
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="cap faint">Forecast: Open-Meteo</div>
    </div>
  )
}

/* ---------------- Venue tendencies (Cricsheet history) ---------------- */

export function VenueProfile({ ctx }: { ctx: MatchCtx }) {
  const v = useHistVenue(ctx.m.venue || null, ctx.m.city)
  const f = venueFormatKey(histFormat(ctx.m.format, ctx.innings[0]?.limit), ctx.m.women)
  const block = v.data?.formats?.[f]
  if (!block) return null
  const stats: [string, string][] = [
    ['Matches', String(block.matches)],
    ...(block.avg1st ? [['Avg 1st innings', String(Math.round(block.avg1st))] as [string, string]] : []),
    ...(block.avg2nd ? [['Avg 2nd innings', String(Math.round(block.avg2nd))] as [string, string]] : []),
    ...(block.chaseWinPct != null ? [['Chasing side won', `${Math.round(block.chaseWinPct)}%`] as [string, string]] : []),
    ...(block.tossWinMatchWinPct != null ? [['Toss winner won', `${Math.round(block.tossWinMatchWinPct)}%`] as [string, string]] : []),
    ...(block.avgPowerplay ? [['Avg powerplay', String(Math.round(block.avgPowerplay))] as [string, string]] : []),
    ...(block.drawPct != null ? [['Draws', `${Math.round(block.drawPct)}%`] as [string, string]] : []),
  ]
  const kinds = Object.entries(block.wicketsByKind ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const kTotal = kinds.reduce((s, [, n]) => s + n, 0) || 1
  return (
    <div className="card pad stack gap-14" style={{ gap: 14 }}>
      <div>
        <div className="title3">Venue history</div>
        <div className="foot faint">
          {f.replace('W', ' (women)')} matches at {v.data?.name ?? ctx.m.venue.split(',')[0]} · Cricsheet
        </div>
      </div>
      <div className="grid cols-3" style={{ gap: 10 }}>
        {stats.map(([k, val]) => (
          <div key={k} className="mini-stat">
            <div className="tnum" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>
              {val}
            </div>
            <div className="cap faint">{k}</div>
          </div>
        ))}
      </div>
      {block.highest && (
        <div className="foot muted">
          Highest: <b style={{ color: 'var(--text)' }}>{block.highest.score}</b> by {block.highest.team}
          {block.lowest && (
            <>
              {' '}
              · Lowest: <b style={{ color: 'var(--text)' }}>{block.lowest.score}</b> by {block.lowest.team}
            </>
          )}
        </div>
      )}
      {kinds.length > 0 && (
        <div className="stack gap-6">
          <div className="cap faint">How wickets fall here</div>
          <div className="prob" style={{ height: 10 }}>
            {kinds.map(([k, n], i) => (
              <div key={k} title={`${k}: ${n}`} style={{ flexGrow: n / kTotal, background: ['var(--blue)', 'var(--purple)', 'var(--orange)', 'var(--teal)', 'var(--text-3)'][i], borderRadius: 99 }} />
            ))}
          </div>
          <div className="legend" style={{ fontSize: 12 }}>
            {kinds.map(([k, n], i) => (
              <span key={k}>
                <i style={{ background: ['var(--blue)', 'var(--purple)', 'var(--orange)', 'var(--teal)', 'var(--text-3)'][i] }} />
                {k} {Math.round((n / kTotal) * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Head to head ---------------- */

export function HeadToHead({ ctx }: { ctx: MatchCtx }) {
  const [a, b] = ctx.m.teams
  const h = useH2H(a.name, b.name)
  const f = histFormat(ctx.m.format, ctx.innings[0]?.limit)
  const data = h.data
  const block = data?.[f]
  if (!data || !block || !block.matches) return null
  // h2h keys use canonical (alias-merged) names; map ours onto them by position in the sorted pair
  const keyOf = (name: string) => data.teams.find((t) => t === name) ?? data.teams[[a.name, b.name].sort().indexOf(name)]
  const wa = block.wins[keyOf(a.name)] ?? 0
  const wb = block.wins[keyOf(b.name)] ?? 0
  const other = block.matches - wa - wb
  return (
    <div className="card pad stack gap-14" style={{ gap: 14 }}>
      <div className="row between">
        <div>
          <div className="title3">Head to head</div>
          <div className="foot faint">
            {block.matches} {f} meetings · Cricsheet
          </div>
        </div>
      </div>
      <div className="row gap-12" style={{ alignItems: 'center' }}>
        <TeamLogo src={a.logo} name={a.name} color={a.color} size={36} />
        <div className="grow">
          <div className="row between foot tnum" style={{ fontWeight: 700, marginBottom: 6 }}>
            <span>{wa} won</span>
            {other > 0 && <span className="faint">{other} other</span>}
            <span>{wb} won</span>
          </div>
          <div className="prob" style={{ height: 10 }}>
            <motion.div style={{ background: ctx.colorOf(a.id), borderRadius: 99 }} initial={{ flexGrow: 1 }} whileInView={{ flexGrow: wa || 0.001 }} viewport={{ once: true }} transition={{ duration: 1 }} />
            {other > 0 && <div style={{ flexGrow: other, background: 'var(--fill)', borderRadius: 99 }} />}
            <motion.div style={{ background: ctx.colorOf(b.id), borderRadius: 99 }} initial={{ flexGrow: 1 }} whileInView={{ flexGrow: wb || 0.001 }} viewport={{ once: true }} transition={{ duration: 1 }} />
          </div>
        </div>
        <TeamLogo src={b.logo} name={b.name} color={b.color} size={36} />
      </div>
      {block.last && block.last.length > 0 && (
        <div className="list" style={{ margin: '0 -22px -22px' }}>
          {block.last.slice(0, 5).map((r, i) => (
            <div key={i} className="lrow foot">
              <span className="faint tnum" style={{ width: 84, flex: 'none' }}>
                {new Date(r.d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })}
              </span>
              <span className="grow ellipsis">
                {r.winner ? (
                  <>
                    <b>{r.winner}</b> {r.margin ? `won by ${r.margin}` : 'won'}
                  </>
                ) : r.result === 'draw' ? (
                  'Drawn'
                ) : r.result === 'tie' ? (
                  'Tied'
                ) : (
                  'No result'
                )}
              </span>
              <span className="faint ellipsis hide-sm" style={{ maxWidth: 160 }}>
                {r.venue?.split(',')[0]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Where to watch ---------------- */

export function WhereToWatch({ ctx }: { ctx: MatchCtx }) {
  const rows = whereToWatch(ctx.m.leagueName)
  if (!rows) return null
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="group-head">
        <Icon name="tv" size={20} />
        <div className="title3 grow">Where to watch</div>
      </div>
      <div className="list">
        {rows.map((r) => (
          <div key={r.code} className="lrow">
            <span className="foot" style={{ width: 130, flex: 'none', fontWeight: r.mine ? 700 : 500, color: r.mine ? 'var(--accent)' : 'var(--text-2)' }}>
              {r.region}
              {r.mine ? ' · you' : ''}
            </span>
            <span className="sub">{r.broadcasters.join(' · ')}</span>
          </div>
        ))}
      </div>
      <div className="cap faint" style={{ padding: '10px 20px 14px' }}>
        Typical rights holders for this competition — broadcast deals vary by series, so check local listings.
      </div>
    </div>
  )
}
