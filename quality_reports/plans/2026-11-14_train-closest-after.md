# Plan — train tables: every useful train 05:00–23:00, closest one after the chosen time

Date: 2026-11-14 · Status: approved 2026-11-14 ("go ahead, arrives first, then deploy"); implemented

## Why
Tables are precomputed for 7 departure slots (06:00…18:00, every 2 h); any other time is silently
rounded up to the next slot (13:00 → 14:00, trains 13:00–14:00 missed; after 18:00 → nothing).

## Rule (confirmed: "arrives first")
For each origin → destination and day, keep every train journey leaving 05:00–23:00 that is not
beaten by another one (one that leaves later or at the same time AND arrives earlier or at the same
time — the Pareto set). The app then takes, among journeys leaving at or after the chosen time,
the one that arrives first. Example: chosen 13:00, a slow train at 13:05 arriving 18:00 and a direct
one at 13:30 arriving 16:00 → the 13:30. Duration counted = time on the train (as now), the
departure time is shown. No train after 23:00.

## Measured on the live SNCF feed (one date each, fares excluded in both columns)
| | now (7 slots) | every useful train, shared-segment format |
|---|---|---|
| Fri 20/11 | 6.8 MB, 61 s | 9.5 MB, 25 s |
| Sat 21/11 | — | 5.7 MB, 8 s |
Average 7.7 journeys kept per city pair (max 74). Estimated full horizon with fares ≈ 600–700 MB
(< 1 GB GitHub Pages limit); CI build faster than today.

## Steps
1. `lib/rail/build.ts`: one range query 05:00–23:00 per origin (already how each slot is computed),
   Pareto filter per destination; new file format: per-origin segment table + journeys as segment
   indices + `legs[dest]` = journey indices sorted by departure. Index: `range` instead of `profiles`.
2. `lib/travel/rail-client.ts`: pick the first stored journey with departure ≥ chosen time;
   clear messages when none (after 23:00, no train left that day).
3. `src/App.tsx`: free time inputs again (05:00–23:00; drop the uncommitted 2-hour drop-down),
   footer text updated (rule above).
4. `tests/rail.test.ts`: synthetic feed — closest-after pick, dominated train dropped, after-23:00 case.
5. Run tests + one-date local build (size check) + browser check on the 13:00 case.
6. Commit + push → CI full rebuild (routing change). Verify live index + a known pair
   (Paris–Bourges, Thouars–Tours) against SNCF Connect.

## Risks
- Size: estimate from 2 dates; if the full build exceeds ~900 MB, fall back to fewer published dates
  (projection already covers the rest).
- Old cached files in browsers: client already rejects unknown layouts with "rechargez la page".
