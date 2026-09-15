import test from "node:test";
import assert from "node:assert/strict";
import { parseIgnDuration } from "../lib/travel/car-client.ts";

test("parsing IGN convertit les secondes en minutes et rejette les valeurs douteuses", () => {
  assert.equal(parseIgnDuration({ duration: 3661, timeUnit: "second" }), 61);
  assert.equal(parseIgnDuration({ duration: 6830.3, timeUnit: "second" }), 114);
  assert.equal(parseIgnDuration({ duration: 61, timeUnit: "minute" }), null);
  assert.equal(parseIgnDuration({ duration: Number.NaN, timeUnit: "second" }), null);
  assert.equal(parseIgnDuration({ duration: -5, timeUnit: "second" }), null);
  assert.equal(parseIgnDuration({ duration: 2881 * 60, timeUnit: "second" }), null);
  assert.equal(parseIgnDuration(null), null);
});
