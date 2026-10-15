#!/usr/bin/env node
// Crease offline data pipeline: Cricsheet ball-by-ball JSON -> compact precomputed JSON in public/data/hist/.
// Run with `npm run data:build` (add `--force` to re-download even if the cache is fresh).
// Data: Cricsheet (https://cricsheet.org), licensed ODC-BY 1.0.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import yauzl from 'yauzl'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const CACHE = path.join(__dirname, '.cache')
const OUT = path.join(ROOT, 'public', 'data', 'hist')
const ZIP_URL = 'https://cricsheet.org/downloads/all_json.zip'
const PEOPLE_URL = 'https://cricsheet.org/register/people.csv'
const MAX_AGE_MS = 7 * 24 * 3600 * 1000
const FORCE = process.argv.includes('--force')

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------
const FMT = { T20: 'T20', IT20: 'T20', ODI: 'ODI', ODM: 'ODI', Test: 'Test', MDM: 'Test' }
const STD_OVERS = { T20: 20, ODI: 50 }
// 0-based over index thresholds: idx < a -> pp, idx < b -> mid, else death
const PHASE_CUT = { T20: [6, 15], ODI: [10, 40] }
const PHASES = ['pp', 'mid', 'death']
const BOWLER_KINDS = new Set(['bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket'])
const NOT_OUT_KINDS = new Set(['retired hurt', 'retired not out'])
const OUTCOMES = ['0', '1', '2', '3', '4', '6', 'W', 'wd', 'nb', 'lb']
const WKT_BUCKETS = ['0-2', '3-5', '6-7', '8-9']
const TRAIN_CUTOFF = '2023-01-01' // train < cutoff, test >= cutoff
const PLAYER_SINCE = '2018-01-01'
const MATCHUP_SINCE = 2015
const OUTCOME_SINCE = 2018
const EXPECTED_SINCE = 2016
const N_SHARDS = 128
const RECENT_N = 15
const MIN_PAIR_BALLS = 6
const MAX_SHARD_BYTES = 1_500_000 // soft cap per player shard; lowest-volume matchups are dropped beyond this

// Franchise renames -> current name. Merged in h2h/teams and player "opp" fields.
const TEAM_ALIASES = {
  'Royal Challengers Bangalore': 'Royal Challengers Bengaluru',
  'Kings XI Punjab': 'Punjab Kings',
  'Delhi Daredevils': 'Delhi Capitals',
  'Rising Pune Supergiants': 'Rising Pune Supergiant',
  'Barbados Tridents': 'Barbados Royals',
  'Trinidad & Tobago Red Steel': 'Trinbago Knight Riders',
  'St Lucia Zouks': 'Saint Lucia Kings',
  'St Lucia Kings': 'Saint Lucia Kings',
  'St Lucia Stars': 'Saint Lucia Kings',
  'Hobart Hurricanes Women': 'Hobart Hurricanes Women',
  'Northern Superchargers': 'Northern Superchargers',
  'Welsh Fire': 'Welsh Fire',
}
for (const [k, v] of Object.entries(TEAM_ALIASES)) if (k === v) delete TEAM_ALIASES[k]

// Venue base-key aliases (normalised key -> canonical normalised key). Kept deliberately small.
const VENUE_ALIASES = {
  'sardar patel stadium': 'narendra modi stadium',
  'sardar patel stadium motera': 'narendra modi stadium',
  'feroz shah kotla': 'arun jaitley stadium',
  'feroz shah kotla ground': 'arun jaitley stadium',
  'subrata roy sahara stadium': 'maharashtra cricket association stadium',
  'punjab cricket association stadium': 'punjab cricket association is bindra stadium',
  'punjab cricket association is bindra stadium mohali': 'punjab cricket association is bindra stadium',
  'sheikh zayed stadium': 'zayed cricket stadium',
  'sharjah cricket association stadium': 'sharjah cricket stadium',
  'rajiv gandhi intl cricket stadium': 'rajiv gandhi international stadium',
  'rajiv gandhi international cricket stadium': 'rajiv gandhi international stadium',
  'ma chidambaram stadium chepauk': 'ma chidambaram stadium',
  'ekana cricket stadium': 'bharat ratna shri atal bihari vajpayee ekana cricket stadium',
  'shere bangla national stadium': 'sher e bangla national stadium',
  'sinhalese sports club ground': 'sinhalese sports club',
  'r premadasa international cricket stadium': 'r premadasa stadium',
  'brisbane cricket ground': 'the gabba',
  'brisbane cricket ground woolloongabba': 'the gabba',
  'western australia cricket association ground': 'waca ground',
  'perth stadium': 'optus stadium',
  'kensington oval bridgetown': 'kensington oval',
  'dubai international stadium': 'dubai international cricket stadium',
  'vidarbha cricket association stadium jamtha': 'vidarbha cricket association stadium',
  'himachal pradesh cricket association stadium dharamsala': 'himachal pradesh cricket association stadium',
  'dr y s rajasekhara reddy aca vdca cricket stadium': 'dr ys rajasekhara reddy aca vdca cricket stadium',
  'holkar stadium': 'holkar cricket stadium',
  'barsapara cricket stadium': 'assam cricket association stadium',
  'lalabhai contractor stadium': 'lalbhai contractor stadium',
  'old hararians sports club': 'old hararians',
  'sylhet stadium': 'sylhet international cricket stadium',
  'zohur ahmed chowdhury stadium': 'zahur ahmed chowdhury stadium',
  'chittagong divisional stadium': 'zahur ahmed chowdhury stadium',
  'waca': 'waca ground',
  'ukm ysd cricket oval': 'ysd ukm cricket oval',
  'greenfield stadium': 'greenfield international stadium',
  'westpac stadium': 'sky stadium',
  'cello basin reserve': 'basin reserve',
  'the kent county cricket ground': 'kent county cricket ground',
  'boland bank park': 'boland park',
  'de beers diamond oval': 'diamond oval',
  'simonds stadium': 'gmhba stadium',
  'the cooper associates county ground': 'county ground taunton',
  'gahanga international cricket stadium rwanda': 'gahanga international cricket stadium',
  'kyambogo cricket ground': 'kyambogo cricket oval',
  'university of otago oval': 'university oval dunedin',
  'university of tasmania stadium': 'bellerive oval',
  'new wanderers stadium': 'the wanderers stadium',
  'outsurance oval': 'mangaung oval',
  'chevrolet park': 'mangaung oval',
  'jade stadium': 'ami stadium',
  'reliance cricket stadium': 'reliance stadium',
}
for (const [k, v] of Object.entries(VENUE_ALIASES)) if (k === v) delete VENUE_ALIASES[k]
// Generic ground names shared by different grounds in different cities: keyed as "<base> <cityKey>".
const GENERIC_VENUES = new Set(['county ground', 'national stadium', 'university oval', 'queens park', 'nehru stadium', 'gymkhana club ground', 'recreation ground', 'sports ground', 'city oval', 'cricket ground', 'the oval', 'oval', 'park', 'stadium'])
const CITY_ALIASES = { bangalore: 'bengaluru', bombay: 'mumbai', madras: 'chennai', calcutta: 'kolkata', chittagong: 'chattogram', poona: 'pune', brighton: 'hove', 'port elizabeth': 'gqeberha', vizag: 'visakhapatnam' }

// ---------------------------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------------------------
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a)
const T0 = Date.now()
const r1 = (x) => Math.round(x * 10) / 10
const r2 = (x) => Math.round(x * 100) / 100
const r4 = (x) => Math.round(x * 1e4) / 1e4
const r6 = (x) => Math.round(x * 1e6) / 1e6
const clip = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)
const sigmoid = (z) => 1 / (1 + Math.exp(-z))
const venueDisplay = (v) => String(v || '').split(',')[0].trim()

