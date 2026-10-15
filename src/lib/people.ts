import { useEffect, useState } from 'react'
import { fetchJSON } from './api'

/**
 * Real player/umpire photos from Wikidata (by ESPNcricinfo ID), batched:
 * every avatar on screen asks for its id; requests made in the same tick are merged
 * into one `/api/people?ids=...` call. Results persist in localStorage for 14 days.
 */
export interface PersonImage {
  img: string | null
  img2x: string | null
  qid?: string
  desc?: string
}

const LS_KEY = 'crease-people-v1'
const TTL = 14 * 86400_000
const known = new Map<string, PersonImage | null>()
const waiting = new Map<string, Set<(v: PersonImage | null) => void>>()
let queue = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

try {
  const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, [number, PersonImage | null]>
  for (const [id, [at, v]] of Object.entries(raw)) if (Date.now() - at < TTL) known.set(id, v)
} catch {
  /* ignore */
}

function persist() {
  try {
    const out: Record<string, [number, PersonImage | null]> = {}
    let n = 0
    for (const [id, v] of [...known.entries()].reverse()) {
      if (n++ > 1500) break
      out[id] = [Date.now(), v]
    }
    localStorage.setItem(LS_KEY, JSON.stringify(out))
  } catch {
    /* ignore */
  }
}

async function flush() {
  timer = null
  const ids = [...queue]
  queue = new Set()
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60).sort()
    let res: Record<string, PersonImage> = {}
    try {
      res = await fetchJSON<Record<string, PersonImage>>(`/api/people?ids=${chunk.join(',')}`)
    } catch {
      /* network: leave unknown so a later view can retry */
      chunk.forEach((id) => waiting.get(id)?.forEach((cb) => cb(null)))
      continue
    }
    for (const id of chunk) {
      const v = res[id] ?? null
      known.set(id, v)
      waiting.get(id)?.forEach((cb) => cb(v))
      waiting.delete(id)
    }
  }
  persist()
}

export function requestPerson(id: string, cb: (v: PersonImage | null) => void) {
  if (known.has(id)) {
    cb(known.get(id)!)
    return () => {}
  }
  const set = waiting.get(id) ?? new Set()
  set.add(cb)
  waiting.set(id, set)
  queue.add(id)
  if (!timer) timer = setTimeout(flush, 40)
  return () => set.delete(cb)
}

export function usePersonImage(id: string | null | undefined, enabled = true) {
  const [v, setV] = useState<PersonImage | null | undefined>(() => (id && known.has(id) ? known.get(id) : undefined))
  useEffect(() => {
    if (!id || !enabled || !/^\d+$/.test(id)) return
    return requestPerson(id, setV)
  }, [id, enabled])
  return v
}
