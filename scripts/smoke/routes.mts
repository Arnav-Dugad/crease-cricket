/**
 * Smoke-test the shared data layer against live upstream sources.
 * Usage: node scripts/smoke/routes.mts [path ...]
 */
import { resolve } from '../../shared/espn.ts'

const get = async (u: string) => {
  const r = await fetch(u, { headers: { 'user-agent': 'CreaseCricket/1.0 (https://github.com/Arnav-Dugad/crease-cricket)' } })
  if (!r.ok) throw new Error(`${r.status} ${u}`)
  return r.json()
}

const paths = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      '/api/people?ids=253802,625383,1408688,26241,30988',
      '/api/tsdb/player?name=Virat Kohli',
      '/api/tsdb/team?name=Royal Challengers Bengaluru',
      '/api/weather?q=Ahmedabad',
      '/api/rankings',
      '/api/standings/19430',
      '/api/wiki?q=Narendra Modi Stadium Ahmedabad cricket ground',
      '/api/day/20261015',
    ]

let failed = 0
for (const p of paths) {
  const t = Date.now()
  try {
    const { data } = await resolve(p, get)
    const j = JSON.stringify(data)
    console.log('OK  ', p, `${j.length}B`, `${Date.now() - t}ms`, j.slice(0, 220))
  } catch (e) {
    failed++
    console.log('FAIL', p, (e as Error).message)
  }
}
process.exit(failed ? 1 : 0)
