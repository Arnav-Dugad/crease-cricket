# Crease — Live cricket, beautifully

A premium, Apple-inspired cricket scores & analytics web app: glass materials, fluid spring motion,
light/dark themes, and deep match intelligence — built on free public data and deployed on Cloudflare's edge.

## Features

- **Live scores** across every competition — internationals, IPL/BBL/SA20 & other leagues, women's and domestic cricket
- **Match Centre** — stadium-photo hero, live situation panel (batters, bowler, this over, CRR/RRR, projection, win probability)
- **Full scorecards** — batting, bowling, extras, fall of wickets, partnerships
- **Ball-by-ball commentary** grouped by over, with wicket/boundary filters and live updates
- **Analytics** — worm, Manhattan, run-rate race, phase battle (powerplay/middle/death), momentum, scoring mix,
  batter scoring zones (wagon wheel), bowler pitch maps vs right/left-handers
- **Win predictor** — a resource-based (DLS-style) probability model computed for every delivery
- **Key moments** — auto-generated timeline of wickets, milestones and big overs
- **Series hubs** with fixtures, results and points tables (NRR, qualification)
- **Player profiles** with ESPN headshots, Wikipedia portraits & biographies, and video clips
- **Video highlights** in an in-app player, top stories, ⌘K command palette search
- Mobile-first: iOS-style glass tab bar, safe-area aware, swipeable rails

## Data sources (all free, no API keys)

| Source | Used for |
| --- | --- |
| ESPN / ESPNcricinfo public site API | scores, scorecards, ball-by-ball, standings, news, videos, players, team & league logos, headshots |
| Wikipedia / Wikimedia Commons | stadium photography, player portraits and bios |

All upstream calls go through a Cloudflare Worker (`worker/index.ts`) that aggregates and caches at the edge
(15–20s TTL for live matches, hours for completed ones).

## Stack

React 19 · TypeScript · Vite · Motion · React Router · Cloudflare Workers (static assets + API)

## Develop

```bash
npm install
npm run build && npx wrangler dev   # full stack on http://localhost:8787
# or: npx wrangler dev (API) + npm run dev (Vite HMR on :5173, proxies /api)
```

## Deploy

```bash
npm run deploy   # builds and runs wrangler deploy
```

Logos, photos and data belong to their respective owners. Win probabilities are statistical model estimates.
