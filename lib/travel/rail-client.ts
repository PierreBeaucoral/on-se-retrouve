// Train durations from the precomputed tables in public/rail/ (built weekly from the SNCF open GTFS
// feed by scripts/build-rail.ts). No API key, no server: the browser fetches one JSON per date.
import type { Leg } from "./model.ts";
// public/rail/<date>/<origin>.json: destinations reachable from one origin on one date.
// Each entry is packed as [minutes, departure, arrival, transfers, stationIndices].
export type PackedEntry = [number, number, number, number, number[]];
export type RailOriginDay = { date: string; origin: string; profiles: string[]; stations: string[]; legs: Record<string, Record<string, PackedEntry>> };

export type RailIndex = { generatedAt: string; feedVersion: string; feedStart: string; feedEnd: string; profiles: string[]; windowMinutes: number; minTransferMinutes: number; maxTransfers?: number; dates: string[]; stations: Record<string, string[]> };

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

export async function railLeg(origin: string, destination: string, requested: string): Promise<Leg> {
  const [date, time] = requested.split("T");
  const index = await loadRailIndex();
  if (!index) throw new Error("Horaires précalculés indisponibles.");
  if (!index.dates.includes(date)) throw new Error(`Aucun horaire précalculé pour le ${date.split("-").reverse().join("/")} : saisissez la durée.`);
  const day = await loadRailDay(date, origin);
  if (!day) throw new Error("Aucune gare connue pour cette ville de départ.");
  const profile = pickProfile(day.profiles, time);
  if (!profile) throw new Error(`Horaires calculés jusqu'à ${day.profiles[day.profiles.length - 1]} : saisissez la durée.`);
  const entry = day.legs[profile]?.[destination];
  if (!entry) throw new Error(`Aucun train trouvé dans les ${Math.round(index.windowMinutes / 60)} h après ${profile} (${index.maxTransfers ?? 3} correspondances max).`);
  const [minutes, dep, arr, transfers, via] = entry;
  return {
    minutes,
    source: `SNCF · horaires théoriques (GTFS ${index.feedVersion}) · départs dès ${profile}`,
    departure: `${date}T${formatMinutes(dep)}`,
    arrival: `${date}T${formatMinutes(arr)}`,
    transfers,
    via: via.map((i) => day.stations[i] ?? "?"),
    retrievedAt: index.generatedAt,
  };
}
