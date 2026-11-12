import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultDestinations, duration, initialGroups, originFor, rank, scenarios,
  tripKey, validMinutes, tripCost, fastestModes, costLabel, validCustom, nearestPlace, places,
  type Group, type Matrix,
} from "../lib/travel/model.ts";

// Test fixtures, independent of the app's default groups.
const clermont: Group = { id: "a", name: "A", place: "clermont", choice: "car", note: "", access: 0 };
const lyon: Group = { ...clermont, id: "b", place: "lyon" };
const thouars: Group = { ...clermont, id: "c", place: "sainte-verge", railPlace: "thouars" };
const leg = (minutes: number) => ({ minutes, source: "test", retrievedAt: "2026-01-01" });
const matrixFor = (groups: Group[], destination: string, out: number, back = out): Matrix =>
  Object.fromEntries(groups.map((g) => {
    const mode = g.choice === "train" ? "train" : "car";
    return [tripKey(originFor(g, mode), destination, mode), { out: leg(out), back: leg(back) }];
  }));

test("les groupes par défaut sont neutres (aucune donnée personnelle)", () => {
  for (const g of initialGroups) {
    assert.match(g.name, /^Groupe \d+$/);
    assert.equal(g.note, "");
  }
});

test("2 groupes flexibles et 1 groupe train donnent 4 scénarios", () => {
  assert.equal(scenarios(initialGroups).length, 2 ** 2);
});

test("un groupe both alterne car et train", () => {
  const g = [{ ...initialGroups[0], choice: "both" as const }];
  assert.deepEqual(scenarios(g), [["car"], ["train"]]);
});

test("un groupe train reste train dans les scénarios", () => {
  const g = [{ ...initialGroups[0], choice: "train" as const }];
  assert.deepEqual(scenarios(g), [["train"]]);
});

test("un départ ferroviaire distinct remplace la ville pour le train seulement", () => {
  const g = { ...initialGroups[0], place: "sainte-verge", railPlace: "thouars" };
  assert.equal(originFor(g, "car"), "sainte-verge");
  assert.equal(originFor(g, "train"), "thouars");
});

test("la clé de trajet distingue origine, destination et mode", () => {
  assert.notEqual(tripKey("lyon", "dijon", "car"), tripKey("lyon", "dijon", "train"));
  assert.equal(tripKey("lyon", "dijon", "car"), "lyon|dijon|car");
});

test("un aller et retour complet est marqué complete", () => {
  const groups = [{ ...clermont, choice: "car" as const }];
  const result = rank(groups, ["dijon"], ["car"], matrixFor(groups, "dijon", 100, 120))[0];
  assert.equal(result.complete, true);
  assert.equal(result.max, 120);
  assert.equal(result.known, 2);
});

test("un trajet manquant exclut la destination du classement complet", () => {
  const groups = [{ ...clermont, choice: "car" as const }];
  const matrix = matrixFor(groups, "dijon", 100);
  delete matrix[tripKey("clermont", "dijon", "car")];
  const result = rank(groups, ["dijon"], ["car"], matrix)[0];
  assert.equal(result.complete, false);
  assert.equal(result.max, null);
  assert.equal(result.mean, null);
  assert.equal(result.known, 0);
});

test("les minutes d'accès train sont ajoutées à l'aller et au retour", () => {
  const group = { ...thouars, choice: "train" as const, access: 15 };
  const result = rank([group], ["dijon"], ["train"], {
    [tripKey("thouars", "dijon", "train")]: { out: leg(100), back: leg(120) },
  })[0];
  assert.deepEqual([result.trips[0].out, result.trips[0].back], [115, 135]);
});

