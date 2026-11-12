# On se retrouve

**Où se retrouver ce week-end ?** A static web app that helps a family spread across France pick a meeting city. Each departure group says where it starts from and whether it travels by car, by train, or either. The app compares candidate cities and ranks them by fairness: it minimises the longest one-way trip anyone has to make, not the average.

Live: https://pierrebeaucoral.github.io/on-se-retrouve/

No backend, no API key. The browser asks the IGN routing service for car durations (the public OSRM server on OpenStreetMap data when IGN is down), and reads train durations from tables precomputed weekly from SNCF's open timetable, for every weekend the timetable covers (about five months ahead).

## How the ranking works

- Flexible groups ("voiture ou train") generate scenarios: every combination of modes across groups. Four views are offered: everyone flexible drives; everyone flexible takes the train; "au plus rapide", where for each destination every flexible group takes whichever mode gives it the shorter round trip (train including its access time; a mode with missing data loses); or any single scenario, labelled by who drives and who takes the train.
- For a scenario and a destination, each group contributes an outbound and a return duration. Train legs add the group's station access margin on each leg.
- Destinations where every group has both legs are **complete** and ranked first by the maximum duration, then by the mean duration (each group weighs the same), then alphabetically. Incomplete destinations are listed but unranked. No missing value is ever replaced by zero.
- Manual train entry stays available for dates or connections the precomputed tables do not cover.
- **Cost estimate** (shown per destination, per group and per person, not used for ranking): a car is one vehicle per group, round-trip road distance × a per-km rate (default 0.35 €/km, close to the volunteer mileage scale used by French associations; editable, tolls and parking excluded). A train traveller pays the full-price range SNCF publishes for each train (2nd class, Tarif Normal). SNCF withdrew its TER fare datasets in late 2025 and fares differ by region. `data/ter-fares-2025.csv` keeps the last published "Tarif normal" fares that survive in the Web Archive, for Provence-Alpes-Côte d'Azur and Pays de la Loire only (2 of 11 regions, 3,494 station pairs, with straight-line distances). A listed pair gets its 2025 fare; any other TER leg gets a deliberately wide estimate: a distance fit pooled over both regions (each weighted equally, about 2.58 € + 0.243 €/km), shown as the 5th–95th percentile range of observed/fitted price (about 0.70–1.35 ×). The fit is recomputed from the file at each build. Both cases are marked `≈` and labelled ("tarif TER 2025", "estimation TER"). For reference, the PACA fit alone misses Pays de la Loire fares by 27 % (median), which is why no single-region fit is used. A missing fare or distance shows a lower bound (`≥`). A weekly CI job opens an issue if SNCF republishes TER fares.

## Groups and privacy

The site ships neutral placeholder groups. A visitor's own groups (names, towns, number of travellers) are kept only in their browser (`localStorage`). "Copier le lien de partage" puts them in the URL fragment (`#partage=…`), which browsers never send to a server; the app reads it once and removes it from the address bar.

