// SNCF open fare data: full-price ranges (2nd class, "Tarif Normal") per station pair, published on
// ressources.data.sncf.com for TGV INOUI, OUIGO and Intercités. TER fares are set by the regions and
// are no longer published, so TER legs get a distance-based estimate (terFareEstimate). These are
// list-price ranges, not booking prices.

export type FareRange = [number, number];
export type FareRecord = { carrier: string; from: string; to: string; min: number; max: number }; // from/to: UIC codes
export type FareTable = Map<string, FareRange>; // "<family>|<uic>|<uic>" -> range

const API = "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets";
export const FARE_SOURCES = {
  tgv: `${API}/tarifs-tgv-inoui-ouigo/exports/json?where=${encodeURIComponent('classe="2" and profil_tarifaire="Tarif Normal"')}`,
  intercites: `${API}/tarifs-intercites/exports/json?where=${encodeURIComponent('classe="2" and profil_tarifaire="Tarif Normal" and type_place="assise"')}`,
};

// Both the GTFS brand ("TGV INOUI", "INTERCITES de nuit"…) and the fare carrier ("Intercités de nuit à
// réservation obligatoire", "OUIGO TRAIN CLASSIQUE"…) reduce to one fare family; null = no open fare.
export function fareFamily(name: string): string | null {
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (n.includes("ouigo")) return "ouigo";
  if (n.includes("inoui")) return "inoui";
  if (n.includes("intercites")) return n.includes("nuit") ? "intercites-nuit" : "intercites";
  return null;
}

export const uicOf = (stationId: string): string | null => /(\d{8})$/.exec(stationId)?.[1] ?? null;

export function buildFareTable(records: FareRecord[]): FareTable {
  const table: FareTable = new Map();
  for (const r of records) {
    const family = fareFamily(r.carrier);
    if (!family || !r.from || !r.to || !Number.isFinite(r.min) || !Number.isFinite(r.max)) continue;
    // Several offers can share a pair (Intercités with and without reservation): keep the widest range.
    const key = `${family}|${r.from}|${r.to}`;
    const prev = table.get(key);
    table.set(key, prev ? [Math.min(prev[0], r.min), Math.max(prev[1], r.max)] : [r.min, r.max]);
  }
  return table;
}

// Fare of one train between two GTFS stations, looked up in either direction.
export function legFare(table: FareTable, brand: string, fromStation: string, toStation: string): FareRange | undefined {
  const family = fareFamily(brand);
  const a = uicOf(fromStation), b = uicOf(toStation);
  if (!family || !a || !b) return undefined;
  return table.get(`${family}|${a}|${b}`) ?? table.get(`${family}|${b}|${a}`);
}

// Download both datasets. Throws on HTTP errors; the caller decides whether fares are optional.
export async function fetchFareRecords(): Promise<FareRecord[]> {
  const get = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Tarifs SNCF indisponibles : HTTP ${r.status}`);
    return (await r.json()) as Record<string, unknown>[];
  };
  const [tgv, ic] = await Promise.all([get(FARE_SOURCES.tgv), get(FARE_SOURCES.intercites)]);
  return [
    ...tgv.map((r) => ({ carrier: String(r.transporteur), from: String(r.gare_origine_code_uic), to: String(r.gare_destination_code_uic), min: Number(r.prix_minimum), max: Number(r.prix_maximum) })),
    ...ic.map((r) => ({ carrier: String(r.transporteur), from: String(r.origine_uic8), to: String(r.destination_uic8), min: Number(r.prix_min), max: Number(r.prix_max) })),
  ];
}

// TER fares. SNCF withdrew its per-route TER fare datasets in late 2025 and the regions publish no train
// fares. data/ter-fares-2025.csv keeps the last published "Tarif normal" fares that survive in the Web
// Archive: Provence-Alpes-Côte d'Azur and Pays de la Loire (2 of 11 regions), with straight-line distances.
// A pair listed there gets its 2025 fare. Any other TER leg gets a wide estimate: a straight-line distance
// fit pooled over both regions (each region weighted equally), reported as the 5th–95th percentile range of
// observed price / fit. Regions price differently, so both cases are always labelled.
export type TerRow = { region: string; from: string; to: string; km: number | null; price: number };
export type TerModel = { exact: Map<string, number>; base: number; perKm: number; low: number; high: number };
export type TerFare = { fare: FareRange; source: "ter2025" | "estimate" };

export const isRegionalBrand = (brand: string) => /\bTER\b|TramTrain/i.test(brand);
const round1 = (x: number) => Math.round(x * 10) / 10;

export function crowKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function parseTerCsv(text: string): TerRow[] {
  return text.trim().split(/\r?\n/).slice(1).map((line) => {
    const [region, from, to, km, price] = line.split(",");
    return { region, from, to, km: km ? Number(km) : null, price: Number(price) };
  }).filter((r) => r.from && r.to && Number.isFinite(r.price) && r.price > 0);
}

export function terModel(rows: TerRow[]): TerModel {
  const exact = new Map<string, number>();
  for (const r of rows) { exact.set(`${r.from}|${r.to}`, r.price); if (!exact.has(`${r.to}|${r.from}`)) exact.set(`${r.to}|${r.from}`, r.price); }
  const pts = rows.filter((r) => r.km !== null && r.km > 0);
  const perRegion = new Map<string, number>();
  for (const r of pts) perRegion.set(r.region, (perRegion.get(r.region) ?? 0) + 1);
  const w = (r: TerRow) => 1 / perRegion.get(r.region)!;
  const W = pts.reduce((n, r) => n + w(r), 0);
  const mx = pts.reduce((n, r) => n + w(r) * r.km!, 0) / W, my = pts.reduce((n, r) => n + w(r) * r.price, 0) / W;
  const perKm = pts.reduce((n, r) => n + w(r) * (r.km! - mx) * (r.price - my), 0) / pts.reduce((n, r) => n + w(r) * (r.km! - mx) ** 2, 0);
  const base = my - perKm * mx;
  const ratios = pts.map((r) => r.price / (base + perKm * r.km!)).sort((a, b) => a - b);
  const q = (p: number) => ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))];
  return { exact, base, perKm, low: q(0.05), high: q(0.95) };
}

export function terFare(model: TerModel, fromStation: string, toStation: string, km: number): TerFare {
  const a = uicOf(fromStation), b = uicOf(toStation);
  const known = a && b ? model.exact.get(`${a}|${b}`) : undefined;
  if (known !== undefined) return { fare: [known, known], source: "ter2025" };
  const price = model.base + model.perKm * km;
  return { fare: [round1(price * model.low), round1(price * model.high)], source: "estimate" };
}
