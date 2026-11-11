import test from "node:test";
import assert from "node:assert/strict";
import { loadFeed, parseCsv, parseGtfsTime, servedStations, stationsForPlace, tripsOnDate, type FeedFiles } from "../lib/rail/gtfs.ts";
import { buildNetwork, plan } from "../lib/rail/raptor.ts";
import { buildRailDay, intraCityFootpaths, resolvePlaceStations, upcomingDates, type RailEntry } from "../lib/rail/build.ts";
import { readFileSync } from "node:fs";
import { buildFareTable, crowKm, fareFamily, legFare, parseTerCsv, terFare, terModel } from "../lib/rail/fares.ts";

// Synthetic feed: stations A, B, B2 (same city as B), C, D, E. Rail route R1, coach route RB.
// T1 A 08:00 → B 09:00 → C 10:00        T2 A 09:00 → B 10:00 → C 11:00
// T3 B 10:30 → D 11:30                  T5 A 07:00 → C 07:30 (before the request)
// T6 B2 10:00 → E 11:00 (reachable from B by a 30 min intra-city walk)
// T9 A 12:07 → D 13:00 (direct, shortest A→D inside the six-hour window from 08:00)
// T4 coach A 08:10 → D 09:00 (route_type 3, must be ignored)
// T7 rail route but coach stop points A 08:05 → D 08:50 (must be ignored)
const files: FeedFiles = {
  "feed_info.txt": "feed_id,feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version\n0,TEST,http://x,fr,20260901,20261231,2026-09-01\n",
  "stops.txt": [
    "stop_id,stop_name,stop_desc,stop_lat,stop_lon,zone_id,stop_url,location_type,parent_station",
    "StopArea:A,Paris Est,,48.8,2.3,,,1,", "StopPoint:OCETrain TER-A,Paris Est,,48.8,2.3,,,0,StopArea:A", "StopPoint:OCECar TER-A,Paris Est,,48.8,2.3,,,0,StopArea:A",
    "StopArea:B,Dijon,,47.3,5.0,,,1,", "StopPoint:OCETrain TER-B,Dijon,,47.3,5.0,,,0,StopArea:B",
    "StopArea:B2,Dijon Porte Neuve,,47.3,5.1,,,1,", "StopPoint:OCETrain TER-B2,Dijon Porte Neuve,,47.3,5.1,,,0,StopArea:B2",
    "StopArea:C,Lyon Part Dieu,,45.7,4.8,,,1,", "StopPoint:OCETrain TER-C,Lyon Part Dieu,,45.7,4.8,,,0,StopArea:C",
    "StopArea:D,Beaune,,47.0,4.8,,,1,", "StopPoint:OCETrain TER-D,Beaune,,47.0,4.8,,,0,StopArea:D", "StopPoint:OCECar TER-D,Beaune,,47.0,4.8,,,0,StopArea:D",
    "StopArea:E,Besançon Viotte,,47.2,6.0,,,1,", "StopPoint:OCETrain TER-E,Besançon Viotte,,47.2,6.0,,,0,StopArea:E",
    "StopArea:X,Lyon Saint-Exupéry TGV,,45.7,5.0,,,1,", "StopPoint:OCETrain TER-X,Lyon Saint-Exupéry TGV,,45.7,5.0,,,0,StopArea:X",
    "StopArea:Y,\"Paris, Gare Routière\",,48.8,2.3,,,1,",
  ].join("\n") + "\n",
  "routes.txt": "route_id,agency_id,route_short_name,route_long_name,route_desc,route_type\nR1,1,,\"Paris, Dijon et Lyon\",,2\nRB,1,,Coach,,3\n",
  "trips.txt": "route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id\n" + ["R1,S1,T1", "R1,S1,T2", "R1,S1,T3", "RB,S1,T4", "R1,S1,T5", "R1,S1,T6", "R1,S1,T7", "R1,S2,T8", "R1,S1,T9"].map((t) => `${t},,0,,`).join("\n") + "\n",
  "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type,shape_dist_traveled\n" + [
    "T1,08:00:00,08:00:00,StopPoint:OCETrain TER-A,0,,0,1,", "T1,09:00:00,09:02:00,StopPoint:OCETrain TER-B,1,,0,0,", "T1,10:00:00,10:00:00,StopPoint:OCETrain TER-C,2,,1,0,",
    "T2,09:00:00,09:00:00,StopPoint:OCETrain TER-A,0,,0,1,", "T2,10:00:00,10:02:00,StopPoint:OCETrain TER-B,1,,0,0,", "T2,11:00:00,11:00:00,StopPoint:OCETrain TER-C,2,,1,0,",
    "T3,10:30:00,10:30:00,StopPoint:OCETrain TER-B,0,,0,1,", "T3,11:30:00,11:30:00,StopPoint:OCETrain TER-D,1,,1,0,",
    "T4,08:10:00,08:10:00,StopPoint:OCECar TER-A,0,,0,1,", "T4,09:00:00,09:00:00,StopPoint:OCECar TER-D,1,,1,0,",
    "T5,07:00:00,07:00:00,StopPoint:OCETrain TER-A,0,,0,1,", "T5,07:30:00,07:30:00,StopPoint:OCETrain TER-C,1,,1,0,",
    "T6,10:00:00,10:00:00,StopPoint:OCETrain TER-B2,0,,0,1,", "T6,11:00:00,11:00:00,StopPoint:OCETrain TER-E,1,,1,0,",
    "T7,08:05:00,08:05:00,StopPoint:OCECar TER-A,0,,0,1,", "T7,08:50:00,08:50:00,StopPoint:OCECar TER-D,1,,1,0,",
    "T8,20:00:00,20:00:00,StopPoint:OCETrain TER-A,0,,0,1,", "T8,26:30:00,26:30:00,StopPoint:OCETrain TER-C,1,,1,0,",
    "T9,12:07:00,12:07:00,StopPoint:OCETrain TER-A,0,,0,1,", "T9,13:00:00,13:00:00,StopPoint:OCETrain TER-D,1,,1,0,",
  ].join("\n") + "\n",
  "calendar_dates.txt": "service_id,date,exception_type\nS1,20260918,1\nS1,20260919,1\nS2,20260919,1\nS1,20260920,2\n",
};

