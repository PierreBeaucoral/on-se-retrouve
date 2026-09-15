// GTFS loading and station mapping for the SNCF open feed.
// Pure functions over text: the build script reads the zip, tests pass synthetic CSV.
import { readZipText } from "./zip.ts";

export type Station = { id: string; name: string; lat: number; lon: number };
export type StopTime = { station: string; arr: number; dep: number; board: boolean; alight: boolean };
export type Trip = { id: string; serviceId: string; routeId: string; stops: StopTime[] };
export type Feed = {
  stations: Map<string, Station>;
  trips: Trip[];
  serviceDates: Map<string, Set<string>>; // service_id -> set of YYYYMMDD active dates
  feedVersion: string;
  feedStart: string;
  feedEnd: string;
};
export type FeedFiles = Record<"stops.txt" | "routes.txt" | "trips.txt" | "stop_times.txt" | "calendar_dates.txt" | "feed_info.txt", string>;

const RAIL_ROUTE_TYPES = new Set(["2"]); // GTFS route_type 2 = rail; 3 = bus/coach; 0 = tram.
// SNCF encodes the commercial mode in stop point ids ("StopPoint:OCECar TER-…"); coaches also
// appear under rail routes, so trips touching a coach stop point are dropped as well.
const COACH_STOP_PATTERN = /^StopPoint:OCECar\b/i;
// Stations that carry a city name but are not where a family would meet a train.
export const EXCLUDED_STATION_PATTERNS = [/gare routi/i, /routiere/i, /point rencontre/i, /saint-exup/i];

// RFC 4180-style CSV parser supporting quoted fields and embedded newlines.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; rows.push(row); row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== "")).map((r) => Object.fromEntries(header.map((h, k) => [h.trim(), r[k] ?? ""])));
}

// GTFS times may exceed 24:00:00 for services running past midnight.
export function parseGtfsTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function loadFeedFromZip(buffer: Buffer): Feed {
  const files = Object.fromEntries((["stops.txt", "routes.txt", "trips.txt", "stop_times.txt", "calendar_dates.txt", "feed_info.txt"] as const).map((name) => [name, readZipText(buffer, name)])) as FeedFiles;
  return loadFeed(files);
}

export function loadFeed(files: FeedFiles): Feed {
  const stops = parseCsv(files["stops.txt"]);
  const parentOf = new Map<string, string>();
  const stations = new Map<string, Station>();
  for (const s of stops) {
    if (s.location_type === "1") stations.set(s.stop_id, { id: s.stop_id, name: s.stop_name, lat: Number(s.stop_lat), lon: Number(s.stop_lon) });
  }
  for (const s of stops) {
    if (s.location_type === "1") continue;
    const parent = s.parent_station && stations.has(s.parent_station) ? s.parent_station : s.stop_id;
    if (!stations.has(parent)) stations.set(parent, { id: parent, name: s.stop_name, lat: Number(s.stop_lat), lon: Number(s.stop_lon) });
    parentOf.set(s.stop_id, parent);
  }
  const railRoutes = new Set(parseCsv(files["routes.txt"]).filter((r) => RAIL_ROUTE_TYPES.has(r.route_type)).map((r) => r.route_id));
  const tripMeta = new Map<string, { serviceId: string; routeId: string }>();
  for (const t of parseCsv(files["trips.txt"])) if (railRoutes.has(t.route_id)) tripMeta.set(t.trip_id, { serviceId: t.service_id, routeId: t.route_id });
  const stopsByTrip = new Map<string, (StopTime & { seq: number })[]>();
  const coachTrips = new Set<string>();
  for (const st of parseCsv(files["stop_times.txt"])) {
    if (!tripMeta.has(st.trip_id)) continue;
    if (COACH_STOP_PATTERN.test(st.stop_id)) { coachTrips.add(st.trip_id); continue; }
    const arr = parseGtfsTime(st.arrival_time || st.departure_time);
    const dep = parseGtfsTime(st.departure_time || st.arrival_time);
    const station = parentOf.get(st.stop_id) ?? st.stop_id;
    if (arr === null || dep === null || !stations.has(station)) continue;
    const list = stopsByTrip.get(st.trip_id) ?? [];
    list.push({ station, arr, dep: Math.max(arr, dep), board: st.pickup_type !== "1", alight: st.drop_off_type !== "1", seq: Number(st.stop_sequence) });
    stopsByTrip.set(st.trip_id, list);
  }
  const trips: Trip[] = [];
  for (const [id, list] of stopsByTrip) {
    if (coachTrips.has(id)) continue;
    list.sort((a, b) => a.seq - b.seq);
    if (list.length < 2) continue;
    const meta = tripMeta.get(id)!;
    trips.push({ id, serviceId: meta.serviceId, routeId: meta.routeId, stops: list.map(({ seq: _seq, ...rest }) => rest) });
  }
  const serviceDates = new Map<string, Set<string>>();
  for (const c of parseCsv(files["calendar_dates.txt"])) {
    if (c.exception_type !== "1") continue;
    const set = serviceDates.get(c.service_id) ?? new Set<string>();
    set.add(c.date); serviceDates.set(c.service_id, set);
  }
  const info = parseCsv(files["feed_info.txt"])[0] ?? {};
  return { stations, trips, serviceDates, feedVersion: info.feed_version ?? "", feedStart: info.feed_start_date ?? "", feedEnd: info.feed_end_date ?? "" };
}

export function tripsOnDate(feed: Feed, yyyymmdd: string): Trip[] {
  return feed.trips.filter((t) => feed.serviceDates.get(t.serviceId)?.has(yyyymmdd));
}

export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Map a place name to the stations of that city: exact name, or name followed by a space/hyphen
// (e.g. "Paris" -> "Paris Gare de Lyon", "Lyon" -> "Lyon Part Dieu"). Only stations actually served
// by rail trips are kept, so bus stops sharing the city name are ignored.
export function stationsForPlace(feed: Feed, placeName: string, servedStations: Set<string>, overrides: Record<string, string[]> = {}): Station[] {
  const override = overrides[placeName];
  const target = normalizeName(placeName);
  return [...feed.stations.values()].filter((s) => {
    if (!servedStations.has(s.id)) return false;
    if (EXCLUDED_STATION_PATTERNS.some((re) => re.test(normalizeName(s.name)))) return false;
    const n = normalizeName(s.name);
    if (override) return override.some((o) => normalizeName(o) === n);
    return n === target || n.startsWith(target + " ") || n.startsWith(target + "-");
  });
}

export function servedStations(trips: Trip[]): Set<string> {
  const set = new Set<string>();
  for (const t of trips) for (const s of t.stops) set.add(s.station);
  return set;
}