function normKey(s) {
  let k = String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/['‘’`]/g, '') // drop apostrophes: "Lord's" == "Lords"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  // Join runs of single letters ("m a chidambaram" -> "ma chidambaram", "dr d y patil" -> "dr dy patil")
  k = k.replace(/\b([a-z]) (?=[a-z]\b)/g, '$1')
  return k
}
const venueBaseKey = (venue) => {
  const k = normKey(venueDisplay(venue))
  return VENUE_ALIASES[k] || k
}
const cityKey = (city) => {
  const k = normKey(city)
  return CITY_ALIASES[k] || k
}

function parseOvers(o) {
  // Cricsheet overs like 17 or 17.3 (17 overs 3 balls)
  if (o == null) return null
  const whole = Math.floor(o)
  const balls = Math.round((o - whole) * 10)
  return whole * 6 + balls
}

function teamName(t, gender) {
  let n = TEAM_ALIASES[t] || t
  if (gender === 'female' && !/\bwomen\b/i.test(n)) n = `${n} Women`
  return n
}

function marginText(o) {
  if (!o) return undefined
  const by = o.by || {}
  let s
  if (by.innings) s = `an innings and ${by.runs ?? 0} runs`
  else if (by.runs != null) s = `${by.runs} run${by.runs === 1 ? '' : 's'}`
  else if (by.wickets != null) s = `${by.wickets} wicket${by.wickets === 1 ? '' : 's'}`
  if (o.method) {
    const m = /^d\/?l/i.test(o.method) || /dls/i.test(o.method) ? 'DLS' : o.method
    s = s ? `${s} (${m})` : m
  }
  if (!o.winner && o.result === 'tie' && o.eliminator) s = `tie; ${o.eliminator} won the Super Over`
  return s
}

// Growable Float64 column store (for model training rows)
class Cols {
  constructor(names) {
    this.names = names
    this.n = 0
    this.cap = 1 << 15
    this.c = {}
    for (const k of names) this.c[k] = new Float64Array(this.cap)
  }
  push(vals) {
    if (this.n === this.cap) {
      this.cap *= 2
      for (const k of this.names) {
        const a = new Float64Array(this.cap)
        a.set(this.c[k])
        this.c[k] = a
      }
    }
    for (let i = 0; i < this.names.length; i++) this.c[this.names[i]][this.n] = vals[i]
    this.n++
  }
}

// ---------------------------------------------------------------------------------------------
// Download / cache
// ---------------------------------------------------------------------------------------------
async function fetchCached(url, file) {
  const dest = path.join(CACHE, file)
  try {
    const st = await fsp.stat(dest)
    if (!FORCE && Date.now() - st.mtimeMs < MAX_AGE_MS && st.size > 0) {
      log(`cache hit ${file} (${(st.size / 1e6).toFixed(1)} MB, ${((Date.now() - st.mtimeMs) / 36e5).toFixed(1)}h old)`)
      return dest
    }
  } catch {}
  await fsp.mkdir(CACHE, { recursive: true })
  log(`downloading ${url} ...`)
  const res = await fetch(url, { headers: { 'user-agent': 'crease-data-build (+https://cricsheet.org attribution)' } })
  if (!res.ok || !res.body) throw new Error(`download failed ${url}: ${res.status}`)
  const tmp = dest + '.part'
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp))
  await fsp.rename(tmp, dest)
  const st = await fsp.stat(dest)
  log(`downloaded ${file} (${(st.size / 1e6).toFixed(1)} MB)`)
  return dest
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

async function loadPeople(file) {
  const text = await fsp.readFile(file, 'utf8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  const hdr = parseCsvLine(lines[0])
  const iId = hdr.indexOf('identifier')
  const iName = hdr.indexOf('name')
  const iCi = hdr.indexOf('key_cricinfo')
  const iCi2 = hdr.indexOf('key_cricinfo_2')
  if (iId < 0 || iCi < 0) throw new Error('people.csv: unexpected header')
  const map = new Map() // identifier -> { ci, name }
  let withCi = 0
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i])
    const ci = (f[iCi] || '').trim() || (iCi2 >= 0 ? (f[iCi2] || '').trim() : '')
    if (!/^\d+$/.test(ci)) continue
    map.set(f[iId], { ci, name: f[iName] })
    withCi++
  }
  log(`people.csv: ${lines.length - 1} people, ${withCi} with a Cricinfo key`)
  return map
}

function forEachZipJson(file, fn) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err) return reject(err)
      zip.on('error', reject)
      zip.on('end', resolve)
      zip.on('entry', (entry) => {
        if (!/\.json$/i.test(entry.fileName)) return zip.readEntry()
        zip.openReadStream(entry, (e, rs) => {
          if (e) return reject(e)
          const chunks = []
          rs.on('data', (c) => chunks.push(c))
          rs.on('error', reject)
          rs.on('end', () => {
            fn(entry.fileName, Buffer.concat(chunks))
            zip.readEntry()
          })
        })
      })
      zip.readEntry()
    })
  })
}

// ---------------------------------------------------------------------------------------------
// Accumulators
// ---------------------------------------------------------------------------------------------
const counts = { files: 0, parsed: 0, malformed: 0, skippedType: 0, used: 0, byType: {} }
let latestMatchDate = '0000-00-00'

/** Player accumulators: ci -> record */
const players = new Map()
/** Matchups: numeric key batter*1e7+bowler -> slot index into pairPool (6 ints) */
const pairIndex = new Map()
let pairPool = new Int32Array(6 * (1 << 18))
let pairCount = 0

/** Per-match summaries for venues/h2h/teams */
const matchSummaries = []

/** Model data by model key (T20, ODI, T20_women, ODI_women) */
const models = {}
function modelAcc(key, fmt) {
  if (!models[key]) {
    const N = STD_OVERS[fmt]
    models[key] = {
      fmt,
      chase: new Cols(['target', 'score', 'balls', 'wkts', 'limit', 'y', 'test']),
      chaseMatches: { train: 0, test: 0 },
      first: new Cols(['score', 'balls', 'wkts', 'limit', 'venue', 'y', 'test']),
      firstMatches: { train: 0, test: 0 },
      firstInns: [], // { venue, train, cum[] } for par computation
      outcomes: {}, // phase|bucket -> counts
      outcomeRuns: { wd: [0, 0], nb: [0, 0], lb: [0, 0] },
      expSum: Array.from({ length: N + 1 }, () => new Float64Array(10)),
      expCnt: Array.from({ length: N + 1 }, () => new Float64Array(10)),
      parSum: new Float64Array(N + 1),
      parCnt: 0,
    }
  }
  return models[key]
}
const venueIds = new Map()
const venueIdOf = (k) => {
  let id = venueIds.get(k)
  if (id == null) { id = venueIds.size; venueIds.set(k, id) }
  return id
}

function newFmtStats() {
  return {
    matches: 0,
    bat: { inns: 0, runs: 0, balls: 0, outs: 0, fours: 0, sixes: 0, hs: -1, hsNotOut: false, fifties: 0, hundreds: 0, ducks: 0, ph: { pp: [0, 0, 0], mid: [0, 0, 0], death: [0, 0, 0] } },
    bowl: { inns: 0, balls: 0, runs: 0, wkts: 0, dots: 0, fours: 0, sixes: 0, wides: 0, noballs: 0, bestW: -1, bestR: 0, fourW: 0, fiveW: 0, dis: {}, ph: { pp: [0, 0, 0], mid: [0, 0, 0], death: [0, 0, 0] } },
    field: { catches: 0, stumpings: 0, runOuts: 0 },
  }
}
function playerRec(ci, name) {
  let p = players.get(ci)
  if (!p) {
    p = { name, formats: {}, recent: [], last: '0000-00-00' }
    players.set(ci, p)
  }
  return p
}
function fmtStats(p, key) {
  return p.formats[key] || (p.formats[key] = newFmtStats())
}

function pairAdd(bat, bowl, balls, runs, out, dot, four, six) {
  const key = Number(bat) * 1e7 + Number(bowl)
  let idx = pairIndex.get(key)
  if (idx === undefined) {
    idx = pairCount++
    if (idx * 6 + 6 > pairPool.length) {
      const a = new Int32Array(pairPool.length * 2)
      a.set(pairPool)
      pairPool = a
    }
    pairIndex.set(key, idx)
  }
  const o = idx * 6
  pairPool[o] += balls
  pairPool[o + 1] += runs
  pairPool[o + 2] += out
  pairPool[o + 3] += dot
  pairPool[o + 4] += four
  pairPool[o + 5] += six
}