const feed = loadFeed(files);
const places = [{ id: "paris", name: "Paris" }, { id: "dijon", name: "Dijon" }, { id: "lyon", name: "Lyon" }, { id: "beaune", name: "Beaune" }, { id: "besancon", name: "Besançon" }, { id: "nowhere", name: "Nulle part" }];

test("parseCsv gère les champs entre guillemets et les virgules internes", () => {
  const rows = parseCsv('a,b\n1,"x, y"\n2,"say ""hi"""\n');
  assert.deepEqual(rows, [{ a: "1", b: "x, y" }, { a: "2", b: 'say "hi"' }]);
  assert.equal(parseGtfsTime("26:30:00"), 26 * 3600 + 30 * 60);
  assert.equal(parseGtfsTime("8h30"), null);
});

test("loadFeed ne garde que les trains et regroupe les points d'arrêt par gare", () => {
  const ids = feed.trips.map((t) => t.id).sort();
  assert.deepEqual(ids, ["T1", "T2", "T3", "T5", "T6", "T8", "T9"]);
  assert.equal(feed.trips.find((t) => t.id === "T1")?.stops[1].station, "StopArea:B");
  assert.equal(feed.trips.find((t) => t.id === "T1")?.stops[0].alight, false);
  assert.equal(feed.feedVersion, "2026-09-01");
});

test("tripsOnDate suit calendar_dates, y compris les exceptions de suppression", () => {
  assert.equal(tripsOnDate(feed, "20260918").length, 6);
  assert.equal(tripsOnDate(feed, "20260919").length, 7);
  assert.equal(tripsOnDate(feed, "20260920").length, 0);
});

