// CLI: download the SNCF open GTFS feed and write per-date rail tables to public/rail/.
// Usage: node scripts/build-rail.ts [--gtfs <path|url>] [--out public/rail] [--from YYYY-MM-DD]
//        [--weeks 8] [--days 5,6,0] [--profiles 06:00,...] [--dates 2026-09-18,...]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { places } from "../lib/travel/model.ts";
import { loadFeedFromZip } from "../lib/rail/gtfs.ts";
import { buildRailDay, DEFAULT_PROFILES, resolvePlaceStations, upcomingDates } from "../lib/rail/build.ts";

export const GTFS_URL = "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip";
const INTRA_CITY_MINUTES: Record<string, number> = { paris: 60, lyon: 40 };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function todayInParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function readGtfs(source: string): Promise<Buffer> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Téléchargement GTFS impossible : HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(source);
}

async function main(): Promise<void> {
  const source = arg("gtfs", GTFS_URL);
  const out = arg("out", "public/rail");
  const from = arg("from", todayInParis());
  const weeks = Number(arg("weeks", "8"));
  const weekdays = arg("days", "5,6,0").split(",").map(Number);
  const profiles = arg("profiles", DEFAULT_PROFILES.join(",")).split(",");
  const explicitDates = arg("dates", "");
  const started = Date.now();

  console.log(`GTFS : ${source}`);
  const feed = loadFeedFromZip(await readGtfs(source));
  console.log(`Feed ${feed.feedVersion} (${feed.feedStart} → ${feed.feedEnd}) : ${feed.trips.length} trajets ferroviaires, ${feed.stations.size} gares.`);
  const placeStations = resolvePlaceStations(feed, places);
  for (const p of places) {
    const stations = placeStations.get(p.id);
    console.log(`  ${p.name.padEnd(18)} → ${stations ? stations.map((id) => feed.stations.get(id)?.name).join(" · ") : "(aucune gare desservie)"}`);
  }
  const inRange = (d: string) => { const c = d.replace(/-/g, ""); return c >= feed.feedStart && c <= feed.feedEnd; };
  const dates = (explicitDates ? explicitDates.split(",") : upcomingDates(from, weeks, weekdays)).filter(inRange);
  if (!dates.length) throw new Error("Aucune date à calculer dans la période couverte par le GTFS.");
  await mkdir(out, { recursive: true });
  const summary: { date: string; pairs: number }[] = [];
  for (const date of dates) {
    const t = Date.now();
    const day = buildRailDay(feed, date, placeStations, { profiles, intraCityMinutes: INTRA_CITY_MINUTES });
    const pairs = Object.values(day.legs).reduce((n, table) => n + Object.keys(table).length, 0);
    await writeFile(`${out}/${date}.json`, JSON.stringify({ ...day, feedVersion: feed.feedVersion, generatedAt: new Date().toISOString() }));
    summary.push({ date, pairs });
    console.log(`${date} : ${pairs} trajets sur ${profiles.length} profils (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  const index = {
    generatedAt: new Date().toISOString(),
    feedVersion: feed.feedVersion,
    feedStart: feed.feedStart,
    feedEnd: feed.feedEnd,
    profiles,
    windowMinutes: 360,
    minTransferMinutes: 10,
    dates: summary.map((s) => s.date),
    stations: Object.fromEntries([...placeStations].map(([id, stations]) => [id, stations.map((s) => feed.stations.get(s)?.name ?? s)])),
  };
  await writeFile(`${out}/index.json`, JSON.stringify(index, null, 1));
  console.log(`Terminé en ${((Date.now() - started) / 1000).toFixed(0)} s → ${out}/index.json`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