test("le classement privilégie d'abord les destinations complètes", () => {
  const groups = [{ ...clermont, choice: "car" as const }];
  const complete = matrixFor(groups, "dijon", 500);
  const incomplete = matrixFor(groups, "nevers", 1);
  delete incomplete[tripKey("clermont", "nevers", "car")];
  const result = rank(groups, ["nevers", "dijon"], ["car"], { ...complete, ...incomplete });
  assert.deepEqual(result.map((x) => x.id), ["dijon", "nevers"]);
});

test("le minimax utilise le maximum de l'aller et du retour", () => {
  const groups = [{ ...clermont, choice: "car" as const }];
  const result = rank(groups, ["dijon"], ["car"], matrixFor(groups, "dijon", 20, 80))[0];
  assert.equal(result.max, 80);
});

test("à minimax égal, le classement utilise la moyenne aller-retour", () => {
  const groups = [{ ...clermont, choice: "car" as const }];
  const matrix: Matrix = {
    [tripKey("clermont", "dijon", "car")]: { out: leg(30), back: leg(70) },
    [tripKey("clermont", "nevers", "car")]: { out: leg(45), back: leg(55) },
  };
  const result = rank(groups, ["dijon", "nevers"], ["car"], matrix);
  assert.deepEqual(result.map((x) => x.id), ["nevers", "dijon"]);
});

test("la moyenne est calculée sur les deux sens", () => {
  const groups = [{ ...clermont, choice: "car" as const }];
  const result = rank(groups, ["dijon"], ["car"], matrixFor(groups, "dijon", 20, 80))[0];
  assert.equal(result.mean, 50);
});

test("la moyenne agrège équitablement chaque groupe et chaque sens", () => {
  const groups = [
    { ...clermont, choice: "car" as const },
    { ...lyon, choice: "car" as const },
  ];
  const matrix: Matrix = {
    [tripKey("clermont", "dijon", "car")]: { out: leg(10), back: leg(30) },
    [tripKey("lyon", "dijon", "car")]: { out: leg(50), back: leg(70) },
  };
  assert.equal(rank(groups, ["dijon"], ["car", "car"], matrix)[0].mean, 40);
});

test("validMinutes accepte zéro et la borne haute", () => {
  assert.equal(validMinutes(0), true);
  assert.equal(validMinutes(2880), true);
});

test("validMinutes rejette négatifs, NaN, infinis et valeurs hors borne", () => {
  for (const value of [-1, 2881, Number.NaN, Number.POSITIVE_INFINITY, "10", null]) {
    assert.equal(validMinutes(value), false);
  }
});

test("duration formate correctement zéro et arrondit les minutes", () => {
  assert.equal(duration(0), "0 h 00");
  assert.equal(duration(61.4), "1 h 01");
  assert.equal(duration(null), "—");
});

test("les destinations par défaut sont identifiants non vides", () => {
  assert.ok(defaultDestinations.length > 0);
  assert.ok(defaultDestinations.every((id) => id.length > 0));
});

test("le coût additionne voiture au kilomètre (une par groupe) et billets de train par voyageur", () => {
  const car = { ...clermont, people: 3 };
  const train = { ...lyon, choice: "train" as const, people: 2 };
  const seg = (fare?: [number, number]) => ({ from: "A", to: "B", departure: "08:00", arrival: "09:00", brand: "TGV INOUI", number: "1", ...(fare ? { fare } : {}) });
  const trips = [
    { mode: "car" as const, trip: { out: { ...leg(100), km: 200 }, back: { ...leg(100), km: 200 } } },
    { mode: "train" as const, trip: { out: { ...leg(90), segments: [seg([20, 60])] }, back: { ...leg(90), segments: [seg([20, 60])] } } },
  ];
  const c = tripCost([car, train], trips, 0.35);
  assert.deepEqual(c, { min: 140 + 80, max: 140 + 240, complete: true, people: 5 });
  assert.equal(costLabel(c), "220–380 €");
  assert.equal(costLabel(c, c.people), "44–76 €");
});

