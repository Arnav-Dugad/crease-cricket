/**
 * Where to watch — a curated guide to typical rights holders by competition and region.
 * ESPN's feeds don't carry cricket broadcast data, so this is maintained by hand and shown
 * with a "check local listings" caveat. Order puts the viewer's own region first.
 */
interface Entry {
  match: RegExp
  /** region code → broadcasters */
  regions: Record<string, string[]>
}

const R = { IN: 'India', GB: 'UK & Ireland', AU: 'Australia', US: 'USA & Canada', ZA: 'South Africa', NZ: 'New Zealand', PK: 'Pakistan', BD: 'Bangladesh', LK: 'Sri Lanka', CB: 'Caribbean', AE: 'Middle East', XX: 'Elsewhere' } as const
type Region = keyof typeof R

const GUIDE: Entry[] = [
  { match: /indian premier league|\bipl\b/i, regions: { IN: ['Star Sports', 'JioHotstar'], GB: ['Sky Sports'], AU: ['Fox Cricket', 'Kayo'], US: ['Willow TV'], ZA: ['SuperSport'], NZ: ['Sky Sport NZ'], XX: ['YuppTV'] } },
  { match: /women's premier league|\bwpl\b/i, regions: { IN: ['Star Sports', 'JioHotstar'], US: ['Willow TV'] } },
  { match: /big bash/i, regions: { AU: ['Fox Cricket', 'Kayo', 'Seven'], IN: ['Star Sports'], GB: ['TNT Sports'], US: ['Willow TV'] } },
  { match: /\bsa20\b/i, regions: { ZA: ['SuperSport'], IN: ['Star Sports', 'JioHotstar'], GB: ['Sky Sports'], US: ['Willow TV'] } },
  { match: /pakistan super league|\bpsl\b/i, regions: { PK: ['PTV Sports', 'A Sports'], GB: ['Sky Sports'], US: ['Willow TV'] } },
  { match: /the hundred/i, regions: { GB: ['Sky Sports', 'BBC'], IN: ['Sony Sports'], US: ['Willow TV'], AU: ['Fox Cricket'] } },
  { match: /caribbean premier league|\bcpl\b/i, regions: { CB: ['ESPN Caribbean'], IN: ['FanCode'], US: ['Willow TV'], GB: ['TNT Sports'] } },
  { match: /major league cricket/i, regions: { US: ['Willow TV'], IN: ['Star Sports'] } },
  { match: /ilt20|international league t20/i, regions: { AE: ['Zee'], IN: ['Zee'], GB: ['Sky Sports'], US: ['Willow TV'] } },
  { match: /^icc|world cup|champions trophy|world test championship/i, regions: { IN: ['Star Sports', 'JioHotstar'], GB: ['Sky Sports'], AU: ['Amazon Prime Video'], US: ['Willow TV'], ZA: ['SuperSport'], NZ: ['Sky Sport NZ'], PK: ['PTV Sports', 'Tamasha'], XX: ['ICC.tv (selected regions)'] } },
  { match: /tour of india|in india/i, regions: { IN: ['Star Sports', 'JioHotstar'], GB: ['TNT Sports'], AU: ['Fox Cricket', 'Kayo'], US: ['Willow TV'], ZA: ['SuperSport'] } },
  { match: /tour of australia|in australia/i, regions: { AU: ['Fox Cricket', 'Kayo', 'Seven'], IN: ['Star Sports'], GB: ['TNT Sports'], US: ['Willow TV'] } },
  { match: /tour of england|in england/i, regions: { GB: ['Sky Sports'], IN: ['Sony Sports'], AU: ['Fox Cricket'], US: ['Willow TV'] } },
  { match: /tour of south africa|in south africa/i, regions: { ZA: ['SuperSport'], IN: ['Star Sports'], GB: ['Sky Sports'], AU: ['Fox Cricket'], US: ['Willow TV'] } },
  { match: /tour of new zealand|in new zealand/i, regions: { NZ: ['Sky Sport NZ'], IN: ['Amazon Prime Video'], GB: ['TNT Sports'], AU: ['Fox Cricket'], US: ['Willow TV'] } },
  { match: /tour of pakistan|in pakistan|pakistan .*tri-series/i, regions: { PK: ['PTV Sports', 'A Sports'], IN: ['Sony Sports'], GB: ['Sky Sports'], US: ['Willow TV'] } },
  { match: /tour of sri lanka|in sri lanka/i, regions: { LK: ['Dialog TV'], IN: ['Sony Sports'], US: ['Willow TV'] } },
  { match: /tour of bangladesh|in bangladesh/i, regions: { BD: ['T Sports'], IN: ['FanCode'], US: ['Willow TV'] } },
  { match: /tour of west indies|in west indies/i, regions: { CB: ['ESPN Caribbean'], IN: ['FanCode'], GB: ['TNT Sports'], US: ['Willow TV'] } },
]

function viewerRegion(): Region {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (/Kolkata|Calcutta/.test(tz)) return 'IN'
    if (/London|Dublin/.test(tz)) return 'GB'
    if (/Australia/.test(tz)) return 'AU'
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Toronto|Vancouver|Phoenix)/.test(tz)) return 'US'
    if (/Johannesburg/.test(tz)) return 'ZA'
    if (/Auckland/.test(tz)) return 'NZ'
    if (/Karachi/.test(tz)) return 'PK'
    if (/Dhaka/.test(tz)) return 'BD'
    if (/Colombo/.test(tz)) return 'LK'
    if (/Dubai|Riyadh|Qatar|Muscat/.test(tz)) return 'AE'
    if (/Port_of_Spain|Barbados|Jamaica|Guyana|Antigua/.test(tz)) return 'CB'
  } catch {
    /* ignore */
  }
  return 'XX'
}

export function whereToWatch(leagueName: string) {
  const e = GUIDE.find((g) => g.match.test(leagueName))
  if (!e) return null
  const mine = viewerRegion()
  const rows = (Object.entries(e.regions) as [Region, string[]][]).map(([r, b]) => ({ region: R[r], code: r, broadcasters: b, mine: r === mine }))
  rows.sort((a, b) => Number(b.mine) - Number(a.mine))
  return rows
}
