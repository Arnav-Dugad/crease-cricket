import { useSyncExternalStore } from 'react'

/**
 * Small persisted stores (localStorage, failure-tolerant) built on useSyncExternalStore:
 *  - display preferences: theme, contrast, motion
 *  - follows: teams and players the viewer cares about
 */
function createStore<T>(key: string, initial: T) {
  let state: T = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw) state = { ...initial, ...JSON.parse(raw) }
  } catch {
    /* storage unavailable */
  }
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(next: Partial<T> | ((s: T) => Partial<T>)) {
      state = { ...state, ...(typeof next === 'function' ? next(state) : next) }
      try {
        localStorage.setItem(key, JSON.stringify(state))
      } catch {
        /* ignore */
      }
      subs.forEach((s) => s())
    },
    subscribe(cb: () => void) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
}

/* ---------- display preferences ---------- */

export type Theme = 'auto' | 'light' | 'dark'
export interface Prefs {
  theme: Theme
  contrast: 'standard' | 'high'
  motion: 'full' | 'reduced'
  haptics: boolean
}

export const prefsStore = createStore<Prefs>('crease-prefs', { theme: 'auto', contrast: 'standard', motion: 'full', haptics: true })

// migrate the original standalone theme key
try {
  const legacy = localStorage.getItem('crease-theme')
  if (legacy === 'light' || legacy === 'dark') {
    prefsStore.set({ theme: legacy })
    localStorage.removeItem('crease-theme')
  }
} catch {
  /* ignore */
}

export const usePrefs = () => useSyncExternalStore(prefsStore.subscribe, prefsStore.get)

export function applyPrefs(p: Prefs) {
  const root = document.documentElement
  if (p.theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', p.theme)
  root.toggleAttribute('data-contrast', p.contrast === 'high')
  root.toggleAttribute('data-reduced-motion', p.motion === 'reduced')
  const dark = p.theme === 'dark' || (p.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f5f5f7')
}

export const prefersReducedMotion = () =>
  prefsStore.get().motion === 'reduced' || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)

export function haptic(pattern: number | number[]) {
  if (!prefsStore.get().haptics) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported */
  }
}

/* ---------- follows ---------- */

export interface FollowTeam {
  id: string
  name: string
  logo?: string | null
  color?: string
}
export interface FollowPlayer {
  id: string
  name: string
}
interface Follows {
  teams: FollowTeam[]
  players: FollowPlayer[]
}

export const followsStore = createStore<Follows>('crease-follows', { teams: [], players: [] })
export const useFollows = () => useSyncExternalStore(followsStore.subscribe, followsStore.get)

export function toggleTeam(t: FollowTeam) {
  followsStore.set((s) => ({ teams: s.teams.some((x) => x.id === t.id) ? s.teams.filter((x) => x.id !== t.id) : [...s.teams, t] }))
}
export function togglePlayer(p: FollowPlayer) {
  followsStore.set((s) => ({ players: s.players.some((x) => x.id === p.id) ? s.players.filter((x) => x.id !== p.id) : [...s.players, p] }))
}