// ---------------------------------------------------------------------------------------------
// Per-match processing
// ---------------------------------------------------------------------------------------------
function processMatch(id, m, people) {
  const info = m.info
  const mt = info.match_type
  const fmt = FMT[mt]
  counts.byType[mt] = (counts.byType[mt] || 0) + 1
  if (!fmt) { counts.skippedType++; return }
  const date = info.dates?.[0]
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('no date')
  if (!Array.isArray(info.teams) || info.teams.length !== 2) throw new Error('bad teams')
  if (!Array.isArray(m.innings)) throw new Error('no innings')
  const year = +date.slice(0, 4)
  const gender = info.gender === 'female' ? 'female' : 'male'
  const intl = info.team_type === 'international'
  const bpo = info.balls_per_over || 6
  const limited = fmt !== 'Test'
  const std = STD_OVERS[fmt]
  const sixBall = bpo === 6
  const phased = limited && sixBall
  if (date > latestMatchDate) latestMatchDate = date

  const reg = info.registry?.people || {}
  const ciCache = new Map()
  const ciOf = (name) => {
    if (!name) return undefined
    if (ciCache.has(name)) return ciCache.get(name)
    const ident = reg[name]
    const rec = ident ? people.get(ident) : undefined
    const ci = rec ? rec.ci : undefined
    ciCache.set(name, ci)
    if (rec) playerRec(rec.ci, rec.name)
    return ci
  }

  const o = info.outcome || {}
  const result = o.winner ? 'win' : o.result === 'tie' ? 'tie' : o.result === 'draw' ? 'draw' : 'nr'
  const winner = o.winner
  const awarded = o.method === 'Awarded' || o.method === 'awarded'
  const margin = marginText(o)
  const event = info.event?.name
  const venueName = venueDisplay(info.venue)
  const [tA, tB] = info.teams
  const oppOf = (t) => (t === tA ? tB : tA)

  // Buckets for player stats
  const statKeys = [fmt]
  if (intl) statKeys.push(fmt === 'T20' ? 'T20I' : fmt === 'ODI' ? 'ODI_intl' : 'Test_intl')

  // Match appearance
  const mp = new Map() // ci -> per-match player summary
  const mpOf = (ci, team) => {
    let x = mp.get(ci)
    if (!x) { x = { team, batted: false, r: 0, b: 0, out: false, inns: 0, bowled: false, w: 0, rc: 0, bb: 0 }; mp.set(ci, x) }
    return x
  }
  const squads = info.players || {}
  for (const team of Object.keys(squads)) {
    for (const name of squads[team] || []) {
      const ci = ciOf(name)
      if (ci) mpOf(ci, team)
    }
  }

  const innings = m.innings.filter((i) => !i.super_over)
  const innSummaries = []
  const modelKey = limited && sixBall ? fmt + (gender === 'female' ? '_women' : '') : null
  const mAcc = modelKey ? modelAcc(modelKey, fmt) : null

  const venueKind = {}
  let fullFirst = false
  let firstCum = null
  let firstStatesAll = []
  let overStatesAll = []
  const reduced = limited && ((info.overs || std) !== std || (innings[1]?.target?.overs != null && parseOvers(innings[1].target.overs) !== std * 6))

  for (let ii = 0; ii < innings.length; ii++) {
    const inn = innings[ii]
    const team = inn.team
    const bowlTeam = oppOf(team)
    const batInn = new Map() // ci -> {r,b,f4,f6,out}
    const bowlInn = new Map() // ci -> {balls,runs,wkts,...}
    let score = 0
    let wkts = 0
    let legal = 0
    let ppRuns = 0
    let deathRuns = 0
    let deathBalls = 0
    const cum = limited ? new Array(std + 1).fill(null) : null
    if (cum) cum[0] = 0

    // Chase setup
    let chase = null
    if (mAcc && ii === 1 && innings.length >= 2 && result !== 'nr' && !awarded) {
      const tgt = inn.target
      const firstTotal = innSummaries[0]?.runs
      if (tgt?.runs || (!o.method && firstTotal != null)) {
        const target = tgt?.runs ?? firstTotal + 1
        const limit = tgt?.overs != null ? parseOvers(tgt.overs) : (info.overs || std) * 6
        if (target > 0 && limit > 0 && limit <= std * 6) {
          const y = winner === team ? 1 : winner ? 0 : 0.5
          const test = date >= TRAIN_CUTOFF ? 1 : 0
          chase = { target, limit, y, test }
          mAcc.chaseMatches[test ? 'test' : 'train']++
        }
      }
    }
    let lastPushed = ''
    const pushChase = () => {
      if (!chase) return
      mAcc.chase.push([chase.target, score, legal, Math.min(wkts, 10), chase.limit, chase.y, chase.test])
      lastPushed = score + '/' + wkts + '/' + legal
    }
    pushChase()

    // First-innings model setup (decided after the innings because we need to know whether it was full-length)
    const firstStates = mAcc && ii === 0 ? [[0, 0, 0]] : null
    // Expected-runs states at over boundaries
    const overStates = mAcc && ii === 0 ? [[0, 0, 0]] : null // [legal, score, wkts]

    for (const ov of inn.overs || []) {
      const overIdx = ov.over
      const phase = phased && overIdx < std ? (overIdx < PHASE_CUT[fmt][0] ? 'pp' : overIdx < PHASE_CUT[fmt][1] ? 'mid' : 'death') : null
      for (const d of ov.deliveries || []) {
        const batName = d.batter ?? d.batsman
        const bowlName = d.bowler
        const runsB = d.runs?.batter ?? 0
        const total = d.runs?.total ?? 0
        const ex = d.extras || {}
        const wide = (ex.wides || 0) > 0
        const nb = (ex.noballs || 0) > 0
        const byes = (ex.byes || 0) + (ex.legbyes || 0)
        const isLegal = !wide && !nb
        const bowlerRuns = total - byes - (ex.penalty || 0)
        const nonBoundary = d.runs?.non_boundary
        const four = runsB === 4 && !nonBoundary ? 1 : 0
        const six = runsB === 6 && !nonBoundary ? 1 : 0
        const wicketsBefore = wkts

        const bci = ciOf(batName)
        const wci = ciOf(bowlName)
        const nsci = ciOf(d.non_striker)

        // Outcome tables (before applying the ball)
        if (mAcc && year >= OUTCOME_SINCE && phase && wicketsBefore < 10) {
          const bucket = wicketsBefore <= 2 ? '0-2' : wicketsBefore <= 5 ? '3-5' : wicketsBefore <= 7 ? '6-7' : '8-9'
          const k = phase + '|' + bucket
          const tbl = mAcc.outcomes[k] || (mAcc.outcomes[k] = Object.fromEntries(OUTCOMES.map((x) => [x, 0])))
          let oc
          if (d.wickets?.some((w) => !NOT_OUT_KINDS.has(w.kind))) oc = 'W'
          else if (wide) oc = 'wd'
          else if (nb) oc = 'nb'
          else if (byes > 0) oc = 'lb'
          else oc = runsB >= 6 ? '6' : runsB === 5 ? '4' : String(runsB)
          tbl[oc]++
          if (oc === 'wd' || oc === 'nb' || oc === 'lb') {
            mAcc.outcomeRuns[oc][0] += total
            mAcc.outcomeRuns[oc][1]++
          }
        }

        // Batting
        if (bci) {
          const b = batInn.get(bci) || { r: 0, b: 0, f4: 0, f6: 0, out: false }
          batInn.set(bci, b)
          b.r += runsB
          if (!wide) b.b++
          b.f4 += four
          b.f6 += six
          if (phase) {
            for (const k of statKeys) {
              const ph = fmtStats(players.get(bci), k).bat.ph[phase]
              ph[0] += runsB
              if (!wide) ph[1]++
            }
          }
        }
        if (nsci && !batInn.has(nsci)) batInn.set(nsci, { r: 0, b: 0, f4: 0, f6: 0, out: false })

        // Bowling
        let credited = 0
        if (wci) {
          const w = bowlInn.get(wci) || { balls: 0, runs: 0, wkts: 0, dots: 0, f4: 0, f6: 0, wd: 0, nb: 0, any: 0 }
          bowlInn.set(wci, w)
          w.any++
          if (isLegal) w.balls++
          w.runs += bowlerRuns
          if (isLegal && bowlerRuns === 0) w.dots++
          w.f4 += four
          w.f6 += six
          if (wide) w.wd++
          if (nb) w.nb++
          if (phase) {
            for (const k of statKeys) {
              const ph = fmtStats(players.get(wci), k).bowl.ph[phase]
              if (isLegal) ph[0]++
              ph[1] += bowlerRuns
            }
          }
        }

        // Wickets
        for (const wk of d.wickets || []) {
          const outName = wk.player_out
          const kind = wk.kind
          const isOut = !NOT_OUT_KINDS.has(kind)
          if (isOut) wkts++
          if (limited) venueKind[kind] = (venueKind[kind] || 0) + 1
          const oci = ciOf(outName)
          if (oci && isOut) {
            const b = batInn.get(oci) || { r: 0, b: 0, f4: 0, f6: 0, out: false }
            batInn.set(oci, b)
            b.out = true
            if (phase) for (const k of statKeys) fmtStats(players.get(oci), k).bat.ph[phase][2]++
          }
          if (!limited) venueKind[kind] = (venueKind[kind] || 0) + 1
          if (BOWLER_KINDS.has(kind) && wci) {
            const w = bowlInn.get(wci)
            w.wkts++
            for (const k of statKeys) {
              const bs = fmtStats(players.get(wci), k).bowl
              bs.dis[kind] = (bs.dis[kind] || 0) + 1
              if (phase) bs.ph[phase][2]++
            }
            if (outName === batName) credited = 1
          }
          // Fielding
          if (kind === 'caught and bowled' && wci) for (const k of statKeys) fmtStats(players.get(wci), k).field.catches++
          for (const f of wk.fielders || []) {
            if (f.substitute) continue
            const fci = ciOf(f.name)
            if (!fci) continue
            for (const k of statKeys) {
              const fs = fmtStats(players.get(fci), k).field
              if (kind === 'caught') fs.catches++
              else if (kind === 'stumped') fs.stumpings++
              else if (kind === 'run out') fs.runOuts++
            }
          }
        }

        // Matchups
        if (bci && wci && year >= MATCHUP_SINCE && !wide) {
          pairAdd(bci, wci, 1, runsB, credited, runsB === 0 ? 1 : 0, four, six)
        } else if (bci && wci && year >= MATCHUP_SINCE && wide && credited) {
          pairAdd(bci, wci, 0, 0, credited, 0, 0, 0) // stumped off a wide
        }

        score += total
        if (isLegal) legal++
        if (phase === 'pp') ppRuns += total
        if (phase === 'death') { deathRuns += total; deathBalls++ }
        if (cum && isLegal && legal % 6 === 0 && legal / 6 <= std && sixBall) cum[legal / 6] = score
        if (isLegal) {
          if (chase) pushChase()
          if (firstStates) firstStates.push([legal, score, Math.min(wkts, 10)])
          if (overStates && legal % 6 === 0 && wkts < 10) overStates.push([legal, score, wkts])
        }
      }
    }
    // final state if the innings ended on an extra (e.g. winning wide)
    if (chase && lastPushed !== score + '/' + wkts + '/' + legal) pushChase()
    if (firstStates) firstStatesAll = firstStates
    if (overStates) overStatesAll = overStates

    const allOut = wkts >= 10
    const limit = limited ? (ii === 1 && inn.target?.overs != null ? parseOvers(inn.target.overs) : (info.overs || std) * (sixBall ? 6 : bpo)) : null
    const complete = limited ? allOut || legal >= limit : true
    innSummaries.push({ team, runs: score, wkts, legal, allOut, complete, declared: !!inn.declared, ppRuns, deathRuns, deathBalls })

    // Player innings fold
    for (const [ci, b] of batInn) {
      const p = players.get(ci)
      for (const k of statKeys) {
        const s = fmtStats(p, k).bat
        s.inns++
        s.runs += b.r
        s.balls += b.b
        s.fours += b.f4
        s.sixes += b.f6
        if (b.out) s.outs++
        if (b.r > s.hs || (b.r === s.hs && !b.out)) { s.hs = b.r; s.hsNotOut = !b.out }
        if (b.r >= 100) s.hundreds++
        else if (b.r >= 50) s.fifties++
        if (b.r === 0 && b.out) s.ducks++
      }
      const x = mpOf(ci, team)
      x.batted = true
      x.r += b.r
      x.b += b.b
      x.out = b.out
      x.inns++
    }
    for (const [ci, w] of bowlInn) {
      const p = players.get(ci)
      for (const k of statKeys) {
        const s = fmtStats(p, k).bowl
        s.inns++
        s.balls += w.balls
        s.runs += w.runs
        s.wkts += w.wkts
        s.dots += w.dots
        s.fours += w.f4
        s.sixes += w.f6
        s.wides += w.wd
        s.noballs += w.nb
        if (w.wkts > s.bestW || (w.wkts === s.bestW && w.runs < s.bestR)) { s.bestW = w.wkts; s.bestR = w.runs }
        if (w.wkts === 4) s.fourW++
        else if (w.wkts >= 5) s.fiveW++
      }
      const x = mpOf(ci, bowlTeam)
      x.bowled = true
      x.w += w.wkts
      x.rc += w.runs
      x.bb += w.balls
    }

    // Full-length first innings (limited overs, 6-ball overs, scheduled & unreduced)
    if (ii === 0 && limited && sixBall) {
      const tgtOv = innings[1]?.target?.overs
      const unreduced = (info.overs || std) === std && (tgtOv == null || parseOvers(tgtOv) === std * 6)
      if (unreduced && !reduced && (wkts >= 10 || legal >= std * 6)) {
        fullFirst = true
        for (let k = 1; k <= std; k++) if (cum[k] == null) cum[k] = cum[k - 1] ?? score
        // all-out innings: carry the final score forward
        for (let k = 1; k <= std; k++) if (k * 6 > legal) cum[k] = score
        firstCum = cum
      }
    }
  }

  // ----- Model: first innings rows, expected-runs, par -----
  if (mAcc && fullFirst) {
    const vKey = venueBaseKey(info.venue)
    const train = date < TRAIN_CUTOFF
    mAcc.firstInns.push({ venue: vKey, train, cum: firstCum })
    const inn1 = innSummaries[0]
    if (result !== 'nr' && !awarded && innings.length >= 2) {
      const y = winner === inn1.team ? 1 : winner ? 0 : 0.5
      const test = train ? 0 : 1
      const vid = venueIdOf(vKey)
      // firstStates were collected in the loop above for innings 0
      for (const [b, s, w] of firstStatesAll) mAcc.first.push([s, b, w, STD_OVERS[fmt] * 6, vid, y, test])
      mAcc.firstMatches[test ? 'test' : 'train']++
    }
    if (year >= EXPECTED_SINCE) {
      const final = inn1.runs
      const L = STD_OVERS[fmt] * 6
      for (const [b, s, w] of overStatesAll) {
        const k = (L - b) / 6
        mAcc.expSum[k][w] += final - s
        mAcc.expCnt[k][w]++
      }
      for (let k = 0; k <= STD_OVERS[fmt]; k++) mAcc.parSum[k] += firstCum[k]
      mAcc.parCnt++
    }
  }

  // ----- Recent entries -----
  const sortKey = date + '#' + String(id).padStart(9, '0')
  for (const [ci, x] of mp) {
    const p = players.get(ci)
    for (const k of statKeys) fmtStats(p, k).matches++
    if (date > p.last) p.last = date
    if (!x.batted && !x.bowled) continue
    const e = { _k: sortKey, d: date, f: fmt }
    if (event) e.ev = event
    e.opp = teamName(oppOf(x.team), gender)
    e.v = venueName
    if (x.batted) { e.r = x.r; e.b = x.b; e.out = x.out; if (x.inns > 1) e.inns = x.inns }
    if (x.bowled) { e.w = x.w; e.rc = x.rc; e.bb = x.bb }
    p.recent.push(e)
    if (p.recent.length > 4 * RECENT_N) {
      p.recent.sort((a, b) => (a._k < b._k ? 1 : -1))
      p.recent.length = RECENT_N
    }
  }

  // ----- Match summary (venues, h2h, teams) -----
  matchSummaries.push({
    id: String(id),
    k: sortKey,
    date,
    year,
    fmt,
    mt,
    gender,
    intl,
    sixBall,
    teams: [tA, tB],
    winner,
    result,
    awarded,
    method: o.method,
    margin,
    event,
    venue: info.venue,
    venueName,
    city: info.city,
    toss: info.toss ? { w: info.toss.winner, d: info.toss.decision } : null,
    overs: info.overs,
    reduced,
    inns: innSummaries,
    fullFirst,
    firstCum: fullFirst ? firstCum : null,
    kinds: venueKind,
  })
}

