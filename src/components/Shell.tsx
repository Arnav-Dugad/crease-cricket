import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { addDays, fetchJSON, useApi, ymd } from '../lib/api'
import { groupsFromScorepanel, shortLeague } from '../lib/normalize'
import { applyPrefs, prefsStore, usePrefs, type Prefs } from '../lib/prefs'
import type { LeagueGroup } from '../lib/types'
import { BrandMark, Icon, type IconName } from './Icon'
import { LiveTicker } from './LiveTicker'
import { Avatar, LeagueLogo, TeamLogo } from './Media'
import { Sheet } from './Sheet'
import { Segmented, spring } from './UI'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/matches', label: 'Matches', icon: 'calendar' },
  { to: '/series', label: 'Series', icon: 'trophy' },
  { to: '/rankings', label: 'Rankings', icon: 'medal' },
  { to: '/news', label: 'News', icon: 'news' },
]

const isActive = (path: string, to: string) => (to === '/' ? path === '/' : path.startsWith(to))

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const prefs = usePrefs()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    applyPrefs(prefs)
    if (prefs.theme !== 'auto') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyPrefs(prefsStore.get())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [prefs])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select')) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return (
    <>
      <div className="ambient" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <div className="grain" />
      </div>

      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="topnav glass">
        <Link to="/" className="brand" aria-label="Crease home" viewTransition>
          <span className="brand-mark">
            <BrandMark size={17} />
          </span>
          Crease
        </Link>
        <nav className="navlinks" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} viewTransition className={() => `navlink ${isActive(pathname, n.to) ? 'active' : ''}`}>
              {isActive(pathname, n.to) && <motion.span layoutId="nav-pill" className="pill-bg" transition={spring} />}
              {n.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <button className="search-btn" onClick={() => setPaletteOpen(true)} aria-label="Search">
          <Icon name="search" size={17} />
          <span className="label">Search players, teams, series</span>
          <span className="kbd">⌘K</span>
        </button>
        <Link to="/multi" className="icon-btn hide-sm" aria-label="Multi-match view" title="Multi-match view" viewTransition>
          <Icon name="split" size={19} />
        </Link>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Display settings" title="Display settings">
          <Icon name="sliders" size={19} />
        </button>
      </header>

      <LiveTicker />
      <OfflineBanner />

      <main id="main">{children}</main>

      <nav className="tabbar glass" aria-label="Tabs">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} viewTransition className={() => `tab ${isActive(pathname, n.to) ? 'active' : ''}`}>
            {isActive(pathname, n.to) && <motion.span layoutId="tab-pill" className="pill-bg" transition={spring} />}
            <Icon name={n.icon} size={22} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <Sheet open={paletteOpen} onClose={() => setPaletteOpen(false)} label="Search">
        <CommandPalette onClose={() => setPaletteOpen(false)} />
      </Sheet>
      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} label="Display settings" width={440}>
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      </Sheet>

      <footer className="page site-footer">
        <div className="divider" style={{ marginBottom: 20 }} />
        <div className="foot faint row wrap gap-16 between">
          <span>
            Crease · Live cricket, beautifully. Data: ESPNcricinfo public feeds, Cricsheet (ODC-BY), Wikipedia & Wikidata, TheSportsDB, Open-Meteo. Logos and images belong to
            their respective owners.
          </span>
          <span>Win probabilities and projections are statistical model estimates.</span>
        </div>
      </footer>
    </>
  )
}

