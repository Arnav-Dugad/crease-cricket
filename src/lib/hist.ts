/**
 * Client access to precomputed historical data (Cricsheet → public/data/hist/*).
 * Small per-entity lookups go through the Worker (/api/hist/*) so pages download only
 * what they show; the model file (~28 KB) is fetched once and shared.
 */
import { useMemo } from 'react'
import { useApi } from './api'
import {
  chaseFeatures,
  firstFeatures,
  predictLogistic,
  type FormatModel,
  type H2HFormatBlock,
  type HistFormat,
  type HistModelFile,
  type HistPlayer,
  type HistTeam,
  type HistVenue,
  type PlayerFormatKey,
  type VenueFormatKey,
} from './hist-types'

export type { FormatModel, H2HFormatBlock, HistPlayer, HistVenue, PlayerFormatKey, VenueFormatKey } from './hist-types'
export type { Matchup, PlayerFormatStats, PlayerRecentEntry } from './hist-types'

export type HistVenueResp = HistVenue & { key: string }
export type HistH2HResp = { key: string; teams: string[] } & Partial<Record<HistFormat, H2HFormatBlock>>
export type HistTeamResp = HistTeam & { name: string; formsSince: string }

const DAY = 86400_000

export function useHistPlayers(ids: (string | undefined | null)[]) {
  const key = useMemo(() => [...new Set(ids.filter(Boolean) as string[])].sort().slice(0, 40).join(','), [ids])
  return useApi<Record<string, HistPlayer>>(key ? `/api/hist/players?ids=${key}` : null, { staleMs: DAY })
}

export function useHistVenue(name: string | null | undefined, city?: string) {
  return useApi<HistVenueResp | null>(name ? `/api/hist/venue?name=${encodeURIComponent(name)}${city ? `&city=${encodeURIComponent(city)}` : ''}` : null, { staleMs: DAY })
}

export function useH2H(a: string | null | undefined, b: string | null | undefined) {
  return useApi<HistH2HResp | null>(a && b ? `/api/hist/h2h?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}` : null, { staleMs: DAY })
}

export function useHistTeam(name: string | null | undefined) {
  return useApi<HistTeamResp | null>(name ? `/api/hist/team?name=${encodeURIComponent(name)}` : null, { staleMs: DAY })
}

export function useModel() {
  return useApi<HistModelFile>('/data/hist/model.json', { staleMs: DAY })
}

/** Pick the trained model for a match: by ball limit (T20 ≤ 130 balls, ODI ≤ 300), women's variant when available. */
export function modelFor(model: HistModelFile | undefined, limit: number, women: boolean): FormatModel | null {
  if (!model || !limit) return null
  const f = limit <= 130 ? 'T20' : limit <= 300 ? 'ODI' : null
  if (!f) return null
  return (women ? model[`${f}_women` as const] : undefined) ?? model[f] ?? null
}

export const histFormat = (format: string, limit?: number): HistFormat =>
  /test|first/i.test(format) ? 'Test' : /odi|list a|one-day/i.test(format) || (limit ?? 0) > 130 ? 'ODI' : 'T20'

export const venueFormatKey = (f: HistFormat, women: boolean) => (women ? `${f}W` : f) as VenueFormatKey

/** Trained win-probability predictors bound to one match (format + venue par). */
export interface TrainedWinModel {
  chase: (target: number, score: number, legalBalls: number, wkts: number, limit: number) => number
  first: (score: number, legalBalls: number, wkts: number) => number
  name: string
}

export function trainedWinModel(fm: FormatModel | null, venuePar?: number[] | null, venueParN?: number): TrainedWinModel | null {
  if (!fm?.chase || !fm.first) return null
  const std = fm.format === 'T20' ? 120 : 300
  const par = venuePar && (venueParN ?? 0) >= fm.first.venueParMinMatches ? venuePar : fm.first.parGlobal
  return {
    chase: (target, score, balls, wkts, limit) => predictLogistic(fm.chase, chaseFeatures(target, score, balls, wkts, limit)),
    first: (score, balls, wkts) => predictLogistic(fm.first, firstFeatures(score, balls, wkts, std, par)),
    name: `${fm.format}${fm.gender === 'female' ? ' (women)' : ''} logistic model · ${Math.round((fm.chase.eval.trainMatches ?? 0) / 100) / 10}k matches`,
  }
}

export const playerFormatKey = (f: HistFormat, intl: boolean): PlayerFormatKey => (f === 'T20' ? (intl ? 'T20I' : 'T20') : intl ? (`${f}_intl` as PlayerFormatKey) : f)
