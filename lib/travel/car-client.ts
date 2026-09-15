// Car durations from the IGN Géoplateforme routing API, called directly from the browser
// (the API answers cross-origin requests). Results are cached for seven days in localStorage.
import { places, validMinutes, type Leg } from "./model.ts";

export const IGN_URL = "https://data.geopf.fr/navigation/itineraire";
const CACHE_KEY = "retrouve.car.v1";
const CACHE_TTL = 7 * 24 * 3600_000;
const MIN_INTERVAL = 300; // ms between requests, to stay polite with the public API
const TIMEOUT = 20_000;

const placeById = new Map(places.map((p) => [p.id, p]));
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

export function parseIgnDuration(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { duration?: unknown; timeUnit?: unknown };
  if (data.timeUnit !== "second") return null;
  const raw = data.duration;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  const minutes = Math.round(raw / 60);
  return validMinutes(minutes) ? minutes : null;
}

type CacheStore = Record<string, { expires: number; leg: Leg }>;

function readCache(): CacheStore {
  try { const raw = localStorage.getItem(CACHE_KEY); const parsed = raw ? (JSON.parse(raw) as CacheStore) : {}; return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}

function writeCache(store: CacheStore): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch { /* storage unavailable (private mode, iframe): keep going without cache */ }
}

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const delay = Math.max(0, MIN_INTERVAL - (Date.now() - lastRequest));
    if (delay) await new Promise((r) => setTimeout(r, delay));
    lastRequest = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function carLeg(origin: string, destination: string, signal?: AbortSignal): Promise<Leg> {
  const from = placeById.get(origin); const to = placeById.get(destination);
  if (!from || !to) throw new Error("Origine ou destination inconnue.");
  const key = `${origin}|${destination}`;
  const cache = readCache();
  const hit = cache[key];
  if (hit && hit.expires > Date.now() && validMinutes(hit.leg?.minutes)) return hit.leg;
  const url = `${IGN_URL}?resource=bdtopo-osrm&start=${from.lon},${from.lat}&end=${to.lon},${to.lat}&profile=car&optimization=fastest&getSteps=false&getGeometry=false&timeUnit=second`;
  const payload = await throttled(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Service IGN indisponible (HTTP ${response.status}).`);
      return (await response.json()) as unknown;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
  });
  const minutes = parseIgnDuration(payload);
  if (minutes === null) throw new Error("Durée routière indisponible.");
  const leg: Leg = { minutes, source: "IGN Géoplateforme", retrievedAt: new Date().toISOString() };
  const fresh = readCache();
  const now = Date.now();
  for (const k of Object.keys(fresh)) if (!(fresh[k]?.expires > now)) delete fresh[k];
  fresh[key] = { expires: now + CACHE_TTL, leg };
  writeCache(fresh);
  return leg;
}
