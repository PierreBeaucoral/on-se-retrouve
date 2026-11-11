import test from "node:test";
import assert from "node:assert/strict";
import { parseIgnDistance, parseIgnDuration } from "../lib/travel/car-client.ts";

test("parsing IGN convertit les secondes en minutes et rejette les valeurs douteuses", () => {
  assert.equal(parseIgnDuration({ duration: 3661, timeUnit: "second" }), 61);
  assert.equal(parseIgnDuration({ duration: 6830.3, timeUnit: "second" }), 114);
  assert.equal(parseIgnDuration({ duration: 61, timeUnit: "minute" }), null);
  assert.equal(parseIgnDuration({ duration: Number.NaN, timeUnit: "second" }), null);
  assert.equal(parseIgnDuration({ duration: -5, timeUnit: "second" }), null);
  assert.equal(parseIgnDuration({ duration: 2881 * 60, timeUnit: "second" }), null);
  assert.equal(parseIgnDuration(null), null);
});

test("parsing IGN lit la distance en kilomètres ou en mètres et rejette le reste", () => {
  assert.equal(parseIgnDistance({ distance: 465.27, distanceUnit: "kilometer" }), 465.3);
  assert.equal(parseIgnDistance({ distance: 465270, distanceUnit: "meter" }), 465.3);
  assert.equal(parseIgnDistance({ distance: 465, distanceUnit: "mile" }), null);
  assert.equal(parseIgnDistance({ distance: -1, distanceUnit: "kilometer" }), null);
  assert.equal(parseIgnDistance({ duration: 10 }), null);
});
