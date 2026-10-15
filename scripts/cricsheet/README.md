# Cricsheet historical data pipeline

`build.mjs` downloads [Cricsheet](https://cricsheet.org) ball-by-ball data and precomputes compact JSON into
`public/data/hist/` (Vite copies it to `dist/data/hist/`, served as static assets at `/data/hist/...`).
TypeScript types and the matching feature/key helpers are in `src/lib/hist-types.ts`.

Data licence: **ODC-BY 1.0**. Show the attribution in the UI: "Historical data: Cricsheet (cricsheet.org), ODC-BY".
The exact text is in `meta.json` (`attribution`).

## Refresh

```bash
npm run data:build            # uses cache if < 7 days old
node scripts/cricsheet/build.mjs --force   # force re-download
```

Downloads go to `scripts/cricsheet/.cache/` (gitignored): `all_json.zip` (~150 MB, ~23k matches) and
`register/people.csv`. A full build takes about 50 s, and the output is deterministic apart from `generatedAt`.

## Conventions

- Format buckets: `T20` = T20 + IT20 (internationals **and** franchise/domestic, including The Hundred);
  `ODI` = ODI + ODM (List A); `Test` = Test + MDM (first-class).
- Player keys are **Cricinfo IDs** (string), mapped via `people.csv` `key_cricinfo` (fallback `key_cricinfo_2`).
  Players without one are skipped.
- Super-over innings are ignored everywhere.
- Women's sides are renamed `"<Team> Women"` (unless the name already contains "Women"). Franchise renames
  (`aliases` in h2h/teams) are merged into the current name.
- Phases: T20 `pp` overs 1-6, `mid` 7-15, `death` 16-20; ODI `pp` 1-10, `mid` 11-40, `death` 41-50.
  Phases are only computed for 6-ball-over matches, so The Hundred is excluded from phases, models and venue pars.

## Files

| File | Contents |
| --- | --- |
| `meta.json` | generation time, source/licence, match count, latest match date, file sizes |
| `model.json` | `T20`, `ODI`, `T20_women`, `ODI_women`: `chase` + `first` logistic models, `outcomes` tables, `expected` runs table, `par` |
| `venues.json` | `{ venues, venueAliases, ambiguousBaseKeys, cityAliases }`. Per-venue format blocks `T20/ODI/Test` (men) and `T20W/ODIW/TestW` (women), only with >= 3 matches |
| `h2h.json` | `{ aliases, pairs }`, keyed `"A|B"` (sorted) then by format |
| `teams.json` | `{ aliases, formsSince, teams }`: last 10 results, and W/L by format since `formsSince` (3 years before the latest match). Teams active since 2018 |
| `players/{n}.json` | `n = Number(cricinfoId) % 128`. Players with a match since 2018. `formats` keys: `T20`, `T20I`, `ODI`, `ODI_intl`, `Test`, `Test_intl` |

### Player stat definitions
- Batting: balls faced exclude wides. `outs` excludes `retired hurt` / `retired not out`. An innings is counted
  if the player batted, was at the non-striker's end, or was dismissed. `fifties` = 50-99, `hundreds` = 100+.
- Bowling: `balls` are legal balls. `runs` = total runs minus byes, leg-byes and penalty runs. Wickets are
  bowled/caught/lbw/stumped/caught and bowled/hit wicket. `dots` = legal balls with 0 runs conceded by the
  bowler. `fourW` = exactly 4 wickets in an innings, `fiveW` = 5 or more.
- Fielding: catches include caught-and-bowled. Substitute fielders are not credited.
- `recent`: one entry per match (newest first, last 15), only matches where the player batted or bowled. For
  multi-innings matches `r`/`b` are summed, `out` refers to the last innings, and `inns` gives the count.
- `vs` / `vb`: `[balls, runs, outs, dots, fours, sixes]`, from 2015 onwards, pairs with >= 6 balls. `outs`
  counts only bowler-credited dismissals. A shard over 1.5 MB drops its lowest-volume pairs (no shard currently does).

## Models (`model.json`)

Logistic regression, fitted by IRLS (Newton) with a small ridge (lambda = 1e-3·n) on standardised features:

```
z_i = (x_i - mean[i]) / std[i]          (mean/std from the training rows)
p   = 1 / (1 + exp(-(intercept + sum_i coef[i] * z_i)))
```

The split is by time: train on matches before 2023-01-01, test on 2023 onwards. The shipped coefficients are the
train-split fit, so `eval.test` describes the model that ships. Ties are labelled y = 0.5. No-results and
awarded matches are excluded.

### `chase`: P(chasing side wins), one row after every legal ball of the 2nd innings (plus the start state)
Inputs: `target` = `innings[1].target.runs` (DLS-revised when present, else 1st-innings total + 1; matches
with a method and no target are skipped). `limit` = `target.overs` converted to balls (e.g. `17.3` = 105),
else scheduled overs × 6. `score`, `balls` (legal balls bowled), `wkts` (wickets fallen).

```
runsNeeded = max(target - score, 0)
ballsLeft  = max(limit - balls, 0)
wih        = 10 - wkts
rrr        = ballsLeft > 0 ? clip(runsNeeded*6/ballsLeft, 0, 36) : (runsNeeded > 0 ? 36 : 0)
crr        = balls > 0 ? clip(score*6/balls, 0, 36) : 0
blf        = ballsLeft / limit                       (balls_left_frac)
rnf        = clip(runsNeeded / target, 0, 1)         (runs_needed_frac)
features   = [rrr, crr, wih, blf, rnf, rrr*blf, wih*blf, log(1 + runsNeeded / max(wih, 0.5))]
```

### `first`: P(side batting first wins), one row after every legal ball of full-length 1st innings
Full-length means the scheduled overs are 20/50, there was no overs reduction, and the innings was all out or batted every over.

```
blf       = (L - balls) / L           (L = 120 or 300)
crr       = balls > 0 ? clip(score*6/balls, 0, 36) : 0
parAt(b)  = linear interpolation of par[] at b/6 overs
features  = [score, wkts, blf, crr, score - parAt(balls), wkts*blf]
```
`par` comes from the venue's `parByOver` when the venue has at least `venueParMinMatches` (5) full-length first innings (`parN`), else from
`first.parGlobal`. In training, venue pars came from pre-2023 matches only. Client-side, use
`venues.json` `parByOver` (all years), which is a close approximation.

### `outcomes`: Monte Carlo ball outcomes (2018+)
`tables[phase][wktsLostBucket][outcome]` are probabilities over `0,1,2,3,4,6,W,wd,nb,lb`. `n` is the sample size.
A ball with a wicket counts as `W` regardless of runs. 5s count as `4`. `lb` = byes or leg-byes.
`extraRuns` = mean total runs on `wd` / `nb` / `lb` balls (e.g. a no-ball hit for four).

### `expected`: expected remaining runs
`table[ballsLeft/6][wktsLost]`, built from full-length 1st innings 2016+ at the start of each over. Each cell
shrinks the raw mean toward a per-wicket DLS-style curve `A_w·(1-exp(-b_w·ballsLeft/A_w))` (strength 40
observations), then the table is made monotone (non-decreasing in balls left, non-increasing in wickets).
`n` holds the raw counts. Projected score = `score + table[round(ballsLeft/6)][wkts]`.

## Venue keys

Normalise with `histVenueKey(venue, city, venuesFile)` from `src/lib/hist-types.ts`. The steps:
1. lowercase, strip diacritics and apostrophes, punctuation becomes a space, then join runs of single letters
   (`"M.A. Chidambaram"` becomes `ma chidambaram`)
2. take the part before the first comma
3. apply `venueAliases` (renames such as Sardar Patel Stadium → Narendra Modi Stadium, Feroz Shah Kotla → Arun Jaitley Stadium)
4. if the base is in `ambiguousBaseKeys` (County Ground, National Stadium, ...), append the normalised city
   (`county ground taunton`)
