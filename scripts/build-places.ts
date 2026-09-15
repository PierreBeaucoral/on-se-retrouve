// Generates lib/travel/places.ts: the cities the app can compare, with their SNCF stations.
// The list below is curated (prefectures and main towns of metropolitan France); station names
// and coordinates come from the GTFS feed. Usage: node scripts/build-places.ts [--gtfs <zip|url>]
// Legacy ids and coordinates of the original cities are preserved so saved preferences keep working.
import { readFile, writeFile } from "node:fs/promises";
import { loadFeedFromZip, normalizeName, servedStations, stationsForPlace, type Feed } from "../lib/rail/gtfs.ts";

const GTFS_URL = "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip";

// Original cities: id, name, lon, lat (kept verbatim). Sainte-Verge has no station on purpose.
const LEGACY: [string, string, number, number][] = [
  ["sainte-verge", "Sainte-Verge", -0.209, 47.008], ["thouars", "Thouars", -0.215, 46.977],
  ["clermont", "Clermont-Ferrand", 3.087, 45.777], ["lyon", "Lyon", 4.8357, 45.764],
  ["mulhouse", "Mulhouse", 7.339, 47.748], ["paris", "Paris", 2.3522, 48.8566],
  ["bourges", "Bourges", 2.3988, 47.081], ["nevers", "Nevers", 3.157, 46.99],
  ["dijon", "Dijon", 5.0415, 47.322], ["tours", "Tours", 0.6848, 47.394],
  ["orleans", "Orléans", 1.909, 47.903], ["auxerre", "Auxerre", 3.568, 47.798],
  ["macon", "Mâcon", 4.832, 46.307], ["chalon", "Chalon-sur-Saône", 4.853, 46.781],
  ["beaune", "Beaune", 4.838, 47.026], ["vichy", "Vichy", 3.426, 46.128],
  ["moulins", "Moulins", 3.333, 46.566], ["montlucon", "Montluçon", 2.603, 46.34],
  ["poitiers", "Poitiers", 0.3404, 46.58], ["angers", "Angers", -0.5536, 47.478],
  ["besancon", "Besançon", 6.024, 47.238], ["le-creusot", "Le Creusot", 4.425, 46.801],
  ["sens", "Sens", 3.283, 48.198], ["blois", "Blois", 1.335, 47.587],
  ["nantes", "Nantes", -1.554, 47.218], ["bordeaux", "Bordeaux", -0.579, 44.838],
  ["limoges", "Limoges", 1.261, 45.834], ["strasbourg", "Strasbourg", 7.752, 48.583],
];

// Additional cities (name only); coordinates come from their main station.
const CITIES = [
  "Agen", "Aix-en-Provence", "Aix-les-Bains", "Albi", "Alençon", "Amiens", "Angoulême", "Annecy", "Annemasse",
  "Antibes", "Arcachon", "Arles", "Arras", "Aurillac", "Auch", "Avignon", "Bayonne", "Bar-le-Duc", "Béziers",
  "Belfort", "Bergerac", "Biarritz", "Boulogne-sur-Mer", "Bourg-en-Bresse", "Brest", "Briançon", "Brive-la-Gaillarde",
  "Caen", "Cahors", "Calais", "Cannes", "Carcassonne", "Castres", "Châlons-en-Champagne", "Chambéry", "Charleville-Mézières",
  "Chartres", "Châteauroux", "Châtellerault", "Chaumont", "Cherbourg", "Cholet", "Colmar", "Compiègne", "Dax", "Dieppe",
  "Douai", "Dreux", "Dunkerque", "Épinal", "Évreux", "Foix", "Gap", "Grenoble", "Guéret", "Haguenau", "Hyères",
  "Issoire", "La Roche-sur-Yon", "La Rochelle", "Laon", "Laval", "Le Havre", "Le Mans", "Le Puy-en-Velay", "Lens",
  "Lille", "Lisieux", "Lons-le-Saunier", "Lorient", "Lourdes", "Marseille", "Mende", "Menton", "Metz",
  "Millau", "Montargis", "Montauban", "Montbéliard", "Montélimar", "Montpellier", "Morlaix", "Nancy", "Narbonne",
  "Nice", "Nîmes", "Niort", "Orange", "Pau", "Périgueux", "Perpignan", "Pontarlier", "Quimper", "Reims", "Rennes",
  "Roanne", "Rochefort", "Rodez", "Rouen", "Royan", "Saint-Brieuc", "Saint-Dié-des-Vosges", "Saint-Étienne",
  "Saint-Malo", "Saint-Nazaire", "Saint-Quentin", "Saint-Raphaël", "Saintes", "Saumur", "Sète", "Soissons", "Tarbes",
  "Thionville", "Toulon", "Toulouse", "Troyes", "Tulle", "Valence", "Valenciennes", "Vannes", "Vendôme", "Verdun",
  "Versailles", "Vesoul", "Vienne", "Vierzon", "Villefranche-sur-Saône", "Vitré",
];

