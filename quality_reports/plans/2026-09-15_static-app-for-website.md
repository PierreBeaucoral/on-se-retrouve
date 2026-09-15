# Plan — "On se retrouve" as a static app in the website Apps section

Status: COMPLETED (approved and executed 2026-09-15)
Date: 2026-09-15

## Objective
Ship "On se retrouve" as a static, backend-free web app at
`https://pierrebeaucoral.github.io/on-se-retrouve/`, refreshed weekly by GitHub
Actions from SNCF open GTFS data, and listed as a card on the website Apps page.

## Facts established
- IGN itinéraire API returns `access-control-allow-origin: *` → car durations can be
  fetched from the browser; no server needed.
- SNCF GTFS (TGV, Intercités, TER, 151-day horizon, refreshed daily, 3.8 MB zip)
  is public without a key: https://transport.data.gouv.fr/datasets/horaires-sncf
- Stop ids encode the mode ("Train TER", "TGV INOUI", "Car TER") → bus filtering possible.
- Website pattern: each app is its own public GitHub repo deployed to GitHub Pages;
  `layouts/apps/list.html` embeds it (iframe preview + card + button).
  Apps page tagline: "Fast, static web apps - no backend, no cold start."

## Requirements
MUST
- R1 Static build, no API routes, served under base path `/on-se-retrouve/`.
- R2 Car legs via IGN from the browser (keep 300 ms throttle, 7-day localStorage cache).
- R3 Train legs from precomputed JSON `public/rail/<YYYY-MM-DD>.json` produced by
  `scripts/build-rail.mjs` (GTFS download → filter services on date → connection
  scan with ≤2 transfers, min transfer 10 min, trains only) for the next 8 weekends,
  profiles Fri 14:00 / Sat 08:00 out, Sun 16:00 back, all 28 places as origin and destination.
- R4 Ranking engine (`lib/travel/model.ts`) and its tests unchanged.
- R5 Manual train entry stays as fallback when the date is outside the precomputed horizon.
- R6 GitHub Actions: weekly cron (Mon 05:00 UTC) + on push + manual dispatch:
  build rail JSON → commit if changed → build → deploy to GitHub Pages.
- R7 Unit tests for the routing script on a fixture GTFS (3-4 synthetic trips,
  one transfer, one bus to exclude, one out-of-window departure).
- R8 Card in website `layouts/apps/list.html` following the existing markup
  (iframe preview, tags, "Ouvrir l'application ↗" button). Website change committed
  separately and only after the app is live.
SHOULD
- S1 Rail JSON also stores departure/arrival/transfers so the detail table keeps its info.
- S2 App works inside the website iframe (no dependency on localStorage availability).
MAY
- M1 Keep `SNCF_API_KEY` path out entirely (no server). Documented as dropped.

## Steps
1. Create GitHub repo `PierreBeaucoral/on-se-retrouve` (public), init git in project.
2. Replace vinext/Cloudflare toolchain with Vite + React static build
   (`vite.config.ts`, `index.html`, `src/main.tsx`), remove `app/api/*`, Sites scripts,
   `.openai/`, wrangler/drizzle deps. Keep `lib/travel/model.ts`, UI components, CSS, map.
3. Move car fetching to a browser module `lib/travel/car-client.ts`.
4. Write `scripts/build-rail.mjs` + `tests/rail.test.ts`; generate first JSON set locally.
5. Add `lib/travel/rail-client.ts` reading the JSON for the selected dates.
6. `.github/workflows/refresh-and-deploy.yml` per R6; enable Pages.
7. Verify: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
   local preview, then first Actions run green and app reachable.
8. Add the Apps-page card in the website repo; `hugo` build check; commit.

## Risks
- CSA routing correctness → mitigated by fixture tests and a spot check against
  SNCF Connect for 3 known pairs (Paris–Bourges, Lyon–Dijon, Thouars–Tours).
- GTFS zip URL changes → workflow fails loudly, previous JSON stays deployed.
- IGN rate limits from the browser → same throttle as today; ~200 calls per full run.

## Alternatives rejected
- Cloudflare Worker with SNCF Navitia key: needs a secret and a key we do not have.
- Scraping SNCF Connect: against terms, brittle.