test("stationsForPlace associe les gares d'une ville sans les gares routières ni l'aéroport", () => {
  const served = servedStations(feed.trips);
  assert.deepEqual(stationsForPlace(feed, "Paris", served).map((s) => s.name), ["Paris Est"]);
  assert.deepEqual(stationsForPlace(feed, "Lyon", served).map((s) => s.name), ["Lyon Part Dieu"]);
  assert.deepEqual(stationsForPlace(feed, "Dijon", served).map((s) => s.name).sort(), ["Dijon", "Dijon Porte Neuve"]);
  assert.deepEqual(stationsForPlace(feed, "Besançon", served).map((s) => s.name), ["Besançon Viotte"]);
  assert.deepEqual(stationsForPlace(feed, "Nulle part", served), []);
});

test("le trajet direct part après l'heure demandée et ignore les cars", () => {
  const network = buildNetwork(tripsOnDate(feed, "20260918"));
  const j = plan(network, ["StopArea:A"], ["StopArea:C"], 8 * 3600);
  assert.ok(j);
  assert.equal(j.departure, 8 * 3600);
  assert.equal(j.arrival, 10 * 3600);
  assert.equal(j.transfers, 0);
  assert.equal(plan(network, ["StopArea:A"], ["StopArea:D"], 8 * 3600)?.legs.some((l) => l.tripId === "T4" || l.tripId === "T7"), false);
});

test("la correspondance respecte le temps de changement et le resserrage retarde le départ", () => {
  const network = buildNetwork(tripsOnDate(feed, "20260918"));
  const j = plan(network, ["StopArea:A"], ["StopArea:D"], 8 * 3600, { minTransferSeconds: 600 });
  assert.ok(j);
  assert.equal(j.arrival, 11.5 * 3600);
  assert.equal(j.transfers, 1);
  // T2 reaches Dijon at 10:00, ten minutes before T3 at 10:30, so the tightened journey leaves at 09:00 instead of 08:00.
  assert.equal(j.departure, 9 * 3600);
  assert.deepEqual(j.legs.map((l) => l.tripId), ["T2", "T3"]);
  // With a 45-minute minimum transfer only T1 connects.
  assert.equal(plan(network, ["StopArea:A"], ["StopArea:D"], 8 * 3600, { minTransferSeconds: 45 * 60 })?.departure, 8 * 3600);
});

test("les gares d'une même ville sont reliées par un temps de marche", () => {
  const stations = new Map([["dijon", ["StopArea:B", "StopArea:B2"]]]);
  const network = buildNetwork(tripsOnDate(feed, "20260918"), intraCityFootpaths(stations, {}, 30));
  const j = plan(network, ["StopArea:A"], ["StopArea:E"], 8 * 3600);
  assert.ok(j);
  assert.equal(j.arrival, 11 * 3600);
  assert.equal(j.transfers, 1);
  assert.deepEqual(j.legs.map((l) => l.tripId), ["T1", "T6"]);
  assert.equal(plan(buildNetwork(tripsOnDate(feed, "20260918")), ["StopArea:A"], ["StopArea:E"], 8 * 3600), null);
});

test("aucun trajet quand plus rien ne part, ni au-delà de deux correspondances", () => {
  const network = buildNetwork(tripsOnDate(feed, "20260918"));
  assert.equal(plan(network, ["StopArea:A"], ["StopArea:C"], 11.5 * 3600), null);
  const withWalk = buildNetwork(tripsOnDate(feed, "20260918"), intraCityFootpaths(new Map([["dijon", ["StopArea:B", "StopArea:B2"]]]), {}, 30));
  assert.equal(plan(withWalk, ["StopArea:A"], ["StopArea:E"], 8 * 3600, { maxRounds: 1 }), null, "A→E needs two trains");
  assert.ok(plan(withWalk, ["StopArea:A"], ["StopArea:E"], 8 * 3600, { maxRounds: 2 }));
});

