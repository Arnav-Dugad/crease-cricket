import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { addDays, fetchJSON, useApi, ymd } from '../lib/api'
import { groupsFromScorepanel, shortLeague } from '../lib/normalize'
import type { LeagueGroup } from '../lib/types'
import { BrandMark, Icon, type IconName } from './Icon'
import { TeamLogo, LeagueLogo } from './Media'
import { spring } from './UI'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/matches', label: 'Matches', icon: 'calendar' },
  { to: '/series', label: 'Series', icon: 'trophy' },
  { to: '/news', label: 'News', icon: 'news' },
]

type Theme = 'auto' | 'light' | 'dark'

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('crease-theme') as Theme) || 'auto'
    } catch {
      return 'auto'
    }
  })
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('crease-theme', theme)
    } catch {
      /* storage unavailable */
    }
    const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f5f5f7')
  }, [theme])
  const cycle = () => {
    const sysDark = matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'auto' && sysDark)
    setTheme(isDark ? 'light' : 'dark')
  }
  return [theme, cycle]
}

const isActive = (path: string, to: string) => (to === '/' ? path === '/' : path.startsWith(to))

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [, cycleTheme] = useTheme()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea')) {
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

      <header className="topnav glass">
        <Link to="/" className="brand" aria-label="Crease home">
          <span className="brand-mark">
            <BrandMark size={17} />
          </span>
          Crease
        </Link>
        <nav className="navlinks" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={() => `navlink ${isActive(pathname, n.to) ? 'active' : ''}`}>
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
        <button className="icon-btn" onClick={cycleTheme} aria-label="Toggle dark mode">
          <Icon name="moon" size={19} className="theme-moon" />
        </button>
      </header>

      <main>{children}</main>

      <nav className="tabbar glass" aria-label="Tabs">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={() => `tab ${isActive(pathname, n.to) ? 'active' : ''}`}>
            {isActive(pathname, n.to) && <motion.span layoutId="tab-pill" className="pill-bg" transition={spring} />}
            <Icon name={n.icon} size={22} />
            {n.label}
          </NavLink>
        ))}
        <button className="tab" onClick={() => setPaletteOpen(true)}>
          <Icon name="search" size={22} />
          Search
        </button>
      </nav>

      <AnimatePresence>{paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}</AnimatePresence>

      <footer className="page" style={{ paddingTop: 0, paddingBottom: 140 }}>
        <div className="divider" style={{ marginBottom: 20 }} />
        <div className="foot faint row wrap gap-16 between">
          <span>Crease · Live cricket, beautifully. Data from public ESPNcricinfo feeds & Wikipedia. Logos and images belong to their respective owners.</span>
          <span>Win probabilities are statistical model estimates.</span>
        </div>
      </footer>
    </>
  )
}

/* ---------------- Command palette ---------------- */

interface Result {
  kind: 'player' | 'match' | 'series' | 'page'
  title: string
  sub?: string
  to: string
  img?: string | null
  color?: string
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
    input.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
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
    }, 180)
    return () => clearTimeout(t)
  }, [q])

  const groups: LeagueGroup[] = useMemo(() => groupsFromScorepanel([...(d1.data ?? []), ...(d0.data ?? []), ...(d2.data ?? [])] as never[]), [d0.data, d1.data, d2.data])

  const results: Result[] = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out: Result[] = []
    if (!s) {
      out.push(
        { kind: 'page', title: 'Live & today’s matches', to: '/matches', sub: 'Schedule' },
        { kind: 'page', title: 'All series', to: '/series', sub: 'Competitions' },
        { kind: 'page', title: 'Top stories', to: '/news', sub: 'News' },
      )
      for (const g of groups.slice(0, 5)) out.push({ kind: 'series', title: shortLeague(g.name), sub: `${g.matches.length} match${g.matches.length > 1 ? 'es' : ''}`, to: `/series/${g.id}`, img: g.logo })
      return out
    }
    for (const p of players) out.push({ kind: 'player', title: p.name, sub: p.team ?? 'Player', to: `/player/${p.id}`, img: p.teamLogo })
    const seen = new Set<string>()
    for (const g of groups) {
      if (g.name.toLowerCase().includes(s) && !seen.has(g.id)) {
        seen.add(g.id)
        out.push({ kind: 'series', title: shortLeague(g.name), sub: 'Series', to: `/series/${g.id}`, img: g.logo })
      }
      for (const m of g.matches) {
        if (m.title.toLowerCase().includes(s) || m.teams.some((t) => t.abbr.toLowerCase() === s))
          out.push({ kind: 'match', title: m.title, sub: `${shortLeague(m.leagueName)} · ${m.status || m.detail}`, to: `/match/${m.leagueId}/${m.id}`, img: m.teams[0].logo, color: m.teams[0].color })
      }
    }
    return out.slice(0, 30)
  }, [q, players, groups])

  useEffect(() => setSel(0), [q])

  const go = (r: Result) => {
    nav(r.to)
    onClose()
  }

  return (
    <motion.div className="overlay" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <motion.div
        className="palette"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -6 }}
        transition={spring}
      >
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={20} style={{ position: 'absolute', left: 20, top: 20, color: 'var(--text-3)' }} />
          <input
            ref={input}
            value={q}
            placeholder="Search players, teams, series…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
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
      </motion.div>
    </motion.div>
  )
}
