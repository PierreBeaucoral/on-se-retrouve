// Train durations from the precomputed tables in public/rail/ (built weekly from the SNCF open GTFS
// feed by scripts/build-rail.ts). No API key, no server: the browser fetches one JSON per date.
import type { Leg, Segment } from "./model.ts";
import type { RailOriginFile } from "../rail/build.ts";
// public/rail/<date>/<origin>.json: destinations reachable from one origin on one date (format: RailOriginFile).
export type RailOriginDay = RailOriginFile;

export type RailIndex = { generatedAt: string; feedVersion: string; feedStart: string; feedEnd: string; range?: [string, string]; minTransferMinutes: number; maxTransfers?: number; fares?: { generatedAt: string; pairs: number } | null; dates: string[]; pairs?: Record<string, number>; stations: Record<string, string[]> };

const base = () => `${import.meta.env.BASE_URL}rail/`;
const dayCache = new Map<string, Promise<RailOriginDay | null>>();
let indexCache: Promise<RailIndex | null> | undefined;

export function loadRailIndex(): Promise<RailIndex | null> {
  indexCache ??= fetch(`${base()}index.json`, { cache: "no-cache" }).then(async (r) => (r.ok ? ((await r.json()) as RailIndex) : null)).catch(() => null);
  return indexCache;
}

function loadRailDay(date: string, origin: string): Promise<RailOriginDay | null> {
  const key = `${date}/${origin}`;
  let pending = dayCache.get(key);
  if (!pending) {
    pending = fetch(`${base()}${key}.json`).then(async (r) => (r.ok ? ((await r.json()) as RailOriginDay) : null)).catch(() => null);
    dayCache.set(key, pending);
  }
  return pending;
}

const clock = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };

// Journeys of one pair are stored by departure, each arriving earlier than any later-leaving one, so the first
// journey leaving at or after the requested time is the one that arrives first. Returns its index, or -1.
export function pickJourney(departures: number[], time: string): number {
  const t = clock(time);
  return departures.findIndex((d) => d >= t);
}

export const formatMinutes = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}${m >= 1440 ? " (+1 j)" : ""}`;

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
export const PROJECTION_DAYS = 366;

// Timetable date to read for a requested date. Published dates are used as is. Beyond the SNCF horizon
// (about five months), and up to a year after the tables were built, the trip is projected from the most
// recent published day with the same weekday whose timetable is complete (at least 95 % of the busiest such
// day: the last weeks of a feed are often still partial). Returns null when neither applies.
export function timetableDate(index: Pick<RailIndex, "dates" | "pairs" | "generatedAt">, date: string): { date: string; projected: boolean } | null {
  if (index.dates.includes(date)) return { date, projected: false };
  const last = index.dates[index.dates.length - 1];
  if (!last || date <= last || dayNumber(date) - dayNumber(index.generatedAt.slice(0, 10)) > PROJECTION_DAYS) return null;
  const same = index.dates.filter((d) => weekday(d) === weekday(date));
  if (!same.length) return null;
  const size = (d: string) => index.pairs?.[d] ?? 0;
  const busiest = Math.max(...same.map(size));
  const reference = [...same].reverse().find((d) => size(d) >= 0.95 * busiest) ?? same[same.length - 1];
  return { date: reference, projected: true };
}

export async function railLeg(origin: string, destination: string, requested: string): Promise<Leg> {
  const [date, time] = requested.split("T");
  const index = await loadRailIndex();
  if (!index) throw new Error("Horaires précalculés indisponibles.");
  const source = timetableDate(index, date);
  if (!source) throw new Error(`Aucun horaire précalculé ni projetable pour le ${frDate(date)} : saisissez la durée.`);
  const day = await loadRailDay(source.date, origin);
  if (!day) throw new Error("Aucune gare connue pour cette ville de départ.");
  // Tables built before every train of the day was kept had another layout; they disappear on the next refresh.
  if (!Array.isArray(day.segments) || !day.range) throw new Error("Horaires en cours de mise à jour : rechargez la page.");
  const [first, last] = day.range;
  const options = (day.legs[destination] ?? []).map((j) => day.journeys[j].map((s) => day.segments[s]));
  const k = pickJourney(options.map((j) => j[0][2]), time);
  const journey = options[k];
  if (!journey) throw new Error(time > last
    ? `Seuls les trains partant entre ${first} et ${last} sont calculés : choisissez une heure plus tôt ou saisissez la durée.`
    : `Aucun train après ${time} ce jour-là (${index.maxTransfers ?? 3} correspondances max).`);
  const name = (i: number) => day.stations[i] ?? "?";
  const segments: Segment[] = journey.map(([from, to, d, a, brand, number, min, max, source]) => ({ from: name(from), to: name(to), departure: formatMinutes(d), arrival: formatMinutes(a), brand: day.brands[brand] ?? "", number, ...(min !== undefined && max !== undefined ? { fare: [min, max] as [number, number], ...(source ? { fareSource: source === 2 ? "ter2025" as const : "estimate" as const } : {}) } : {}) }));
  const dep = journey[0][2], arr = journey[journey.length - 1][3];
  return {
    minutes: arr - dep,
    source: source.projected
      ? `Projection d'après les horaires SNCF du ${frDate(source.date)} (même jour de la semaine, au-delà des horaires publiés), train arrivant le plus tôt parmi les départs dès ${time}`
      : `Horaires théoriques SNCF du ${frDate(index.feedVersion)}, train arrivant le plus tôt parmi les départs dès ${time}`,
    departure: `${date}T${formatMinutes(dep)}`,
    arrival: `${date}T${formatMinutes(arr)}`,
    transfers: journey.length - 1,
    via: [name(journey[0][0]), ...journey.map((t) => name(t[1]))],
    segments,
    projected: source.projected,
    retrievedAt: index.generatedAt,
  };
}

const frDate = (date: string) => date.split("-").reverse().join("/");
