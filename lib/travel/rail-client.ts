// Train durations from the precomputed tables in public/rail/ (built weekly from the SNCF open GTFS
// feed by scripts/build-rail.ts). No API key, no server: the browser fetches one JSON per date.
import type { Leg } from "./model.ts";
import type { RailDay } from "../rail/build.ts";

export type RailIndex = { generatedAt: string; feedVersion: string; feedStart: string; feedEnd: string; profiles: string[]; windowMinutes: number; minTransferMinutes: number; maxTransfers?: number; dates: string[]; stations: Record<string, string[]> };

const base = () => `${import.meta.env.BASE_URL}rail/`;
const dayCache = new Map<string, Promise<RailDay | null>>();
let indexCache: Promise<RailIndex | null> | undefined;

export function loadRailIndex(): Promise<RailIndex | null> {
  indexCache ??= fetch(`${base()}index.json`, { cache: "no-cache" }).then(async (r) => (r.ok ? ((await r.json()) as RailIndex) : null)).catch(() => null);
  return indexCache;
}

function loadRailDay(date: string): Promise<RailDay | null> {
  let pending = dayCache.get(date);
  if (!pending) {
    pending = fetch(`${base()}${date}.json`).then(async (r) => (r.ok ? ((await r.json()) as RailDay) : null)).catch(() => null);
    dayCache.set(date, pending);
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
  const day = await loadRailDay(date);
  if (!day) throw new Error("Horaires de ce jour introuvables.");
  const profile = pickProfile(day.profiles, time);
  if (!profile) throw new Error(`Horaires calculés jusqu'à ${day.profiles[day.profiles.length - 1]} : saisissez la durée.`);
  const entry = day.legs[profile]?.[`${origin}|${destination}`];
  if (!entry) throw new Error(`Aucun train trouvé dans les ${Math.round(index.windowMinutes / 60)} h après ${profile} (${index.maxTransfers ?? 3} correspondances max).`);
  return {
    minutes: entry.m,
    source: `SNCF · horaires théoriques (GTFS ${index.feedVersion}) · départs dès ${profile}`,
    departure: `${date}T${formatMinutes(entry.d)}`,
    arrival: `${date}T${formatMinutes(entry.a)}`,
    transfers: entry.t,
    via: entry.s.map((i) => day.stations[i] ?? "?"),
    retrievedAt: index.generatedAt,
  };
}