// ---------------------------------------------------------------------------------------------
// Logistic regression (IRLS / Newton with small ridge), standardised features
// ---------------------------------------------------------------------------------------------
function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    ;[M[c], M[piv]] = [M[piv], M[c]]
    const d = M[c][c] || 1e-12
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / d
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12))
}

function fitLogistic(X, y, trainIdx, p, lambda = 1e-3) {
  // X: array of Float64Array columns (raw), y: Float64Array, trainIdx: Int32Array
  const n = trainIdx.length
  const mean = new Array(p).fill(0)
  const std = new Array(p).fill(0)
  for (let j = 0; j < p; j++) {
    let s = 0
    for (let t = 0; t < n; t++) s += X[j][trainIdx[t]]
    mean[j] = s / n
    let v = 0
    for (let t = 0; t < n; t++) { const d = X[j][trainIdx[t]] - mean[j]; v += d * d }
    std[j] = Math.sqrt(v / n) || 1
  }
  const P = p + 1 // + intercept (last)
  let w = new Array(P).fill(0)
  const z = new Float64Array(P)
  for (let iter = 0; iter < 30; iter++) {
    const H = Array.from({ length: P }, () => new Float64Array(P))
    const g = new Float64Array(P)
    for (let t = 0; t < n; t++) {
      const i = trainIdx[t]
      let eta = w[p]
      for (let j = 0; j < p; j++) { z[j] = (X[j][i] - mean[j]) / std[j]; eta += w[j] * z[j] }
      z[p] = 1
      const pr = sigmoid(eta)
      const r = pr - y[i]
      const wt = Math.max(pr * (1 - pr), 1e-9)
      for (let a = 0; a < P; a++) {
        g[a] += r * z[a]
        const za = wt * z[a]
        for (let b = a; b < P; b++) H[a][b] += za * z[b]
      }
    }
    for (let a = 0; a < P; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a]
    for (let a = 0; a < p; a++) { H[a][a] += lambda * n; g[a] += lambda * n * w[a] }
    const step = solve(H.map((r) => Array.from(r)), Array.from(g))
    let maxStep = 0
    w = w.map((v, a) => { maxStep = Math.max(maxStep, Math.abs(step[a])); return v - step[a] })
    if (maxStep < 1e-7) break
  }
  return { mean, std, coef: w.slice(0, p), intercept: w[p] }
}

