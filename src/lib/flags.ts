/**
 * National teams: names, ICC codes (as used in rankings tables), ESPN team IDs and
 * flag images (flagcdn.com, free). Used as a logo fallback and for rankings.
 */
interface Nation {
  name: string
  iso?: string // flagcdn code
  espn?: number // ESPN/Cricinfo team id
}

export const NATIONS: Record<string, Nation> = {
  AUS: { name: 'Australia', iso: 'au', espn: 2 },
  IND: { name: 'India', iso: 'in', espn: 6 },
  ENG: { name: 'England', iso: 'gb-eng', espn: 1 },
  SA: { name: 'South Africa', iso: 'za', espn: 3 },
  NZ: { name: 'New Zealand', iso: 'nz', espn: 5 },
  WIN: { name: 'West Indies', espn: 4 },
  WI: { name: 'West Indies', espn: 4 },
  PAK: { name: 'Pakistan', iso: 'pk', espn: 7 },
  SL: { name: 'Sri Lanka', iso: 'lk', espn: 8 },
  ZIM: { name: 'Zimbabwe', iso: 'zw', espn: 9 },
  BAN: { name: 'Bangladesh', iso: 'bd', espn: 25 },
  AFG: { name: 'Afghanistan', iso: 'af', espn: 40 },
  IRE: { name: 'Ireland', iso: 'ie' },
  SCO: { name: 'Scotland', iso: 'gb-sct', espn: 30 },
  NED: { name: 'Netherlands', iso: 'nl', espn: 15 },
  USA: { name: 'United States', iso: 'us' },
  NAM: { name: 'Namibia', iso: 'na' },
  NEP: { name: 'Nepal', iso: 'np', espn: 33 },
  OMA: { name: 'Oman', iso: 'om', espn: 37 },
  UAE: { name: 'United Arab Emirates', iso: 'ae', espn: 27 },
  CAN: { name: 'Canada', iso: 'ca' },
  UGA: { name: 'Uganda', iso: 'ug' },
  PNG: { name: 'Papua New Guinea', iso: 'pg' },
  ITA: { name: 'Italy', iso: 'it' },
  HK: { name: 'Hong Kong', iso: 'hk', espn: 19 },
  MAS: { name: 'Malaysia', iso: 'my' },
  KUW: { name: 'Kuwait', iso: 'kw', espn: 38 },
  ESP: { name: 'Spain', iso: 'es' },
  QAT: { name: 'Qatar', iso: 'qa' },
  JER: { name: 'Jersey', iso: 'je' },
  THA: { name: 'Thailand', iso: 'th', espn: 156 },
  KEN: { name: 'Kenya', iso: 'ke' },
  BHR: { name: 'Bahrain', iso: 'bh' },
  SIN: { name: 'Singapore', iso: 'sg', espn: 23 },
  GER: { name: 'Germany', iso: 'de' },
  TAN: { name: 'Tanzania', iso: 'tz' },
  NGA: { name: 'Nigeria', iso: 'ng' },
  ZAM: { name: 'Zambia', iso: 'zm' },
  DEN: { name: 'Denmark', iso: 'dk' },
  AUT: { name: 'Austria', iso: 'at' },
  SWE: { name: 'Sweden', iso: 'se' },
  BUL: { name: 'Bulgaria', iso: 'bg' },
  FRA: { name: 'France', iso: 'fr' },
  JPN: { name: 'Japan', iso: 'jp', espn: 32 },
  ARG: { name: 'Argentina', iso: 'ar' },
  BRA: { name: 'Brazil', iso: 'br' },
  MEX: { name: 'Mexico', iso: 'mx' },
  RWA: { name: 'Rwanda', iso: 'rw' },
  BOT: { name: 'Botswana', iso: 'bw' },
  MOZ: { name: 'Mozambique', iso: 'mz' },
  LES: { name: 'Lesotho', iso: 'ls' },
  GAM: { name: 'Gambia', iso: 'gm' },
  CAY: { name: 'Cayman Islands', iso: 'ky' },
  BER: { name: 'Bermuda', iso: 'bm' },
}

const byName = new Map(Object.values(NATIONS).map((n) => [n.name.toLowerCase(), n]))
byName.set('u.s.a.', NATIONS.USA)
byName.set('uae', NATIONS.UAE)

export const flagUrl = (iso: string, w = 160) => `https://flagcdn.com/w${w}/${iso}.png`

/** Strip "Women", "A", "U19" etc. to find the underlying nation. */
export function nationOf(teamName: string): Nation | null {
  const base = teamName
    .replace(/\b(women|men|a|u-?19|under-?19|xi|emerging)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return byName.get(base) ?? null
}

export function nationLogo(n: Nation, size = 160): string | null {
  if (n.espn) return `https://a.espncdn.com/i/teamlogos/cricket/500/${n.espn}.png`
  return n.iso ? flagUrl(n.iso, size) : null
}

export function flagFor(teamName: string, size = 160): string | null {
  const n = nationOf(teamName)
  return n?.iso ? flagUrl(n.iso, size) : null
}
