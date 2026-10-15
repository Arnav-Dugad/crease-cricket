/**
 * Historical stats (precomputed from Cricsheet by scripts/cricsheet/build.mjs) served
 * from the Worker's own static assets, so lookups return only what a page needs.
 * Parsed files are memoised per isolate.
 */
import { histVenueKey, playerShard, type HistH2HFile, type HistMetaFile, type HistPlayer, type HistTeamsFile, type HistVenuesFile } from '../src/lib/hist-types'

const memo = new Map<string, Promise<unknown>>()

function asset<T>(assets: Fetcher, path: string): Promise<T | null> {
  let p = memo.get(path)
  if (!p) {
    p = assets
      .fetch(new Request(`https://assets.local/data/hist/${path}`))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    memo.set(path, p)
  }
  return p as Promise<T | null>
}

export async function histPlayers(assets: Fetcher, ids: string[]) {
  const shards = new Map<number, string[]>()
  for (const id of ids) {
    const s = playerShard(id)
    shards.set(s, [...(shards.get(s) ?? []), id])
  }
  const out: Record<string, HistPlayer> = {}
  await Promise.all(
    [...shards.entries()].map(async ([s, list]) => {
      const shard = await asset<Record<string, HistPlayer>>(assets, `players/${s}.json`)
      for (const id of list) if (shard?.[id]) out[id] = shard[id]
    }),
  )
  return out
}

const loose = (s: string) => s.replace(/\b(stadium|ground|cricket|oval|international|park|the)\b/g, '').replace(/\s+/g, ' ').trim()

export async function histVenue(assets: Fetcher, name: string, city?: string) {
  const file = await asset<HistVenuesFile>(assets, 'venues.json')
  if (!file || !name) return null
  const key = histVenueKey(name, city, file)
  if (file.venues[key]) return { key, ...file.venues[key] }
  // Fuzzy fallback for naming differences between ESPN and Cricsheet ("Wankhede" vs "Wankhede Stadium").
  const k = loose(key)
  const c = city?.toLowerCase()
  for (const [vk, v] of Object.entries(file.venues)) {
    const lv = loose(vk)
    if (k.length > 3 && lv.length > 3 && (lv === k || lv.startsWith(k) || k.startsWith(lv)) && (!c || !v.city || v.city.toLowerCase() === c)) return { key: vk, ...v }
  }
  return null
}

export async function histH2H(assets: Fetcher, a: string, b: string) {
  const file = await asset<HistH2HFile>(assets, 'h2h.json')
  if (!file || !a || !b) return null
  const A = file.aliases[a] ?? a
  const B = file.aliases[b] ?? b
  const teams = [A, B].sort()
  const key = teams.join('|')
  return file.pairs[key] ? { key, teams, ...file.pairs[key] } : null
}

export async function histTeam(assets: Fetcher, name: string) {
  const file = await asset<HistTeamsFile>(assets, 'teams.json')
  if (!file || !name) return null
  const n = file.aliases[name] ?? name
  return file.teams[n] ? { name: n, formsSince: file.formsSince, ...file.teams[n] } : null
}

export async function histMeta(assets: Fetcher) {
  return asset<HistMetaFile>(assets, 'meta.json')
}