function evalLogistic(model, X, y, idx) {
  const p = model.coef.length
  let ll = 0
  let brier = 0
  let n = 0
  for (const i of idx) {
    let eta = model.intercept
    for (let j = 0; j < p; j++) eta += model.coef[j] * ((X[j][i] - model.mean[j]) / model.std[j])
    const pr = clip(sigmoid(eta), 1e-12, 1 - 1e-12)
    const yy = y[i]
    ll += -(yy * Math.log(pr) + (1 - yy) * Math.log(1 - pr))
    brier += (pr - yy) ** 2
    n++
  }
  return { n, logLoss: r4(ll / n), brier: r4(brier / n) }
}
function baselineEval(y, trainIdx, testIdx) {
  let s = 0
  for (const i of trainIdx) s += y[i]
  const pr = s / trainIdx.length
  let ll = 0
  let br = 0
  for (const i of testIdx) { ll += -(y[i] * Math.log(pr) + (1 - y[i]) * Math.log(1 - pr)); br += (pr - y[i]) ** 2 }
  return { logLoss: r4(ll / testIdx.length), brier: r4(br / testIdx.length) }
}

// ---- Feature definitions (mirrored on the client; keep in sync with README + hist-types.ts) ----
export const CHASE_FEATURES = ['rrr', 'crr', 'wkts_in_hand', 'balls_left_frac', 'runs_needed_frac', 'rrr_x_balls_left_frac', 'wkts_in_hand_x_balls_left_frac', 'log_runs_needed_per_wkt']
export function chaseFeatures(target, score, balls, wkts, limit) {
  const runsNeeded = Math.max(target - score, 0)
  const ballsLeft = Math.max(limit - balls, 0)
  const wih = Math.max(10 - wkts, 0)
  const rrr = ballsLeft > 0 ? clip((runsNeeded * 6) / ballsLeft, 0, 36) : runsNeeded > 0 ? 36 : 0
  const crr = balls > 0 ? clip((score * 6) / balls, 0, 36) : 0
  const blf = clip(ballsLeft / limit, 0, 1)
  const rnf = clip(runsNeeded / target, 0, 1)
  const lrw = Math.log1p(runsNeeded / Math.max(wih, 0.5))
  return [rrr, crr, wih, blf, rnf, rrr * blf, wih * blf, lrw]
}
export const FIRST_FEATURES = ['runs', 'wkts_lost', 'balls_left_frac', 'crr', 'venue_par_diff', 'wkts_lost_x_balls_left_frac']
export function parAt(par, balls) {
  const ov = balls / 6
  const lo = Math.min(Math.floor(ov), par.length - 1)
  const hi = Math.min(lo + 1, par.length - 1)
  return par[lo] + (par[hi] - par[lo]) * (ov - lo)
}
export function firstFeatures(score, balls, wkts, limit, par) {
  const blf = clip((limit - balls) / limit, 0, 1)
  const crr = balls > 0 ? clip((score * 6) / balls, 0, 36) : 0
  return [score, wkts, blf, crr, score - parAt(par, balls), wkts * blf]
}

function trainModel(key, acc) {
  const fmt = acc.fmt
  const N = STD_OVERS[fmt]
  const out = { format: fmt, gender: key.endsWith('_women') ? 'female' : 'male' }

  // ---- par (global, 2016+) ----
  const par = Array.from(acc.parSum, (s) => r1(s / Math.max(acc.parCnt, 1)))
  out.par = par

  // ---- chase ----
  {
    const C = acc.chase
    const n = C.n
    const p = CHASE_FEATURES.length
    const X = Array.from({ length: p }, () => new Float64Array(n))
    for (let i = 0; i < n; i++) {
      const f = chaseFeatures(C.c.target[i], C.c.score[i], C.c.balls[i], C.c.wkts[i], C.c.limit[i])
      for (let j = 0; j < p; j++) X[j][i] = f[j]
    }
    const tr = []
    const te = []
    for (let i = 0; i < n; i++) (C.c.test[i] ? te : tr).push(i)
    const trainIdx = Int32Array.from(tr)
    const model = fitLogistic(X, C.c.y, trainIdx, p)
    out.chase = {
      features: CHASE_FEATURES,
      mean: model.mean.map(r6),
      std: model.std.map(r6),
      coef: model.coef.map(r6),
      intercept: r6(model.intercept),
      eval: {
        trainRows: tr.length,
        testRows: te.length,
        trainMatches: acc.chaseMatches.train,
        testMatches: acc.chaseMatches.test,
        split: `train < ${TRAIN_CUTOFF}, test >= ${TRAIN_CUTOFF}`,
        train: evalLogistic(model, X, C.c.y, tr),
        test: te.length ? evalLogistic(model, X, C.c.y, te) : null,
        baselineTest: te.length ? baselineEval(C.c.y, tr, te) : null,
      },
    }
    // Refit on all data for the shipped coefficients? Keep the train-split model so eval matches what ships.
  }

  // ---- first innings ----
  {
    // Venue par from training years only
    const L = N * 6
    const gSum = new Float64Array(N + 1)
    let gCnt = 0
    const vs = new Map()
    for (const fi of acc.firstInns) {
      if (!fi.train) continue
      for (let k = 0; k <= N; k++) gSum[k] += fi.cum[k]
      gCnt++
      let v = vs.get(fi.venue)
      if (!v) { v = { s: new Float64Array(N + 1), n: 0 }; vs.set(fi.venue, v) }
      for (let k = 0; k <= N; k++) v.s[k] += fi.cum[k]
      v.n++
    }
    const gPar = Array.from(gSum, (s) => s / Math.max(gCnt, 1))
    const parByVid = new Map()
    for (const [vk, vid] of venueIds) {
      const v = vs.get(vk)
      parByVid.set(vid, v && v.n >= 5 ? Array.from(v.s, (s) => s / v.n) : gPar)
    }
    const F = acc.first
    const n = F.n
    const p = FIRST_FEATURES.length
    const X = Array.from({ length: p }, () => new Float64Array(n))
    for (let i = 0; i < n; i++) {
      const f = firstFeatures(F.c.score[i], F.c.balls[i], F.c.wkts[i], L, parByVid.get(F.c.venue[i]) || gPar)
      for (let j = 0; j < p; j++) X[j][i] = f[j]
    }
    const tr = []
    const te = []
    for (let i = 0; i < n; i++) (F.c.test[i] ? te : tr).push(i)
    const model = fitLogistic(X, F.c.y, Int32Array.from(tr), p)
    out.first = {
      features: FIRST_FEATURES,
      mean: model.mean.map(r6),
      std: model.std.map(r6),
      coef: model.coef.map(r6),
      intercept: r6(model.intercept),
      parGlobal: gPar.map(r1),
      venueParMinMatches: 5,
      eval: {
        trainRows: tr.length,
        testRows: te.length,
        trainMatches: acc.firstMatches.train,
        testMatches: acc.firstMatches.test,
        split: `train < ${TRAIN_CUTOFF}, test >= ${TRAIN_CUTOFF}`,
        train: evalLogistic(model, X, F.c.y, tr),
        test: te.length ? evalLogistic(model, X, F.c.y, te) : null,
        baselineTest: te.length ? baselineEval(F.c.y, tr, te) : null,
      },
    }
  }

  // ---- outcomes ----
  {
    const tables = {}
    for (const ph of PHASES) {
      tables[ph] = {}
      for (const b of WKT_BUCKETS) {
        const t = acc.outcomes[ph + '|' + b]
        if (!t) continue
        const tot = OUTCOMES.reduce((s, k) => s + t[k], 0)
        if (!tot) continue
        tables[ph][b] = Object.fromEntries(OUTCOMES.map((k) => [k, r6(t[k] / tot)]))
        tables[ph][b].n = tot
      }
    }
    out.outcomes = {
      since: OUTCOME_SINCE,
      phases: fmt === 'T20' ? { pp: [1, 6], mid: [7, 15], death: [16, 20] } : { pp: [1, 10], mid: [11, 40], death: [41, 50] },
      tables,
      extraRuns: Object.fromEntries(Object.entries(acc.outcomeRuns).map(([k, [s, c]]) => [k, r4(c ? s / c : 1)])),
    }
  }

  // ---- expected remaining runs ----
  out.expected = buildExpected(acc, N)
  return out
}

