import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ESPN, ESPN_ALT, resolve } from '../../shared/espn'

/**
 * Tiny stale-while-revalidate data layer.
 * - In-memory cache shared across components (instant back/forward navigation)
 * - Request de-duplication
 * - Optional polling that pauses when the tab is hidden
 */
type Entry = { data?: unknown; error?: Error; at: number; promise?: Promise<unknown> }
const store = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

const emit = (key: string) => listeners.get(key)?.forEach((l) => l())

/* ---------- transport: edge proxy first, direct-to-source fallback ---------- */

// Route kinds whose edge fetch was recently blocked upstream; go direct for a while.
const directUntil = new Map<string, number>()
const kindOf = (path: string) => path.split('/')[2] ?? ''

async function direct(url: string) {
  let r = await fetch(url).catch(() => null)
  if ((!r || !r.ok) && url.startsWith(ESPN)) r = await fetch(url.replace(ESPN, ESPN_ALT))
  if (!r || !r.ok) throw new Error(`Request failed (${r?.status ?? 'network'})`)
  return r.json()
}

async function load(path: string): Promise<unknown> {
  const kind = kindOf(path)
  if ((directUntil.get(kind) ?? 0) > Date.now()) return (await resolve(path, direct)).data
  try {
    const r = await fetch(path)
    if (r.ok) return await r.json()
    if (r.status !== 403 && r.status < 500) throw new Error(`Request failed (${r.status})`)
  } catch (e) {
    if ((e as Error).message.startsWith('Request failed')) throw e
  }
  // Edge was blocked or unreachable — run the same data layer straight from the browser.
  directUntil.set(kind, Date.now() + 10 * 60_000)
  return (await resolve(path, direct)).data
}

export async function fetchJSON<T>(path: string, force = false): Promise<T> {
  const e = store.get(path)
  if (e?.promise && !force) return e.promise as Promise<T>
  const promise = load(path)
    .then((data) => {
      store.set(path, { data, at: Date.now() })
      emit(path)
      return data
    })
    .catch((error: Error) => {
      const prev = store.get(path)
      store.set(path, { data: prev?.data, error, at: Date.now() })
      emit(path)
      throw error
    })
  store.set(path, { ...(e ?? { at: 0 }), promise })
  return promise as Promise<T>
}

export function prefetch(path: string) {
  const e = store.get(path)
  if (!e || (!e.promise && Date.now() - e.at > 30_000)) fetchJSON(path).catch(() => {})
}

function useVisible() {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener('visibilitychange', cb)
      return () => document.removeEventListener('visibilitychange', cb)
    },
    () => document.visibilityState === 'visible',
  )
}

export interface ApiResult<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  refreshedAt: number
  refresh: () => void
}

export function useApi<T>(path: string | null, opts: { poll?: number; staleMs?: number } = {}): ApiResult<T> {
  const { poll, staleMs = 60_000 } = opts
  const [, force] = useState(0)
  const visible = useVisible()
  const pathRef = useRef(path)
  pathRef.current = path

  useEffect(() => {
    if (!path) return
    const set = listeners.get(path) ?? new Set()
    const l = () => force((n) => n + 1)
    set.add(l)
    listeners.set(path, set)
    const e = store.get(path)
    if (!e || (!e.promise && Date.now() - e.at > staleMs) || (e.error && !e.data)) fetchJSON(path).catch(() => {})
    return () => {
      set.delete(l)
    }
  }, [path, staleMs])

  useEffect(() => {
    if (!path || !poll || !visible) return
    const t = setInterval(() => fetchJSON(path, true).catch(() => {}), poll)
    // refresh immediately when returning to the tab
    const e = store.get(path)
    if (e && Date.now() - e.at > poll) fetchJSON(path, true).catch(() => {})
    return () => clearInterval(t)
  }, [path, poll, visible])

  const e = path ? store.get(path) : undefined
  return {
    data: e?.data as T | undefined,
    error: e?.error,
    loading: !!path && !e?.data && !e?.error,
    refreshedAt: e?.at ?? 0,
    refresh: () => path && fetchJSON(path, true).catch(() => {}),
  }
}

export const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

export const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const parseYmd = (s: string) => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