test("buildRailDay garde le trajet le plus court de la fenêtre de six heures et exporte des minutes", () => {
  const placeStations = resolvePlaceStations(feed, places);
  const day = buildRailDay(feed, "2026-09-19", placeStations, { profiles: ["06:00", "08:00", "13:00"], intraCityMinutes: {}, defaultIntraCityMinutes: 30 });
  // Summary view of an entry: totals plus the stations passed through, in order.
  const view = (e: RailEntry | undefined) => e && { m: e.m, d: e.d, a: e.a, t: e.t, s: [day.stations[e.l[0][0]], ...e.l.map((x) => day.stations[x[1]])] };
  assert.deepEqual(view(day.legs["08:00"]["paris|lyon"]), { m: 120, d: 480, a: 600, t: 0, s: ["Paris Est", "Lyon Part Dieu"] });
  // Earliest arrival would be T2+T3 (09:00 → 11:30, 150 min); the direct T9 at 12:07 is shorter and inside the window.
  assert.deepEqual(view(day.legs["08:00"]["paris|beaune"]), { m: 53, d: 727, a: 780, t: 0, s: ["Paris Est", "Beaune"] });
  // From 06:00 the six-hour window closes at 12:00, so T9 is out and the connection wins.
  assert.deepEqual(view(day.legs["06:00"]["paris|beaune"]), { m: 150, d: 540, a: 690, t: 1, s: ["Paris Est", "Dijon", "Beaune"] });
  // Each train carries its own times and brand; without a TER model, TER legs stay unpriced.
  assert.deepEqual(day.legs["06:00"]["paris|beaune"].l.map((x) => x.slice(2)), [[540, 600, "Train TER", "", null, null, 0], [630, 690, "Train TER", "", null, null, 0]]);
  // With one, TER legs not listed in the 2025 file get the distance estimate (source 1); listed pairs are tested below.
  const model = { exact: new Map([["A|B", 9.7], ["B|A", 9.7]]), base: 2, perKm: 0.25, low: 0.7, high: 1.35 };
  const priced = buildRailDay(feed, "2026-09-19", placeStations, { profiles: ["06:00"], intraCityMinutes: {}, defaultIntraCityMinutes: 30, ter: model });
  const [first, second] = priced.legs["06:00"]["paris|beaune"].l;
  assert.equal(first[8], 1, "fixture station ids carry no UIC code, so no 2025 pair matches");
  assert.deepEqual(second.slice(6), [...terFare(model, "StopArea:B", "StopArea:D", crowKm(feed.stations.get("StopArea:B")!, feed.stations.get("StopArea:D")!)).fare, 1]);
  assert.equal(day.legs["13:00"]["paris|lyon"], undefined, "T8 leaves at 20:00, outside the six-hour window");
  assert.deepEqual(view(day.legs["06:00"]["paris|lyon"]), { m: 30, d: 420, a: 450, t: 0, s: ["Paris Est", "Lyon Part Dieu"] }, "07:00 train T5 is the shortest journey from 06:00");
  assert.equal(day.legs["08:00"]["lyon|paris"], undefined);
  assert.equal(day.legs["08:00"]["paris|paris"], undefined);
});

test("les tarifs SNCF sont rattachés par famille de train et code UIC, dans les deux sens", () => {
  assert.equal(fareFamily("TGV INOUI"), "inoui");
  assert.equal(fareFamily("OUIGO TRAIN CLASSIQUE"), "ouigo");
  assert.equal(fareFamily("INTERCITES de nuit"), "intercites-nuit");
  assert.equal(fareFamily("Intercités de jour à réservation obligatoire"), "intercites");
  assert.equal(fareFamily("Train TER"), null);
  const table = buildFareTable([
    { carrier: "Intercités de jour à réservation obligatoire", from: "87586008", to: "87773002", min: 19, max: 55 },
    { carrier: "Intercités de jour sans réservation obligatoire", from: "87586008", to: "87773002", min: 15, max: 60 },
    { carrier: "TGV INOUI", from: "87686006", to: "87723197", min: Number.NaN, max: 90 },
  ]);
  assert.deepEqual(legFare(table, "INTERCITES", "StopArea:OCE87773002", "StopArea:OCE87586008"), [15, 60]);
  assert.equal(legFare(table, "Train TER", "StopArea:OCE87586008", "StopArea:OCE87773002"), undefined);
  assert.equal(legFare(table, "TGV INOUI", "StopArea:OCE87686006", "StopArea:OCE87723197"), undefined, "invalid prices are dropped");
});

