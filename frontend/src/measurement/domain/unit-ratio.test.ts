// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { computeUnitRatio } from "./unit-ratio.ts";

test("ratio is the largest bbox axis over 2 (converter's normalised max)", () => {
  assert.equal(computeUnitRatio({ x: 4, y: 2, z: 1 }), 2);
  assert.equal(computeUnitRatio({ x: 1, y: 2, z: 6 }), 3);
});

test("falls back to 1 when the bbox is degenerate", () => {
  assert.equal(computeUnitRatio({ x: 0, y: 0, z: 0 }), 1); // max <= 0
  assert.equal(computeUnitRatio({ x: -5, y: -2, z: -1 }), 1); // all negative
  assert.equal(computeUnitRatio({ x: Infinity, y: 1, z: 1 }), 1); // not finite
});
