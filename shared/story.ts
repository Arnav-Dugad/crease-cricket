/**
 * Builds a compact, factual text context for one phase (block of overs) of an innings,
 * used to prompt an LLM for a short "match story" paragraph. Shared by Worker and client.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

export interface SlimBall {
  inn: number
  team: string
  o: number
  ov: number
  r: number
  t: string
  short: string
  runs: number
  wkts: number
  target: number
  limit: number
  w: boolean
  wtext: string
  bat: { n: string; r: number; b: number } | null
  bowl: { n: string; o: number; r: number; w: number } | null
}

export const BLOCK = 5 // overs per story block

export function blockRange(block: number) {
  return { from: block * BLOCK + 1, to: (block + 1) * BLOCK }
}

/** Overs that have been fully bowled in an innings (last over may be in progress). */
export function completedBlocks(balls: SlimBall[], inn: number, inningsComplete: boolean) {
  const bs = balls.filter((b) => b.inn === inn)
  if (!bs.length) return 0
  const lastOver = bs[bs.length - 1].o
  const doneOvers = inningsComplete ? lastOver : lastOver - 1
  return inningsComplete ? Math.ceil(doneOvers / BLOCK) : Math.floor(doneOvers / BLOCK)
}

export function buildStoryContext(header: { title: string; desc: string; venue?: string; toss?: string }, balls: SlimBall[], inn: number, block: number) {
  const { from, to } = blockRange(block)
  const innBalls = balls.filter((b) => b.inn === inn)
  const phase = innBalls.filter((b) => b.o >= from && b.o <= to)
  if (!phase.length) return null
  const team = phase[0].team
  const before = innBalls.filter((b) => b.o < from)
  const start = before.length ? `${before[before.length - 1].runs}/${before[before.length - 1].wkts}` : '0/0'
  const end = phase[phase.length - 1]
  const lines: string[] = []
  for (let o = from; o <= to; o++) {
    const ob = phase.filter((b) => b.o === o)
    if (!ob.length) continue
    const runs = ob[ob.length - 1].runs - (innBalls.filter((b) => b.o < o).slice(-1)[0]?.runs ?? 0)
    const events = ob
      .filter((b) => b.w || b.r >= 4)
      .map((b) => (b.w ? `WICKET ${b.wtext || b.short}` : `${b.r === 6 ? 'SIX' : 'FOUR'} ${b.short.split(',')[0]}`))
    lines.push(`Over ${o} (${ob[0].bowl?.n ?? '?'}): ${runs} runs, score ${ob[ob.length - 1].runs}/${ob[ob.length - 1].wkts}${events.length ? ' — ' + events.join('; ') : ''}`)
  }
  const chase = end.target ? `Chasing ${end.target}${end.limit ? ` in ${end.limit / 6} overs` : ''}.` : ''
  const bat = end.bat ? `At the end: ${end.bat.n} ${end.bat.r} (${end.bat.b}).` : ''
  return [
    `Match: ${header.title} — ${header.desc}${header.venue ? `, at ${header.venue}` : ''}.`,
    header.toss ? `Toss: ${header.toss}.` : '',
    `Innings ${inn}: ${team} batting. ${chase}`,
    `Phase: overs ${from}-${to}. Score went from ${start} to ${end.runs}/${end.wkts}.`,
    bat,
    ...lines,
  ]
    .filter(Boolean)
    .join('\n')
}

export const STORY_SYSTEM =
  'You are a sharp, vivid cricket writer for a premium scores app. Using ONLY the facts provided, write 2-3 sentences (max 70 words) narrating this phase of play. ' +
  'Lead with how the phase changed the match (the run rate, wickets that fell, pressure on the chase), name the batters who scored the boundaries and the bowlers who took wickets, ' +
  'and quote the score at the end of the phase. Be specific; avoid generic phrases like "gained momentum" or "standout players". ' +
  'No invented facts, quotes or statistics; no headings, lists or emojis. Use surnames after first mention. Past tense.'

export function headerFromSummary(summary: Json) {
  const h = summary?.header ?? {}
  const c = h.competitions?.[0] ?? {}
  return {
    title: h.name ?? '',
    desc: c.description ?? h.description ?? '',
    venue: summary?.gameInfo?.venue?.fullName,
    toss: summary?.notes?.find((n: Json) => n.type === 'toss')?.text,
  }
}
