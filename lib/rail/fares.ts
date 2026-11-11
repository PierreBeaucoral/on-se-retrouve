// SNCF open fare data: full-price ranges (2nd class, "Tarif Normal") per station pair, published on
// ressources.data.sncf.com for TGV INOUI, OUIGO and Intercités. TER fares are set by the regions and
// are not published, so TER legs have no fare. These are list-price ranges, not booking prices.

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
