// Car durations from the IGN Géoplateforme routing API, called directly from the browser
// (the API answers cross-origin requests). When IGN fails, the public OSRM demo server
// (OpenStreetMap road graph) answers instead. Results are cached in localStorage: seven days
// for IGN, one day for OSRM so IGN takes over again once it is back.
import { placeOf, validMinutes, type Leg } from "./model.ts";

export const IGN_URL = "https://data.geopf.fr/navigation/itineraire";
const CACHE_KEY = "retrouve.car.v2"; // v2: legs carry the road distance
const CACHE_TTL = 7 * 24 * 3600_000;
export const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const OSRM_TTL = 24 * 3600_000;
const IGN_INTERVAL = 300; // ms between requests, to stay polite with the public APIs
const OSRM_INTERVAL = 1100; // the OSRM demo server allows one request per second
const IGN_RETRY = 10 * 60_000; // after an IGN failure, go straight to OSRM for ten minutes
const TIMEOUT = 20_000;
let ignDownUntil = 0;

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

// Road distance in kilometres (one decimal), or null when missing or implausible.
export function parseIgnDistance(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const { distance, distanceUnit } = payload as { distance?: unknown; distanceUnit?: unknown };
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0) return null;
  const km = distanceUnit === "kilometer" ? distance : distanceUnit === "meter" ? distance / 1000 : null;
  return km !== null && km <= 3000 ? Math.round(km * 10) / 10 : null;
}

// OSRM answer: duration in seconds and distance in metres of the first route.
export function parseOsrm(payload: unknown): { minutes: number; km: number | null } | null {
  const data = payload as { code?: unknown; routes?: { duration?: unknown; distance?: unknown }[] } | null;
  const route = data?.code === "Ok" && Array.isArray(data.routes) ? data.routes[0] : undefined;
  if (!route) return null;
  const minutes = parseIgnDuration({ duration: route.duration, timeUnit: "second" });
  return minutes === null ? null : { minutes, km: parseIgnDistance({ distance: route.distance, distanceUnit: "meter" }) };
}

type CacheStore = Record<string, { expires: number; leg: Leg }>;

function readCache(): CacheStore {
  try { const raw = localStorage.getItem(CACHE_KEY); const parsed = raw ? (JSON.parse(raw) as CacheStore) : {}; return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}

function writeCache(store: CacheStore): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch { /* storage unavailable (private mode, iframe): keep going without cache */ }
}

async function throttled<T>(interval: number, fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const delay = Math.max(0, interval - (Date.now() - lastRequest));
    if (delay) await new Promise((r) => setTimeout(r, delay));
    lastRequest = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

function getJson(url: string, interval: number, service: string, signal?: AbortSignal): Promise<unknown> {
  return throttled(interval, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Service ${service} indisponible (HTTP ${response.status}).`);
      return (await response.json()) as unknown;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
  });
}

const km$ = (km: number | null) => (km !== null ? `, ${km.toLocaleString("fr-FR")} km` : "");

export async function carLeg(origin: string, destination: string, signal?: AbortSignal): Promise<Leg> {
  const from = placeOf(origin); const to = placeOf(destination);
  if (!from || !to) throw new Error("Origine ou destination inconnue.");
  const key = `${origin}|${destination}`;
  const cache = readCache();
  const hit = cache[key];
  if (hit && hit.expires > Date.now() && validMinutes(hit.leg?.minutes)) return hit.leg;
  let leg: Leg | null = null, ttl = CACHE_TTL, ignError = "";
  if (Date.now() >= ignDownUntil) {
    try {
      const payload = await getJson(`${IGN_URL}?resource=bdtopo-osrm&start=${from.lon},${from.lat}&end=${to.lon},${to.lat}&profile=car&optimization=fastest&getSteps=false&getGeometry=false&timeUnit=second&distanceUnit=kilometer`, IGN_INTERVAL, "IGN", signal);
      const minutes = parseIgnDuration(payload);
      if (minutes === null) throw new Error("Durée routière IGN indisponible.");
      const km = parseIgnDistance(payload);
      leg = { minutes, ...(km !== null ? { km } : {}), source: `IGN Géoplateforme${km$(km)}`, retrievedAt: new Date().toISOString() };
    } catch (e) {
      if (signal?.aborted) throw e;
      ignError = e instanceof Error ? e.message : String(e);
      ignDownUntil = Date.now() + IGN_RETRY;
    }
  }
  if (!leg) {
    let osrm: ReturnType<typeof parseOsrm> = null;
    try { osrm = parseOsrm(await getJson(`${OSRM_URL}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`, OSRM_INTERVAL, "OSRM", signal)); }
    catch (e) { if (signal?.aborted) throw e; }
    // The message keeps "IGN" so the page shows its "car routing is down" alert.
    if (!osrm) throw new Error(`Calcul routier indisponible (IGN puis OSRM). ${ignError}`.trim());
    leg = { minutes: osrm.minutes, ...(osrm.km !== null ? { km: osrm.km } : {}), source: `OpenStreetMap (OSRM, secours IGN)${km$(osrm.km)}`, retrievedAt: new Date().toISOString() };
    ttl = OSRM_TTL;
  }
  const fresh = readCache();
  const now = Date.now();
  for (const k of Object.keys(fresh)) if (!(fresh[k]?.expires > now)) delete fresh[k];
  fresh[key] = { expires: now + ttl, leg };
  writeCache(fresh);
  return leg;
}