Any French commune can be added as a departure ("Autre commune", searched on [geo.api.gouv.fr](https://geo.api.gouv.fr/decoupage-administratif/communes)): road trips start from the commune itself, trains from the nearest listed city with a station (editable), with the station access time entered as the group's margin.

The engine lives in `lib/travel/model.ts` and is covered by `tests/model.test.ts`.

## Data sources

| Mode | Source | How |
|------|--------|-----|
| Car | [IGN Géoplateforme itinéraire](https://www.data.gouv.fr/dataservices/api-geoplateforme-calcul-ditineraire) | Called from the browser (CORS enabled), fastest route on the BD TOPO road graph, city centre to city centre, no traffic. Cached seven days in the browser. When IGN fails, [OSRM](https://project-osrm.org)'s public demo server (OpenStreetMap roads, © OpenStreetMap contributors) answers instead, at most one request per second, cached one day and labelled on the leg; IGN is retried after ten minutes. |
| Train | [Horaires SNCF, GTFS](https://transport.data.gouv.fr/datasets/horaires-sncf) on transport.data.gouv.fr (TGV INOUI, OUIGO, Intercités, TER; 151-day horizon, refreshed daily) | `scripts/build-rail.ts` downloads the feed and precomputes, for every Friday, Saturday and Sunday inside the feed's horizon (about 70 dates), the shortest rail journey between every pair of the app's 156 cities. Coaches are excluded. |
| Train fares | [Tarifs TGV INOUI et OUIGO](https://ressources.data.sncf.com/explore/dataset/tarifs-tgv-inoui-ouigo/), [Tarifs Intercités](https://ressources.data.sncf.com/explore/dataset/tarifs-intercites/) (SNCF open data) | Downloaded by `scripts/build-rail.ts` and matched to each train by brand and station UIC code (`lib/rail/fares.ts`). Full-price min–max range, 2nd class. TER: 2025 fares for two regions from the Web Archive copies of the withdrawn `tarifs-ter-paca` and `tarifs-ter-pdll` datasets (`data/ter-fares-2025.csv`), estimate elsewhere (see Cost estimate). If the download fails the tables are built without published prices. |
| Communes | [geo.api.gouv.fr](https://geo.api.gouv.fr/decoupage-administratif/communes) | Called from the browser when a user searches a town outside the list. |
| Map | [france-geojson](https://github.com/gregoiredavid/france-geojson) | Region outlines, drawn as SVG. |

### Rail precomputation

For each date and each departure profile (06:00, 08:00, … 18:00), the script runs a RAPTOR search (`lib/rail/raptor.ts`) from every departure inside the following six hours and keeps, per destination, the journey with the shortest duration, ties broken by earliest arrival. Rules:

- at most three transfers, ten minutes minimum per transfer;
- stations of the same city are linked by a walking time (Paris 60 min, Lyon 40 min, others 30 min);
- airport and coach stations are not counted as the city;
- the journey is then "tightened": each leg is moved to the latest train that keeps the same connections, so reported durations exclude avoidable waiting.

The output is one JSON per date and departure city in `public/rail/<date>/<origin>.json` plus `public/rail/index.json`, so the browser only downloads the departure cities in play. Each file stores deduplicated journeys, train by train (stations, times, brand such as TGV INOUI or TER, train number, fare range when published), and for each destination the journey index per departure profile (`packOrigin` in `lib/rail/build.ts`). A date is about 8 MB (2 MB gzipped), roughly 600 MB for the whole horizon (GitHub Pages allows 1 GB).

### Beyond the SNCF horizon

SNCF publishes timetables about five months ahead. For a Friday, Saturday or Sunday after the last published date, and up to a year after the tables were built, the app projects the trip from the most recent published day with the same weekday whose timetable is complete (at least 95 % of the busiest such day, since the last weeks of a feed are often partial). Projected trips are labelled as such; check them when sales open. These files are generated in CI and not committed (`public/rail/` is git-ignored); run `npm run rail` once for local development. In the app, a request at 14:30 uses the 16:00 profile: every train shown leaves after the time the user chose. These are theoretical timetables, not sales data; check the actual train before booking.

## Cities

`lib/travel/places.ts` lists the 156 cities the app can compare: a few small towns plus the prefectures and main towns of metropolitan France that have a served station. It is generated by `scripts/build-places.ts`, which holds the curated name list and, for ambiguous names, the explicit stations of a city (for example Tours includes Saint-Pierre-des-Corps, Valence both Valence Ville and Valence TGV). Add a city to the script and rerun `node scripts/build-places.ts`; coordinates come from the main station. Ids of the original cities never change, so saved preferences keep working.

## Weekly refresh

`.github/workflows/refresh-and-deploy.yml` runs every Monday at 05:00 UTC (and on manual dispatch): it recomputes the rail tables from the latest GTFS, builds the site and deploys it to GitHub Pages. As SNCF publishes about five months ahead, the covered range rolls forward one week at a time. A push to `main` reuses the week's tables from the Actions cache and only rebuilds the site. If the SNCF download fails the job fails loudly and the previously deployed tables stay live.

## Project layout

```
index.html, src/main.tsx      Vite entry
src/App.tsx                   the page (groups, dates, scenarios, ranking, details)
src/travel-map.tsx            SVG map of France
lib/travel/model.ts           groups, scenarios, ranking, validation
lib/travel/places.ts          generated list of cities and their stations
lib/travel/car-client.ts      IGN routing client with OSRM fallback (browser)
lib/travel/rail-client.ts     reads the precomputed rail tables
lib/travel/client.ts          one round trip = car or rail, outbound + return
lib/rail/gtfs.ts              GTFS parsing, station mapping
lib/rail/raptor.ts            RAPTOR routing and journey tightening
lib/rail/build.ts             per-date table builder
lib/rail/fares.ts             SNCF open fare data, matched to trains
lib/rail/zip.ts               minimal zip reader (no native unzip needed)
scripts/build-rail.ts         CLI: GTFS → public/rail/<date>/<origin>.json
scripts/build-places.ts       CLI: curated city names + GTFS → lib/travel/places.ts
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
npm run rail         # build public/rail from the live SNCF feed (about 30 minutes for 156 cities)
npm run rail -- --gtfs path/to/feed.zip --dates 2026-09-18   # local feed / single date
npm run rail -- --no-fares   # skip the fare download
npm run build        # static site in dist/ (base path /on-se-retrouve/)
VITE_BASE=/ npm run build   # build for another host
```

Node 22.18 or newer is required (TypeScript scripts run without a build step).

## Embedding

The page works inside an iframe and without localStorage; preferences and the car cache are conveniences, not requirements.
