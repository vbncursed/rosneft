// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { IDLE, start, next, prev, skip, current } from "./tour-state.ts";
import type { TourStep } from "./tour-step.ts";

const steps: TourStep[] = [
  { id: "a", title: "A", body: "a" },
  { id: "b", title: "B", body: "b" },
];

test("start with no steps never activates", () => {
  assert.deepEqual(start([]), IDLE);
  assert.equal(current(start([])), null);
});

test("start activates on the first step", () => {
  const s = start(steps);
  assert.equal(s.active, true);
  assert.equal(s.index, 0);
  assert.equal(current(s)?.id, "a");
});

test("next walks forward one step", () => {
  assert.equal(current(next(start(steps)))?.id, "b");
});

test("next past the last step finishes the tour", () => {
  const done = next(next(start(steps)));
  assert.equal(done.active, false);
  assert.equal(current(done), null);
});

test("prev clamps at the first step without deactivating", () => {
  const s = prev(start(steps));
  assert.equal(s.active, true);
  assert.equal(s.index, 0);
});

test("prev returns to the previous step", () => {
  assert.equal(current(prev(next(start(steps))))?.id, "a");
});

test("skip deactivates from any step", () => {
  assert.equal(skip(start(steps)).active, false);
  assert.equal(skip(next(start(steps))).active, false);
});

// The tour's reveal effect calls next() blindly when a target is missing; a run
// of missing targets must drain to inactive rather than throw or wrap around.
test("transitions on an inactive state are no-ops", () => {
  assert.deepEqual(next(IDLE), IDLE);
  assert.deepEqual(prev(IDLE), IDLE);
  assert.deepEqual(skip(IDLE), IDLE);
  assert.equal(current(IDLE), null);

  const done = skip(start(steps));
  assert.deepEqual(next(done), done);
  assert.deepEqual(prev(done), done);
});