function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return (
    <AnimatePresence>
      {!online && (
        <motion.div className="offline-banner glass" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} role="status">
          <Icon name="cloud" size={16} /> You’re offline — showing the last saved scores
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- Settings ---------------- */

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const p = usePrefs()
  const set = (v: Partial<Prefs>) => prefsStore.set(v)
  return (
    <div className="stack gap-20" style={{ padding: '20px 22px 26px' }}>
      <div className="row between">
        <div className="title3">Display</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="stack gap-8">
        <div className="foot muted">Appearance</div>
        <Segmented
          value={p.theme}
          onChange={(theme) => set({ theme })}
          layout="set-theme"
          options={[
            { value: 'auto', label: 'Automatic' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </div>
      <div className="stack gap-8">
        <div className="foot muted">Contrast</div>
        <Segmented
          value={p.contrast}
          onChange={(contrast) => set({ contrast })}
          layout="set-contrast"
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'high', label: 'High contrast' },
          ]}
        />
        <div className="cap faint">High contrast uses solid surfaces, stronger borders and pure text colours.</div>
      </div>
      <div className="stack gap-8">
        <div className="foot muted">Motion</div>
        <Segmented
          value={p.motion}
          onChange={(motion) => set({ motion })}
          layout="set-motion"
          options={[
            { value: 'full', label: 'Full' },
            { value: 'reduced', label: 'Reduced' },
          ]}
        />
      </div>
      <label className="row between" style={{ cursor: 'pointer' }}>
        <span className="stack">
          <span className="sub">Haptics</span>
          <span className="cap faint">Vibrate on wickets and boundaries (supported phones)</span>
        </span>
        <input type="checkbox" className="switch" checked={p.haptics} onChange={(e) => set({ haptics: e.target.checked })} />
      </label>
    </div>
  )
}

/* ---------------- Command palette ---------------- */

interface Result {
  kind: 'player' | 'match' | 'series' | 'page' | 'team'
  title: string
  sub?: string
  to: string
  img?: string | null
  color?: string
  id?: string
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [players, setPlayers] = useState<{ id: string; name: string; team: string | null; teamLogo: string | null }[]>([])
  const today = new Date()
  const d0 = useApi<unknown[]>(`/api/day/${ymd(today)}`)
  const d1 = useApi<unknown[]>(`/api/day/${ymd(addDays(today, -1))}`)
  const d2 = useApi<unknown[]>(`/api/day/${ymd(addDays(today, 1))}`)

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) {
      setPlayers([])
      return
    }
    const t = setTimeout(() => {
      fetchJSON<typeof players>(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then(setPlayers)
        .catch(() => setPlayers([]))
    }, 160)
    return () => clearTimeout(t)
  }, [q])

  const groups: LeagueGroup[] = useMemo(() => groupsFromScorepanel([...(d1.data ?? []), ...(d0.data ?? []), ...(d2.data ?? [])] as never[]), [d0.data, d1.data, d2.data])

  const results: Result[] = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out: Result[] = []
    if (!s) {
      out.push(
        { kind: 'page', title: 'Live & today’s matches', to: '/matches', sub: 'Schedule' },
        { kind: 'page', title: 'ICC rankings & WTC table', to: '/rankings', sub: 'Rankings' },
        { kind: 'page', title: 'Multi-match view', to: '/multi', sub: 'Follow several games at once' },
        { kind: 'page', title: 'All series', to: '/series', sub: 'Competitions' },
      )
      for (const g of groups.slice(0, 5)) out.push({ kind: 'series', title: shortLeague(g.name), sub: `${g.matches.length} match${g.matches.length > 1 ? 'es' : ''}`, to: `/series/${g.id}`, img: g.logo })
      return out
    }
    for (const p of players) out.push({ kind: 'player', title: p.name, sub: p.team ?? 'Player', to: `/player/${p.id}`, img: p.teamLogo, id: p.id })
    const seen = new Set<string>()
    const teamsSeen = new Set<string>()
    for (const g of groups) {
      if (g.name.toLowerCase().includes(s) && !seen.has(g.id)) {
        seen.add(g.id)
        out.push({ kind: 'series', title: shortLeague(g.name), sub: 'Series', to: `/series/${g.id}`, img: g.logo })
      }
      for (const m of g.matches) {
        for (const t of m.teams)
          if (!teamsSeen.has(t.id) && t.name !== 'TBC' && (t.name.toLowerCase().includes(s) || t.abbr.toLowerCase() === s)) {
            teamsSeen.add(t.id)
            out.push({ kind: 'team', title: t.name, sub: 'Team', to: `/team/${t.id}/${encodeURIComponent(t.name)}`, img: t.logo, color: t.color })
          }
        if (m.title.toLowerCase().includes(s) || m.teams.some((t) => t.abbr.toLowerCase() === s))
          out.push({ kind: 'match', title: m.title, sub: `${shortLeague(m.leagueName)} · ${m.status || m.detail}`, to: `/match/${m.leagueId}/${m.id}`, img: m.teams[0].logo, color: m.teams[0].color })
      }
    }
    return out.slice(0, 30)
  }, [q, players, groups])

  useEffect(() => setSel(0), [q])

  const go = (r: Result) => {
    nav(r.to, { viewTransition: true })
    onClose()
  }

  return (
    <div className="palette">
      <div style={{ position: 'relative' }}>
        <Icon name="search" size={20} style={{ position: 'absolute', left: 20, top: 20, color: 'var(--text-3)' }} />
        <input
          ref={input}
          value={q}
          placeholder="Search players, teams, series…"
          aria-label="Search"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(results.length - 1, s + 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(0, s - 1))
            }
            if (e.key === 'Enter' && results[sel]) go(results[sel])
          }}
        />
      </div>
      <div className="results">
        {results.length === 0 && <div className="empty sub">{q.length < 2 ? 'Type to search' : 'No results'}</div>}
        {results.map((r, i) => (
          <div key={r.kind + r.to + i} className={`item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
            {r.kind === 'series' ? (
              <LeagueLogo src={r.img ?? undefined} name={r.title} size={34} />
            ) : r.kind === 'player' ? (
              <Avatar id={r.id} name={r.title} size={34} />
            ) : r.kind === 'page' ? (
              <span className="logo" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--fill-2)' }}>
                <Icon name="chevron" size={16} />
              </span>
            ) : (
              <TeamLogo src={r.img} name={r.title} color={r.color} size={34} />
            )}
            <div className="grow">
              <div className="ellipsis" style={{ fontWeight: 600, fontSize: 15 }}>
                {r.title}
              </div>
              <div className="ellipsis foot faint">{r.sub}</div>
            </div>
            <span className="badge">{r.kind}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