function buildExpected(acc, N) {
  // rows: k = ballsLeft/6 (0..N), cols: wktsLost 0..9
  const K = N + 1
  const raw = Array.from({ length: K }, (_, k) => Array.from({ length: 10 }, (_, w) => (acc.expCnt[k][w] ? acc.expSum[k][w] / acc.expCnt[k][w] : null)))
  const cnt = Array.from({ length: K }, (_, k) => Array.from(acc.expCnt[k]))
  // Parametric prior per wicket column (DLS-like): E = A_w * (1 - exp(-b * u / A_w)), u = balls left
  const prior = Array.from({ length: K }, () => new Array(10).fill(0))
  for (let w = 0; w < 10; w++) {
    let best = null
    for (let A = 5; A <= (N === 20 ? 260 : 450); A += 1) {
      for (let b = 0.4; b <= 3.0; b += 0.02) {
        let sse = 0
        let tot = 0
        for (let k = 1; k < K; k++) {
          const c = cnt[k][w]
          if (!c) continue
          const e = A * (1 - Math.exp((-b * k * 6) / A))
          sse += c * (e - raw[k][w]) ** 2
          tot += c
        }
        if (tot && (!best || sse < best.sse)) best = { A, b, sse }
      }
    }
    for (let k = 0; k < K; k++) prior[k][w] = best ? best.A * (1 - Math.exp((-best.b * k * 6) / best.A)) : 0
  }
  // Blend raw with prior (shrinkage, strength 40 obs)
  const S = 40
  const E = Array.from({ length: K }, (_, k) => Array.from({ length: 10 }, (_, w) => {
    if (k === 0) return 0
    const c = cnt[k][w]
    return c ? (c * raw[k][w] + S * prior[k][w]) / (c + S) : prior[k][w]
  }))
  // Enforce monotonicity: non-decreasing in ballsLeft, non-increasing in wkts lost (iterate)
  for (let it = 0; it < 20; it++) {
    let changed = false
    for (let k = 1; k < K; k++) for (let w = 0; w < 10; w++) {
      if (E[k][w] < E[k - 1][w]) { E[k][w] = E[k - 1][w]; changed = true }
    }
    for (let k = 1; k < K; k++) for (let w = 1; w < 10; w++) {
      if (E[k][w] > E[k][w - 1]) { const m = (E[k][w] + E[k][w - 1]) / 2; E[k][w] = m; E[k][w - 1] = m; changed = true }
    }
    if (!changed) break
  }
  return {
    ballsStep: 6,
    rows: 'index i = ballsLeft / 6 (0..' + N + ')',
    cols: 'index j = wickets lost (0..9)',
    table: E.map((row) => row.map(r1)),
    n: cnt.map((row) => row.map((c) => c | 0)),
  }
}

// ---------------------------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------------------------
function buildVenues() {
  // 1) Decide which base keys are ambiguous across cities (e.g. "County Ground")
  const baseCities = new Map()
  for (const s of matchSummaries) {
    const bk = venueBaseKey(s.venue)
    const ck = s.city ? cityKey(s.city) : ''
    let m = baseCities.get(bk)
    if (!m) { m = new Map(); baseCities.set(bk, m) }
    m.set(ck, (m.get(ck) || 0) + 1)
  }
  const ambiguous = new Set()
  for (const [bk, m] of baseCities) {
    const real = [...m.entries()].filter(([c]) => c)
    if (GENERIC_VENUES.has(bk) && real.length >= 2) ambiguous.add(bk)
  }
  const keyOf = (s) => {
    const bk = venueBaseKey(s.venue)
    if (ambiguous.has(bk) && s.city) return bk + ' ' + cityKey(s.city)
    return bk
  }
  const aliases = {}
  for (const s of matchSummaries) {
    const raw = normKey(venueDisplay(s.venue))
    const canon = venueBaseKey(s.venue)
    if (raw !== canon && !ambiguous.has(canon)) aliases[raw] = canon
  }

  const groups = new Map()
  for (const s of matchSummaries) {
    const key = keyOf(s)
    let g = groups.get(key)
    if (!g) { g = { names: new Map(), cities: new Map(), byFmt: {} }; groups.set(key, g) }
    if (!g.names.has(s.venueName) || g.names.get(s.venueName) < s.date) g.names.set(s.venueName, s.date)
    if (s.city) g.cities.set(s.city, (g.cities.get(s.city) || 0) + 1)
    const fk = s.fmt + (s.gender === 'female' ? 'W' : '')
    ;(g.byFmt[fk] || (g.byFmt[fk] = [])).push(s)
  }

  const venues = {}
  for (const key of [...groups.keys()].sort()) {
    const g = groups.get(key)
    const formats = {}
    for (const fk of ['T20', 'ODI', 'Test', 'T20W', 'ODIW', 'TestW']) {
      const list = g.byFmt[fk]
      if (!list || list.length < 3) continue
      formats[fk] = venueFormatBlock(fk.replace(/W$/, ''), list)
    }
    if (!Object.keys(formats).length) continue
    const name = [...g.names.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0] < b[0] ? -1 : 1))[0][0]
    const city = [...g.cities.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0]
    const v = { name }
    if (city) v.city = city
    v.formats = formats
    venues[key] = v
  }
  const venueAliases = {}
  const allAliases = { ...VENUE_ALIASES, ...aliases }
  for (const k of Object.keys(allAliases).sort()) if (venues[allAliases[k]]) venueAliases[k] = allAliases[k]
  return { venues, venueAliases, ambiguousBaseKeys: [...ambiguous].sort(), cityAliases: CITY_ALIASES }
}

