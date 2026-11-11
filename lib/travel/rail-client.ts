// Train durations from the precomputed tables in public/rail/ (built weekly from the SNCF open GTFS
// feed by scripts/build-rail.ts). No API key, no server: the browser fetches one JSON per date.
import type { Leg, Segment } from "./model.ts";
import type { RailOriginFile } from "../rail/build.ts";
// public/rail/<date>/<origin>.json: destinations reachable from one origin on one date (format: RailOriginFile).
export type RailOriginDay = RailOriginFile;

export type RailIndex = { generatedAt: string; feedVersion: string; feedStart: string; feedEnd: string; profiles: string[]; windowMinutes: number; minTransferMinutes: number; maxTransfers?: number; fares?: { generatedAt: string; pairs: number } | null; dates: string[]; pairs?: Record<string, number>; stations: Record<string, string[]> };

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

// Departures are precomputed for a few daily profiles; use the first profile at or after the requested
// time so that every reported train leaves after the time the user chose.
export function pickProfile(profiles: string[], time: string): string | null {
  return [...profiles].sort().find((p) => p >= time) ?? null;
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
  // Tables built before per-train details had another layout; they disappear on the next refresh.
  if (!Array.isArray(day.journeys)) throw new Error("Horaires en cours de mise à jour : rechargez la page.");
  const profile = pickProfile(day.profiles, time);
  if (!profile) throw new Error(`Horaires calculés jusqu'à ${day.profiles[day.profiles.length - 1]} : saisissez la durée.`);
  const journey = day.journeys[day.legs[destination]?.[day.profiles.indexOf(profile)] ?? -1];
  if (!journey) throw new Error(`Aucun train trouvé dans les ${Math.round(index.windowMinutes / 60)} h après ${profile} (${index.maxTransfers ?? 3} correspondances max).`);
  const name = (i: number) => day.stations[i] ?? "?";
  const segments: Segment[] = journey.map(([from, to, d, a, brand, number, min, max, source]) => ({ from: name(from), to: name(to), departure: formatMinutes(d), arrival: formatMinutes(a), brand: day.brands[brand] ?? "", number, ...(min !== undefined && max !== undefined ? { fare: [min, max] as [number, number], ...(source ? { fareSource: source === 2 ? "ter2025" as const : "estimate" as const } : {}) } : {}) }));
  const dep = journey[0][2], arr = journey[journey.length - 1][3];
  return {
    minutes: arr - dep,
    source: source.projected
      ? `Projection d'après les horaires SNCF du ${frDate(source.date)} (même jour de la semaine, au-delà des horaires publiés), départs dès ${profile}`
      : `Horaires théoriques SNCF du ${frDate(index.feedVersion)}, départs dès ${profile}`,
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