test("un train sans tarif publié ou une distance manquante rend le coût incomplet", () => {
  const seg = { from: "A", to: "B", departure: "08:00", arrival: "09:00", brand: "Train TER", number: "1" };
  const c = tripCost([{ ...lyon, choice: "train" as const }], [{ mode: "train", trip: { out: { ...leg(60), segments: [seg] }, back: { ...leg(60), segments: [] } } }], 0.35);
  assert.equal(c.complete, false);
  assert.equal(costLabel(c), "—");
  const car = tripCost([clermont], [{ mode: "car", trip: { out: { ...leg(60), km: 100 }, back: leg(60) } }], 0.35);
  assert.equal(costLabel(car), "≥ 35 €");
});

test("une commune recherchée est valide seulement avec un code INSEE, des coordonnées en France et une gare de la liste", () => {
  const custom = { id: "commune-79300", name: "Sainte-Verge (79)", lon: -0.2278, lat: 47.0135, stations: [] };
  const g: Group = { ...clermont, place: custom.id, custom, railPlace: "thouars" };
  assert.equal(validCustom(g), true);
  assert.equal(validCustom({ ...g, railPlace: undefined }), false, "a rail departure is required");
  assert.equal(validCustom({ ...g, custom: { ...custom, lat: 60 } }), false, "outside metropolitan France");
  assert.equal(validCustom({ ...g, custom: { ...custom, id: "commune-<script>" }, place: "commune-<script>" }), false);
  assert.equal(validCustom({ ...g, place: "lyon" }), false, "custom must match the place");
});

test("la gare de départ d'une commune recherchée est la ville de la liste la plus proche", () => {
  assert.equal(nearestPlace(-0.2278, 47.0135, places.filter((p) => p.stations.length))?.id, "thouars");
});

test("un tarif TER estimé rend le coût approximatif (≈) sans le rendre incomplet", () => {
  const seg = { from: "A", to: "B", departure: "08:00", arrival: "09:00", brand: "Train TER", number: "1", fare: [8, 12.5] as [number, number], fareSource: "estimate" as const };
  const c = tripCost([{ ...lyon, choice: "train" as const }], [{ mode: "train", trip: { out: { ...leg(60), segments: [seg] }, back: { ...leg(60), segments: [seg] } } }], 0.35);
  assert.equal(c.complete, true);
  assert.equal(c.estimated, true);
  assert.equal(costLabel(c), "≈ 16–25 €");
});

test("au plus rapide : chaque groupe « les deux » prend son mode le plus court, par destination", () => {
  const flex = { ...clermont, choice: "both" as const, access: 10 };
  const train = { ...lyon, choice: "train" as const };
  const matrix: Matrix = {
    [tripKey("clermont", "dijon", "car")]: { out: leg(200), back: leg(200) },
    [tripKey("clermont", "dijon", "train")]: { out: leg(150), back: leg(150) },
    [tripKey("clermont", "nevers", "car")]: { out: leg(100), back: leg(100) },
    [tripKey("clermont", "nevers", "train")]: { out: leg(95), back: leg(95) }, // +2×10 min d'accès : la voiture gagne
    [tripKey("lyon", "dijon", "train")]: { out: leg(120), back: leg(120) },
    [tripKey("lyon", "nevers", "train")]: { out: leg(180), back: leg(180) },
  };
  assert.deepEqual(fastestModes([flex, train], "dijon", matrix), ["train", "train"]);
  assert.deepEqual(fastestModes([flex, train], "nevers", matrix), ["car", "train"]);
  const rows = rank([flex, train], ["dijon", "nevers"], (d) => fastestModes([flex, train], d, matrix), matrix);
  assert.deepEqual(rows.map((r) => [r.id, r.max, r.trips[0].mode]), [["dijon", 160, "train"], ["nevers", 180, "car"]]);
  delete matrix[tripKey("clermont", "dijon", "train")];
  assert.deepEqual(fastestModes([flex], "dijon", matrix), ["car"], "un mode sans données perd");
});
