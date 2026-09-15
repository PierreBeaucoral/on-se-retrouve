import test from "node:test";
import assert from "node:assert/strict";
import { parseIgnDuration, parseRailJourney, validateTravelRequest } from "../lib/travel/providers.ts";

test("validation accepte les identifiants et dates calendaires", () => {
  assert.equal(validateTravelRequest({ origin: "lyon", destination: "paris", mode: "car", outbound: "2026-06-01T08:30", inbound: "2026-06-07T18:00" }).ok, true);
  assert.equal(validateTravelRequest({ origin: "lyon", destination: "paris", mode: "car", outbound: "2026-02-30T08:30", inbound: "2026-06-07T18:00" }).ok, false);
});

test("parsing IGN convertit les secondes en minutes sans NaN", () => {
  assert.equal(parseIgnDuration({ duration: 3661, timeUnit: "second" }), 61);
  assert.equal(parseIgnDuration({ duration: Number.NaN, timeUnit: "second" }), null);
  assert.equal(parseIgnDuration({ duration: 2881 * 60, timeUnit: "second" }), null);
  assert.equal(parseIgnDuration({ duration: 3661, timeUnit: "minute" }), null);
});

test("parsing rail choisit les trajets publics et rejette un bus", () => {
  const base = { duration: 5400, departure_date_time: "20260601T090000", arrival_date_time: "20260601T103000", nb_transfers: 1, sections: [{ type: "public_transport", display_informations: { commercial_mode: "Train" } }] };
  assert.equal(parseRailJourney(base, "2026-06-01T08:30")?.minutes, 90);
  assert.equal(parseRailJourney({ ...base, sections: [{ type: "public_transport", display_informations: { commercial_mode: "Bus" } }] }, "2026-06-01T08:30"), null);
  assert.equal(parseRailJourney(base, "2026-06-01T11:00"), null);
});

test("parsing rail accepte un départ 5h après l'heure demandée et rejette 7h après", () => {
  const base = { duration: 5400, departure_date_time: "20260601T130000", arrival_date_time: "20260601T143000", nb_transfers: 0, sections: [{ type: "public_transport", display_informations: { commercial_mode: "Train" } }] };
  assert.equal(parseRailJourney(base, "2026-06-01T08:00")?.minutes, 90);
  const tooLate = { ...base, departure_date_time: "20260601T150000", arrival_date_time: "20260601T163000" };
  assert.equal(parseRailJourney(tooLate, "2026-06-01T08:00"), null);
});

test("parsing rail rejette une arrivée antérieure au départ", () => {
  const base = { duration: 5400, departure_date_time: "20260601T103000", arrival_date_time: "20260601T090000", nb_transfers: 0, sections: [{ type: "public_transport", display_informations: { commercial_mode: "Train" } }] };
  assert.equal(parseRailJourney(base, "2026-06-01T08:30"), null);
});
