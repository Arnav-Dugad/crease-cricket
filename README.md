# Crease — Live cricket, beautifully

A premium, Apple-inspired cricket scores & analytics web app: glass materials, fluid spring motion,
light/dark/high-contrast themes, and deep match intelligence — built entirely on free public data
and deployed on Cloudflare's edge.

**Live:** https://crease-cricket.arnavrival12.workers.dev

## Features

**Live**
- Scores across every competition, with a live ticker on every page and a multi-match view (up to four games)
- Real-time updates over WebSockets (one Durable Object per live match), with automatic polling fallback
- Celebrations for sixes, fours, wickets and milestones (confetti, shockwaves, haptics)
- Lock-screen live score via the Media Session API; app badge with the live-match count

**Match Centre**
- Stadium-photo hero with parallax, tilt, photo-derived tint, team-colour accents and rolling-digit scores
- Scorecards, ball-by-ball commentary, squads, officials with photos, venue and weather, where to watch
- AI match story: a short narrative for every 5 overs (Claude if `ANTHROPIC_API_KEY` is set, otherwise Workers AI)
- Win probability from logistic models **trained on 23k Cricsheet matches**, calibrated with each venue's par score,
  with the biggest swings annotated
- Who-should-bowl-next recommendations and batter-vs-bowler matchup history
- Analytics with a ball-by-ball replay scrubber: worm, Manhattan, run-rate race, phase battle, momentum, scoring mix,
  impact ratings (win probability added / runs above par), partnership pressure, animated wagon wheels,
  2D/3D pitch maps, Monte Carlo innings simulator, DLS-style rain calculator

**Beyond the match**
- Series hubs: fixtures, results, points tables, season stat leaders, team radar profiles and scoring-zone maps
- ICC team rankings (men's & women's, all formats) and the World Test Championship table
- Team pages (artwork, form, squad, fixtures) and player career dashboards (formats, phases, dismissals, form)
- Match archive back to 2005 with a calendar and "On this day"
- Follow teams and players for a personalised home feed
- Installable PWA with offline support; ⌘K search; View Transitions between pages

## Data sources (all free, no API keys)

| Source | Used for |
| --- | --- |
| ESPN / ESPNcricinfo public site API | live scores, scorecards, ball-by-ball, standings, news, videos, players, logos, headshots |
| [Cricsheet](https://cricsheet.org) (ODC-BY) | 23k matches of ball-by-ball history → models, venue profiles, careers, matchups, head-to-head |
| Wikidata | player & umpire photos matched exactly by ESPNcricinfo ID (P2697) |
| Wikipedia | stadium photography, venue coordinates, bios, ICC rankings tables |
| TheSportsDB | player cutouts, franchise badges and artwork |
| Open-Meteo | ground weather, rain and dew forecasts |
| flagcdn.com | national flags |
| Cloudflare Workers AI | AI match stories (free tier) |

The data layer (`shared/espn.ts`) runs both at the edge (Worker, with caching) and in the browser:
if ESPN's bot protection blocks Cloudflare's network, the browser fetches the CORS-open APIs directly.

## Stack

React 19 · TypeScript · Vite · Motion · React Router · Cloudflare Workers (static assets, Cache API,
Durable Objects, Workers AI)

## Develop

```bash
npm install
npm run data:build                 # download Cricsheet + build public/data/hist (~1 min, 52 MB)
npm run build && npx wrangler dev  # full stack on http://localhost:8787
```

## Deploy

`npm run deploy` deploys from your machine. The **Deploy** GitHub Action deploys on every push to `main` and
rebuilds the historical data weekly — add a `CLOUDFLARE_API_TOKEN` repository secret
("Edit Cloudflare Workers" template) to enable it. **Uptime** pings the site every 30 minutes.

Optional: `npx wrangler secret put ANTHROPIC_API_KEY` to have Claude write the match stories.

Logos, photos and data belong to their respective owners. Win probabilities and projections are statistical model
estimates; the rain calculator is a DLS-style estimate, not the official DLS Professional Edition.
