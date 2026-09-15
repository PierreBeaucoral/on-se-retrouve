import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultDestinations, duration, initialGroups, originFor, rank, scenarios,
  tripKey, validMinutes,
  type Group, type Matrix,
} from "../lib/travel/model.ts";

const leg = (minutes: number) => ({ minutes, source: "test", retrievedAt: "2026-01-01" });
const matrixFor = (groups: Group[], destination: string, out: number, back = out): Matrix =>
  Object.fromEntries(groups.map((g) => {
    const mode = g.choice === "train" ? "train" : "car";
    return [tripKey(originFor(g, mode), destination, mode), { out: leg(out), back: leg(back) }];
  }));

test("16 scénarios sont produits pour les choix both/train", () => {
  assert.equal(scenarios(initialGroups).length, 2 ** 4);
});

test("un groupe both alterne car et train", () => {
  const g = [{ ...initialGroups[0], choice: "both" as const }];
  assert.deepEqual(scenarios(g), [["car"], ["train"]]);
});

test("un groupe train reste train dans les scénarios", () => {
  const g = [{ ...initialGroups.find((x) => x.id === "g4")! }];
  assert.deepEqual(scenarios(g), [["train"]]);
});

test("Groupe 4 est bien contraint au train", () => {
  const g4 = initialGroups.find((g) => g.id === "g4")!;
  assert.equal(g4.choice, "train");
  assert.equal(originFor(g4, "train"), "mulhouse");
});

test("Groupe 6 est bien contraint au train", () => {
  const g6 = initialGroups.find((g) => g.id === "g6")!;
  assert.equal(g6.choice, "train");
  assert.equal(originFor(g6, "train"), "paris");
});

test("Groupe 1 utilise Thouars comme origine ferroviaire", () => {
  const g1 = initialGroups[0];
  assert.equal(originFor(g1, "car"), "sainte-verge");
  assert.equal(originFor(g1, "train"), "thouars");
});

test("la clé de trajet distingue origine, destination et mode", () => {
  assert.notEqual(tripKey("lyon", "dijon", "car"), tripKey("lyon", "dijon", "train"));
  assert.equal(tripKey("lyon", "dijon", "car"), "lyon|dijon|car");
});

test("un aller et retour complet est marqué complete", () => {
  const groups = [{ ...initialGroups[1], choice: "car" as const }];
  const result = rank(groups, ["dijon"], ["car"], matrixFor(groups, "dijon", 100, 120))[0];
  assert.equal(result.complete, true);
  assert.equal(result.max, 120);
  assert.equal(result.known, 2);
});

test("un trajet manquant exclut la destination du classement complet", () => {
  const groups = [{ ...initialGroups[1], choice: "car" as const }];
  const matrix = matrixFor(groups, "dijon", 100);
  delete matrix[tripKey("clermont", "dijon", "car")];
  const result = rank(groups, ["dijon"], ["car"], matrix)[0];
  assert.equal(result.complete, false);
  assert.equal(result.max, null);
  assert.equal(result.mean, null);
  assert.equal(result.known, 0);
});

test("les minutes d'accès train sont ajoutées à l'aller et au retour", () => {
  const group = { ...initialGroups[0], choice: "train" as const, access: 15 };
  const result = rank([group], ["dijon"], ["train"], {
    [tripKey("thouars", "dijon", "train")]: { out: leg(100), back: leg(120) },
  })[0];
  assert.deepEqual([result.trips[0].out, result.trips[0].back], [115, 135]);
});

test("le classement privilégie d'abord les destinations complètes", () => {
  const groups = [{ ...initialGroups[1], choice: "car" as const }];
  const complete = matrixFor(groups, "dijon", 500);
  const incomplete = matrixFor(groups, "nevers", 1);
  delete incomplete[tripKey("clermont", "nevers", "car")];
  const result = rank(groups, ["nevers", "dijon"], ["car"], { ...complete, ...incomplete });
  assert.deepEqual(result.map((x) => x.id), ["dijon", "nevers"]);
});

test("le minimax utilise le maximum de l'aller et du retour", () => {
  const groups = [{ ...initialGroups[1], choice: "car" as const }];
  const result = rank(groups, ["dijon"], ["car"], matrixFor(groups, "dijon", 20, 80))[0];
  assert.equal(result.max, 80);
});

test("à minimax égal, le classement utilise la moyenne aller-retour", () => {
  const groups = [{ ...initialGroups[1], choice: "car" as const }];
  const matrix: Matrix = {
    [tripKey("clermont", "dijon", "car")]: { out: leg(30), back: leg(70) },
    [tripKey("clermont", "nevers", "car")]: { out: leg(45), back: leg(55) },
  };
  const result = rank(groups, ["dijon", "nevers"], ["car"], matrix);
  assert.deepEqual(result.map((x) => x.id), ["nevers", "dijon"]);
});

test("la moyenne est calculée sur les deux sens", () => {
  const groups = [{ ...initialGroups[1], choice: "car" as const }];
  const result = rank(groups, ["dijon"], ["car"], matrixFor(groups, "dijon", 20, 80))[0];
  assert.equal(result.mean, 50);
});

test("la moyenne agrège équitablement chaque groupe et chaque sens", () => {
  const groups = [
    { ...initialGroups[1], choice: "car" as const },
    { ...initialGroups[2], choice: "car" as const },
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