// Explicit station lists where name matching is ambiguous or incomplete.
const OVERRIDES: Record<string, string[]> = {
  Nice: ["Nice-Ville", "Nice Riquier", "Nice Saint-Augustin"],
  Rouen: ["Rouen Rive Droite"],
  Chambéry: ["Chambéry - Challes-les-Eaux"],
  Belfort: ["Belfort-Ville", "Belfort - Montbéliard TGV"],
  Calais: ["Calais Ville", "Calais Fréthun"],
  Montauban: ["Montauban Ville Bourbon"],
  Valence: ["Valence Ville", "Valence TGV Rhône-Alpes Sud"],
  Reims: ["Reims", "Champagne-Ardenne TGV"],
  Tours: ["Tours", "Saint-Pierre-des-Corps"],
  Orléans: ["Orléans", "Les Aubrais"],
  "Saint-Raphaël": ["Saint-Raphaël Valescure"],
  "Saint-Étienne": ["Saint-Étienne Châteaucreux", "Saint-Étienne Carnot", "Saint-Étienne La Terrasse", "Saint-Étienne Bellevue"],
  Montpellier: ["Montpellier Saint-Roch", "Montpellier Sud de France"],
  Nîmes: ["Nîmes Centre", "Nîmes Pont du Gard"],
  Vendôme: ["Vendôme", "Vendôme - Villiers-sur-Loir"],
  "Boulogne-sur-Mer": ["Boulogne sur Mer", "Boulogne - Tintelleries"],
  "Saint-Quentin": ["Saint-Quentin"],
  Marseille: ["Marseille Saint-Charles", "Marseille Blancarde"],
  Lille: ["Lille Flandres", "Lille Europe"],
  Toulouse: ["Toulouse Matabiau"],
  "Clermont-Ferrand": ["Clermont-Ferrand"],
  Lyon: ["Lyon Part Dieu", "Lyon Perrache", "Lyon Jean Macé", "Lyon Vaise", "Lyon Saint-Paul", "Lyon Gorge de Loup"],
  Cherbourg: ["Cherbourg"],
  Vienne: ["Vienne"],
  Versailles: ["Versailles Chantiers", "Versailles Rive Gauche Château", "Versailles Rive Droite"],
  Metz: ["Metz", "Metz Nord"],
  Toulon: ["Toulon", "Toulon Sainte-Musse"],
  Grenoble: ["Grenoble", "Grenoble Universités - Gières"],
  Rennes: ["Rennes"],
  Nancy: ["Nancy"],
};

const slug = (name: string) => normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function arg(name: string, fallback: string): string { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }

async function readGtfs(source: string): Promise<Buffer> {
  if (/^https?:\/\//.test(source)) { const r = await fetch(source); if (!r.ok) throw new Error(`HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
  return readFile(source);
}

function stationsOf(feed: Feed, served: Set<string>, name: string) {
  return stationsForPlace(feed, name, served, OVERRIDES).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

async function main(): Promise<void> {
  const feed = loadFeedFromZip(await readGtfs(arg("gtfs", GTFS_URL)));
  const served = servedStations(feed.trips);
  const legacyNames = new Set(LEGACY.map((l) => l[1]));
  const entries: { id: string; name: string; lon: number; lat: number; stations: string[] }[] = [];
  const problems: string[] = [];
  for (const [id, name, lon, lat] of LEGACY) {
    const stations = stationsOf(feed, served, name);
    if (!stations.length && name !== "Sainte-Verge") problems.push(`${name}: aucune gare`);
    entries.push({ id, name, lon, lat, stations: stations.map((s) => s.name) });
  }
  for (const name of CITIES) {
    if (legacyNames.has(name)) { problems.push(`${name}: doublon avec la liste d'origine`); continue; }
    const stations = stationsOf(feed, served, name);
    if (!stations.length) { problems.push(`${name}: aucune gare desservie, ville ignorée`); continue; }
    const main = stations.find((s) => normalizeName(s.name) === normalizeName(name)) ?? stations.find((s) => OVERRIDES[name]?.[0] === s.name) ?? stations[0];
    entries.push({ id: slug(name), name, lon: Number(main.lon.toFixed(4)), lat: Number(main.lat.toFixed(4)), stations: stations.map((s) => s.name) });
  }
  const ids = new Set<string>();
  for (const e of entries) { if (ids.has(e.id)) problems.push(`identifiant en double : ${e.id}`); ids.add(e.id); }
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const body = sorted.map((e) => `  { id: ${JSON.stringify(e.id)}, name: ${JSON.stringify(e.name)}, lon: ${e.lon}, lat: ${e.lat}, stations: ${JSON.stringify(e.stations)} },`).join("\n");
  const file = `// Generated by scripts/build-places.ts from the SNCF GTFS feed (${feed.feedVersion}). Do not edit by hand:\n// add or remove cities in the script and rerun it.\nexport type Place = { id: string; name: string; lon: number; lat: number; stations: string[] };\nexport const places: Place[] = [\n${body}\n];\n`;
  await writeFile("lib/travel/places.ts", file);
  for (const e of sorted) console.log(`${e.name.padEnd(24)} ${e.stations.join(" · ") || "(aucune gare)"}`);
  console.log(`\n${sorted.length} villes écrites dans lib/travel/places.ts`);
  if (problems.length) { console.log("\nÀ vérifier :"); for (const p of problems) console.log(`  - ${p}`); }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