function venueFormatBlock(fmt, list) {
  list.sort((a, b) => (a.k < b.k ? -1 : 1))
  const limited = fmt !== 'Test'
  const N = STD_OVERS[fmt]
  const blk = { matches: list.length }
  let s1 = 0, n1 = 0, s2 = 0, n2 = 0
  let decided = 0, chaseWins = 0, batFirstWins = 0, draws = 0, tossKnown = 0, tossWinWins = 0, tossDecided = 0, tossBat = 0
  let highest = null
  let lowest = null
  const parSum = limited ? new Float64Array(N + 1) : null
  let parN = 0
  let ppS = 0, ppN = 0, dS = 0, dN = 0
  const kinds = {}
  for (const s of list) {
    const reduced = s.reduced
    const i1 = s.inns[0]
    const i2 = s.inns[1]
    if (limited) {
      if (i1 && i1.complete && !reduced && s.sixBall) { s1 += i1.runs; n1++ }
      if (i2 && s.result !== 'nr' && !reduced && s.sixBall) { s2 += i2.runs; n2++ }
    } else {
      if (i1) { s1 += i1.runs; n1++ }
      if (i2) { s2 += i2.runs; n2++ }
    }
    const batFirst = i1?.team
    if (s.result === 'win' && !s.awarded) {
      decided++
      if (s.winner === batFirst) batFirstWins++
      else chaseWins++
    }
    if (s.result === 'draw') draws++
    if (s.toss?.w) {
      tossKnown++
      if (s.toss.d === 'bat') tossBat++
      if (s.result === 'win') { tossDecided++; if (s.toss.w === s.winner) tossWinWins++ }
    }
    for (let i = 0; i < s.inns.length; i++) {
      const x = s.inns[i]
      const team = teamName(x.team, s.gender)
      if (!highest || x.runs > highest.score) highest = { score: x.runs, wkts: x.wkts, team, date: s.date }
      const isWinningChase = limited && i === s.inns.length - 1 && s.winner === x.team
      const lowOk = (x.allOut || (limited && x.complete && !reduced)) && !isWinningChase && !x.declared
      if (lowOk && (!lowest || x.runs < lowest.score)) lowest = { score: x.runs, wkts: x.wkts, team, date: s.date }
      if (limited && s.sixBall && !reduced && i < 2) {
        ppS += x.ppRuns; ppN++
        if (x.deathBalls > 0) { dS += x.deathRuns; dN++ }
      }
    }
    if (limited && s.fullFirst) { for (let k = 0; k <= N; k++) parSum[k] += s.firstCum[k]; parN++ }
    for (const [k, c] of Object.entries(s.kinds)) kinds[k] = (kinds[k] || 0) + c
  }
  if (n1) blk.avg1st = r1(s1 / n1)
  if (n2) blk.avg2nd = r1(s2 / n2)
  const denom = limited ? decided : list.filter((s) => s.result !== 'nr').length
  if (denom) {
    blk.chaseWinPct = r1((100 * chaseWins) / denom)
    blk.batFirstWinPct = r1((100 * batFirstWins) / denom)
  }
  if (tossDecided) blk.tossWinMatchWinPct = r1((100 * tossWinWins) / tossDecided)
  if (tossKnown) blk.tossBatFirstPct = r1((100 * tossBat) / tossKnown)
  if (highest) blk.highest = highest
  if (lowest) blk.lowest = lowest
  if (limited && parN) { blk.parByOver = Array.from(parSum, (x) => r1(x / parN)); blk.parN = parN }
  if (ppN) blk.avgPowerplay = r1(ppS / ppN)
  if (dN) blk.avgDeath = r1(dS / dN)
  blk.wicketsByKind = Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
  if (!limited) blk.drawPct = r1((100 * draws) / Math.max(1, list.filter((s) => s.result !== 'nr').length))
  blk.recent = list.slice(-5).reverse().map((s) => {
    const e = { date: s.date, teams: s.teams.map((t) => teamName(t, s.gender)), result: s.result, winner: s.winner ? teamName(s.winner, s.gender) : null }
    if (s.margin) e.margin = s.margin
    return e
  })
  return blk
}

// ---------------------------------------------------------------------------------------------
// H2H & teams
// ---------------------------------------------------------------------------------------------
function buildH2HAndTeams() {
  const sorted = [...matchSummaries].sort((a, b) => (a.k < b.k ? -1 : 1))
  const pairs = {}
  const teams = new Map()
  const cutoff = String(+latestMatchDate.slice(0, 4) - 3) + latestMatchDate.slice(4)
  for (const s of sorted) {
    const [a, b] = s.teams.map((t) => teamName(t, s.gender))
    if (a === b) continue
    const [A, B] = [a, b].sort()
    const key = A + '|' + B
    const pr = pairs[key] || (pairs[key] = {})
    const f = pr[s.fmt] || (pr[s.fmt] = { matches: 0, wins: { [A]: 0, [B]: 0 }, ties: 0, noResult: 0, draws: 0, last: [] })
    f.matches++
    const w = s.winner ? teamName(s.winner, s.gender) : null
    if (s.result === 'win' && w in f.wins) f.wins[w]++
    else if (s.result === 'tie') f.ties++
    else if (s.result === 'draw') f.draws++
    else if (s.result === 'nr') f.noResult++
    const e = { d: s.date, winner: w }
    if (s.result !== 'win') e.result = s.result
    if (s.margin) e.margin = s.margin
    e.venue = s.venueName
    if (s.event) e.ev = s.event
    f.last.unshift(e)
    if (f.last.length > 6) f.last.length = 6

    for (const [me, opp] of [[a, b], [b, a]]) {
      let t = teams.get(me)
      if (!t) { t = { recent: [], formats: {}, last: '' }; teams.set(me, t) }
      t.last = s.date
      const res = s.result === 'win' ? (w === me ? 'W' : 'L') : s.result === 'tie' ? 'T' : s.result === 'draw' ? 'D' : 'NR'
      const re = { d: s.date, f: s.fmt, opp, result: res }
      if (s.margin) re.margin = s.margin
      if (s.event) re.ev = s.event
      re.v = s.venueName
      t.recent.unshift(re)
      if (t.recent.length > 10) t.recent.length = 10
      if (s.date >= cutoff) {
        const fs = t.formats[s.fmt] || (t.formats[s.fmt] = { played: 0, won: 0, lost: 0, tied: 0, noResult: 0, drawn: 0 })
        fs.played++
        if (res === 'W') fs.won++
        else if (res === 'L') fs.lost++
        else if (res === 'T') fs.tied++
        else if (res === 'D') fs.drawn++
        else fs.noResult++
      }
    }
  }
  const pairsOut = {}
  for (const k of Object.keys(pairs).sort()) pairsOut[k] = pairs[k]
  const teamsOut = {}
  for (const name of [...teams.keys()].sort()) {
    const t = teams.get(name)
    if (t.last < PLAYER_SINCE) continue
    const o = { recent: t.recent, formats: {} }
    for (const f of ['T20', 'ODI', 'Test']) if (t.formats[f]) o.formats[f] = t.formats[f]
    teamsOut[name] = o
  }
  return { pairs: pairsOut, teams: teamsOut, formsSince: cutoff }
}

// ---------------------------------------------------------------------------------------------
// Players output
// ---------------------------------------------------------------------------------------------
function outFmt(s, phased) {
  const o = { matches: s.matches }
  const b = s.bat
  if (b.inns) {
    const bat = {
      inns: b.inns, runs: b.runs, balls: b.balls, outs: b.outs, notOuts: b.inns - b.outs, fours: b.fours, sixes: b.sixes,
      hs: Math.max(b.hs, 0), hsNotOut: b.hsNotOut, fifties: b.fifties, hundreds: b.hundreds, ducks: b.ducks,
      avg: b.outs ? r2(b.runs / b.outs) : null, sr: b.balls ? r2((b.runs * 100) / b.balls) : null,
    }
    if (phased) {
      const ph = {}
      for (const k of PHASES) { const [runs, balls, outs] = b.ph[k]; if (balls || runs || outs) ph[k] = { runs, balls, outs } }
      if (Object.keys(ph).length) bat.phases = ph
    }
    o.bat = bat
  }
  const w = s.bowl
  if (w.inns) {
    const bowl = {
      inns: w.inns, balls: w.balls, runs: w.runs, wkts: w.wkts, dots: w.dots, fours: w.fours, sixes: w.sixes, wides: w.wides, noballs: w.noballs,
      econ: w.balls ? r2((w.runs * 6) / w.balls) : null, avg: w.wkts ? r2(w.runs / w.wkts) : null, sr: w.wkts ? r2(w.balls / w.wkts) : null,
      best: { w: Math.max(w.bestW, 0), r: w.bestR }, fourW: w.fourW, fiveW: w.fiveW,
    }
    if (Object.keys(w.dis).length) bowl.dismissals = Object.fromEntries(Object.entries(w.dis).sort((a, c) => c[1] - a[1] || (a[0] < c[0] ? -1 : 1)))
    if (phased) {
      const ph = {}
      for (const k of PHASES) { const [balls, runs, wkts] = w.ph[k]; if (balls || runs || wkts) ph[k] = { balls, runs, wkts } }
      if (Object.keys(ph).length) bowl.phases = ph
    }
    o.bowl = bowl
  }
  const f = s.field
  if (f.catches || f.stumpings || f.runOuts) o.field = { ...f }
  return o
}

