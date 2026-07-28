// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { bboxAxis } from "./artifact.ts";

test("bboxAxis returns the extent between the two bounds", () => {
  assert.equal(bboxAxis(-5, 5), 10);
  assert.equal(bboxAxis(0, 2.5), 2.5);
});

test("bboxAxis rounds to 2 decimals", () => {
  assert.equal(bboxAxis(0, 1.006), 1.01);
  assert.equal(bboxAxis(-0.333, 0.333), 0.67);
});

test("bboxAxis inherits toFixed's binary-float rounding at the .xx5 boundary", () => {
  // 1.005 is stored as 1.00499999…, so toFixed(2) rounds it down. Pinned
  // because a dimension label reading 1.00 instead of 1.01 is the expected
  // output here, not a regression.
  assert.equal(bboxAxis(0, 1.005), 1);
});

test("bboxAxis returns 0 when either bound is missing", () => {
  // bboxMin/bboxMax are optional on Artifact — a model converted before the
  // worker emitted bbox metadata has neither.
  assert.equal(bboxAxis(undefined, 5), 0);
  assert.equal(bboxAxis(-5, undefined), 0);
  assert.equal(bboxAxis(undefined, undefined), 0);
});

test("bboxAxis treats a zero bound as present, not missing", () => {
  assert.equal(bboxAxis(0, 0), 0);
  assert.equal(bboxAxis(0, 4), 4);
});

test("bboxAxis returns a number, never the string toFixed produces", () => {
  assert.equal(typeof bboxAxis(0, 1.005), "number");
});
