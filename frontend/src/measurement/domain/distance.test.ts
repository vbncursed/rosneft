// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDistance } from "./distance.ts";

// unitRatio === 1 is the "metadata missing" sentinel → raw scene units, "u".
test("unitRatio 1: raw units with magnitude-aware precision", () => {
  assert.equal(formatDistance(150, 1), "150.0 u"); // >=100 → 1 decimal
  assert.equal(formatDistance(5, 1), "5.00 u"); //    >=1   → 2 decimals
  assert.equal(formatDistance(0.5, 1), "0.500 u"); //  <1    → 3 decimals
});

// Any unitRatio !== 1 → metres, bucketed by magnitude.
test("metric buckets pick the right suffix", () => {
  assert.equal(formatDistance(1500, 2), "1.50 km");
  assert.equal(formatDistance(5, 2), "5.00 m");
  assert.equal(formatDistance(0.05, 2), "5.0 cm");
  assert.equal(formatDistance(0.005, 2), "5 mm");
});

test("bucket boundaries land on the higher unit (>=)", () => {
  assert.equal(formatDistance(1000, 2), "1.00 km");
  assert.equal(formatDistance(1, 2), "1.00 m");
  assert.equal(formatDistance(0.01, 2), "1.0 cm");
});

test("negative magnitudes bucket by absolute value", () => {
  assert.equal(formatDistance(-1500, 2), "-1.50 km");
  assert.equal(formatDistance(-0.005, 2), "-5 mm");
});