function buildPlayers() {
  const keep = new Set()
  for (const [ci, p] of players) if (p.last >= PLAYER_SINCE) keep.add(ci)
  // matchups
  const vs = new Map()
  const vb = new Map()
  let pairsKept = 0
  for (const [key, idx] of pairIndex) {
    const o = idx * 6
    const balls = pairPool[o]
    if (balls < MIN_PAIR_BALLS) continue
    const bat = String(Math.floor(key / 1e7))
    const bowl = String(key % 1e7)
    const row = [balls, pairPool[o + 1], pairPool[o + 2], pairPool[o + 3], pairPool[o + 4], pairPool[o + 5]]
    if (keep.has(bat)) { (vs.get(bat) || vs.set(bat, []).get(bat)).push([bowl, row]); pairsKept++ }
    if (keep.has(bowl)) { (vb.get(bowl) || vb.set(bowl, []).get(bowl)).push([bat, row]); pairsKept++ }
  }
  const shards = Array.from({ length: N_SHARDS }, () => [])
  for (const ci of [...keep].sort((a, b) => a - b)) shards[Number(ci) % N_SHARDS].push(ci)
  const ORDER = ['T20', 'T20I', 'ODI', 'ODI_intl', 'Test', 'Test_intl']
  const result = []
  let droppedPairs = 0
  for (let sh = 0; sh < N_SHARDS; sh++) {
    const recs = []
    for (const ci of shards[sh]) {
      const p = players.get(ci)
      const formats = {}
      for (const k of ORDER) if (p.formats[k]) formats[k] = outFmt(p.formats[k], k === 'T20' || k === 'T20I' || k === 'ODI' || k === 'ODI_intl')
      p.recent.sort((a, b) => (a._k < b._k ? 1 : -1))
      const recent = p.recent.slice(0, RECENT_N).map(({ _k, ...e }) => e)
      const sortPairs = (arr) => (arr || []).sort((a, b) => b[1][0] - a[1][0] || Number(a[0]) - Number(b[0]))
      const rec = { name: p.name, formats, recent, vs: sortPairs(vs.get(ci)), vb: sortPairs(vb.get(ci)) }
      recs.push([ci, rec])
    }
    // Soft cap: drop lowest-volume pairs (globally within shard) until under budget
    const toJson = () => {
      const o = {}
      for (const [ci, r] of recs) {
        o[ci] = { name: r.name, formats: r.formats, recent: r.recent, vs: Object.fromEntries(r.vs), vb: Object.fromEntries(r.vb) }
      }
      return JSON.stringify(o)
    }
    let json = toJson()
    let minBalls = MIN_PAIR_BALLS
    while (Buffer.byteLength(json) > MAX_SHARD_BYTES && minBalls < 60) {
      minBalls += 2
      for (const [, r] of recs) {
        const before = r.vs.length + r.vb.length
        r.vs = r.vs.filter((x) => x[1][0] >= minBalls)
        r.vb = r.vb.filter((x) => x[1][0] >= minBalls)
        droppedPairs += before - r.vs.length - r.vb.length
      }
      json = toJson()
    }
    result.push({ shard: sh, json, players: recs.length, minBalls })
  }
  return { shards: result, kept: keep.size, total: players.size, pairsKept, droppedPairs }
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
async function main() {
  const zipPath = await fetchCached(ZIP_URL, 'all_json.zip')
  const peoplePath = await fetchCached(PEOPLE_URL, 'people.csv')
  const people = await loadPeople(peoplePath)

  log('reading matches ...')
  const errors = []
  await forEachZipJson(zipPath, (name, buf) => {
    counts.files++
    let m
    try {
      m = JSON.parse(buf.toString('utf8'))
      counts.parsed++
    } catch (e) {
      counts.malformed++
      errors.push(`${name}: ${e.message}`)
      return
    }
    const id = path.basename(name, '.json')
    try {
      if (!m?.info) throw new Error('no info')
      processMatch(id, m, people)
      if (FMT[m.info.match_type]) counts.used++
    } catch (e) {
      counts.malformed++
      if (errors.length < 50) errors.push(`${name}: ${e.message}`)
    }
    if (counts.files % 2000 === 0) log(`  ${counts.files} files, ${players.size} players, ${pairCount} matchup pairs`)
  })
  log(`read ${counts.files} files: used ${counts.used}, skipped type ${counts.skippedType}, malformed ${counts.malformed}`)
  log('match types:', JSON.stringify(counts.byType))
  if (errors.length) log('first errors:', errors.slice(0, 10))

  await fsp.rm(OUT, { recursive: true, force: true })
  await fsp.mkdir(path.join(OUT, 'players'), { recursive: true })
  const sizes = {}
  const write = async (rel, data) => {
    const json = typeof data === 'string' ? data : JSON.stringify(data)
    await fsp.writeFile(path.join(OUT, rel), json)
    sizes[rel] = Buffer.byteLength(json)
  }

  // Models
  log('training models ...')
  const modelOut = {
    generatedAt: new Date().toISOString(),
    trainCutoff: TRAIN_CUTOFF,
    notes: 'p = sigmoid(intercept + sum_i coef[i] * (x[i] - mean[i]) / std[i]); see scripts/cricsheet/README.md for feature formulas',
  }
  for (const key of ['T20', 'ODI', 'T20_women', 'ODI_women']) {
    const acc = models[key]
    if (!acc) continue
    const nMatches = acc.chaseMatches.train + acc.chaseMatches.test
    if (key.endsWith('_women') && nMatches < 300) { log(`skip ${key}: only ${nMatches} chase matches`); continue }
    modelOut[key] = trainModel(key, acc)
    const c = modelOut[key].chase.eval
    const f = modelOut[key].first.eval
    log(`  ${key}: chase test ll=${c.test?.logLoss} brier=${c.test?.brier} (baseline ll=${c.baselineTest?.logLoss}); first test ll=${f.test?.logLoss} brier=${f.test?.brier}`)
  }
  await write('model.json', modelOut)

  log('building venues ...')
  const { venues, venueAliases, ambiguousBaseKeys, cityAliases } = buildVenues()
  await write('venues.json', { venues, venueAliases, ambiguousBaseKeys, cityAliases })

  log('building h2h & teams ...')
  const { pairs, teams, formsSince } = buildH2HAndTeams()
  await write('h2h.json', { aliases: TEAM_ALIASES, pairs })
  await write('teams.json', { aliases: TEAM_ALIASES, formsSince, teams })

  log('building players ...')
  const pl = buildPlayers()
  for (const s of pl.shards) await write(`players/${s.shard}.json`, s.json)
  log(`players: kept ${pl.kept}/${pl.total}, matchup pairs kept ${pl.pairsKept}, dropped by shard cap ${pl.droppedPairs}`)

  const totalBytes = Object.values(sizes).reduce((a, b) => a + b, 0)
  const playerBytes = Object.entries(sizes).filter(([k]) => k.startsWith('players/')).reduce((a, [, b]) => a + b, 0)
  const meta = {
    generatedAt: new Date().toISOString(),
    source: 'Cricsheet (cricsheet.org), ODC-BY 1.0',
    attribution: 'Ball-by-ball data from Cricsheet (https://cricsheet.org), made available under the Open Data Commons Attribution License (ODC-BY 1.0). Player identifiers via the Cricsheet register.',
    license: 'https://opendatacommons.org/licenses/by/1-0/',
    matches: counts.used,
    latestMatchDate,
    players: pl.kept,
    venues: Object.keys(venues).length,
    teams: Object.keys(teams).length,
    h2hPairs: Object.keys(pairs).length,
    shards: N_SHARDS,
    shardOf: 'Number(cricinfoId) % 128',
    files: {
      'model.json': sizes['model.json'],
      'venues.json': sizes['venues.json'],
      'h2h.json': sizes['h2h.json'],
      'teams.json': sizes['teams.json'],
      'players/*.json': playerBytes,
      maxPlayerShard: Math.max(...pl.shards.map((s) => sizes[`players/${s.shard}.json`])),
      total: totalBytes,
    },
  }
  await write('meta.json', meta)
  log(`done. total ${(totalBytes / 1e6).toFixed(2)} MB`, JSON.stringify(meta.files))
}


main().catch((e) => {
  console.error(e)
  process.exit(1)
})
