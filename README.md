# On se retrouve

**Où se retrouver ce week-end ?** A static web app that helps a family spread across France pick a meeting city. Each departure group says where it starts from and whether it travels by car, by train, or either. The app compares candidate cities and ranks them by fairness: it minimises the longest one-way trip anyone has to make, not the average.

Live: https://pierrebeaucoral.github.io/on-se-retrouve/

No backend, no API key. The browser asks the IGN routing service for car durations, and reads train durations from tables precomputed weekly from SNCF's open timetable, for every weekend the timetable covers (about five months ahead).

## How the ranking works

- Flexible groups ("voiture ou train") generate scenarios: every combination of modes across groups. Three views are offered: everyone flexible drives, everyone flexible takes the train, or any single scenario.
- For a scenario and a destination, each group contributes an outbound and a return duration. Train legs add the group's station access margin on each leg.
- Destinations where every group has both legs are **complete** and ranked first by the maximum duration, then by the mean duration (each group weighs the same), then alphabetically. Incomplete destinations are listed but unranked. No missing value is ever replaced by zero.
- Manual train entry stays available for dates or connections the precomputed tables do not cover.

The engine lives in `lib/travel/model.ts` and is covered by `tests/model.test.ts`.

## Data sources

| Mode | Source | How |
|------|--------|-----|
| Car | [IGN Géoplateforme itinéraire](https://www.data.gouv.fr/dataservices/api-geoplateforme-calcul-ditineraire) | Called from the browser (CORS enabled), fastest route on the BD TOPO road graph, city centre to city centre, no traffic. Cached seven days in the browser. |
| Train | [Horaires SNCF, GTFS](https://transport.data.gouv.fr/datasets/horaires-sncf) on transport.data.gouv.fr (TGV INOUI, OUIGO, Intercités, TER; 151-day horizon, refreshed daily) | `scripts/build-rail.ts` downloads the feed and precomputes, for every Friday, Saturday and Sunday inside the feed's horizon (about 70 dates), the shortest rail journey between every pair of the app's cities. Coaches are excluded. |
| Map | [france-geojson](https://github.com/gregoiredavid/france-geojson) | Region outlines, drawn as SVG. |

### Rail precomputation

For each date and each departure profile (06:00, 08:00, … 18:00), the script runs a RAPTOR search (`lib/rail/raptor.ts`) from every departure inside the following six hours and keeps, per destination, the journey with the shortest duration, ties broken by earliest arrival. Rules:

- at most two transfers, ten minutes minimum per transfer;
- stations of the same city are linked by a walking time (Paris 60 min, Lyon 40 min, others 30 min);
- airport and coach stations are not counted as the city;
- the journey is then "tightened": each leg is moved to the latest train that keeps the same connections, so reported durations exclude avoidable waiting.

The output is one JSON per date in `public/rail/` plus `public/rail/index.json`. These files are generated in CI and not committed (`public/rail/` is git-ignored); run `npm run rail` once for local development. In the app, a request at 14:30 uses the 16:00 profile: every train shown leaves after the time the user chose. These are theoretical timetables, not sales data; check the actual train before booking.

## Weekly refresh

`.github/workflows/refresh-and-deploy.yml` runs every Monday at 05:00 UTC (and on manual dispatch): it recomputes the rail tables from the latest GTFS, builds the site and deploys it to GitHub Pages. As SNCF publishes about five months ahead, the covered range rolls forward one week at a time. A push to `main` reuses the week's tables from the Actions cache and only rebuilds the site. If the SNCF download fails the job fails loudly and the previously deployed tables stay live.

## Project layout

```
index.html, src/main.tsx      Vite entry
src/App.tsx                   the page (groups, dates, scenarios, ranking, details)
src/travel-map.tsx            SVG map of France
lib/travel/model.ts           places, groups, scenarios, ranking, validation
lib/travel/car-client.ts      IGN routing client (browser)
lib/travel/rail-client.ts     reads the precomputed rail tables
lib/travel/client.ts          one round trip = car or rail, outbound + return
lib/rail/gtfs.ts              GTFS parsing, station mapping
lib/rail/raptor.ts            RAPTOR routing and journey tightening
lib/rail/build.ts             per-date table builder
lib/rail/zip.ts               minimal zip reader (no native unzip needed)
scripts/build-rail.ts         CLI: GTFS → public/rail/*.json
tests/                        node:test suites (engine, routing, parsing)
components/ui/                shadcn primitives actually used
```

## Commands

```sh
npm install
npm run dev          # local preview with hot reload
npm test             # engine, routing and parser tests
npm run typecheck
npm run lint
npm run rail         # build public/rail from the live SNCF feed (10-15 minutes)
npm run rail -- --gtfs path/to/feed.zip --dates 2026-09-18   # offline / single date
npm run build        # static site in dist/ (base path /on-se-retrouve/)
VITE_BASE=/ npm run build   # build for another host
```

Node 22.18 or newer is required (TypeScript scripts run without a build step).

## Embedding

The page works inside an iframe and without localStorage; preferences and the car cache are conveniences, not requirements.