test("TER : tarif 2025 exact quand la paire est connue, sinon estimation large ajustée sur les deux régions archivées", () => {
  const rows = parseTerCsv(readFileSync(new URL("../data/ter-fares-2025.csv", import.meta.url), "utf8"));
  assert.ok(rows.length > 3000);
  assert.deepEqual(new Set(rows.map((r) => r.region)), new Set(["PROVENCE-ALPES-COTE-AZUR", "PAYS DE LA LOIRE"]));
  const model = terModel(rows);
  // Fit recomputed from the committed file, each region weighted equally (values checked against an independent fit).
  assert.ok(Math.abs(model.base - 2.58) < 0.05 && Math.abs(model.perKm - 0.243) < 0.002, `${model.base} ${model.perKm}`);
  assert.ok(Math.abs(model.low - 0.70) < 0.02 && Math.abs(model.high - 1.35) < 0.02, `${model.low} ${model.high}`);
  // Avignon TGV → Salon: listed pair, either direction.
  assert.deepEqual(terFare(model, "StopArea:OCE87318964", "StopArea:OCE87753764", 40), { fare: [14.3, 14.3], source: "ter2025" });
  assert.deepEqual(terFare(model, "StopArea:OCE87753764", "StopArea:OCE87318964", 40).source, "ter2025");
  const est = terFare(model, "StopArea:OCE87000001", "StopArea:OCE87000002", 60);
  assert.equal(est.source, "estimate");
  assert.ok(est.fare[0] < est.fare[1] && est.fare[0] > 10 && est.fare[1] < 25, String(est.fare));
  assert.ok(Math.abs(crowKm({ lat: 48.8566, lon: 2.3522 }, { lat: 45.764, lon: 4.8357 }) - 392) < 2, "Paris–Lyon ≈ 392 km");
});

test("upcomingDates retourne les vendredis, samedis et dimanches à venir", () => {
  assert.deepEqual(upcomingDates("2026-09-15", 1, [5, 6, 0]), ["2026-09-18", "2026-09-19", "2026-09-20"]);
  assert.equal(upcomingDates("2026-09-15", 8, [5]).length, 8);
});

test("au-delà de l'horizon SNCF, le trajet est projeté depuis le dernier jour complet de même jour de semaine", async () => {
  const { timetableDate } = await import("../lib/travel/rail-client.ts");
  // Fridays 2027-04-16 (complete), 2027-04-23 (complete) and 2027-04-30 (partial, end of feed); Saturday 2027-04-24.
  const index = { generatedAt: "2026-11-11T05:00:00Z", dates: ["2027-04-16", "2027-04-23", "2027-04-24", "2027-04-30"], pairs: { "2027-04-16": 1000, "2027-04-23": 990, "2027-04-24": 800, "2027-04-30": 300 } };
  assert.deepEqual(timetableDate(index, "2027-04-23"), { date: "2027-04-23", projected: false });
  assert.deepEqual(timetableDate(index, "2027-09-17"), { date: "2027-04-23", projected: true }, "skips the partial last Friday");
  assert.deepEqual(timetableDate(index, "2027-06-12"), { date: "2027-04-24", projected: true });
  assert.equal(timetableDate(index, "2027-06-14"), null, "no Monday is published");
  assert.equal(timetableDate(index, "2027-11-19"), null, "more than a year after the build");
  assert.equal(timetableDate(index, "2027-04-20"), null, "inside the horizon but not computed");
});
