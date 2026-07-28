// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { clampOpacity, nudgePosition, applyCalibration } from "./calibration.ts";
import type { Panorama } from "./panorama.ts";

test("clampOpacity keeps the ghost photo between 0.15 and 1", () => {
  assert.equal(clampOpacity(0.5), 0.5);
  assert.equal(clampOpacity(0), 0.15);
  assert.equal(clampOpacity(-3), 0.15);
  assert.equal(clampOpacity(1.4), 1);
});

test("clampOpacity passes the bounds through unchanged", () => {
  assert.equal(clampOpacity(0.15), 0.15);
  assert.equal(clampOpacity(1), 1);
});

test("nudgePosition shifts one axis and leaves the others", () => {
  const pos = { x: 1, y: 2, z: 3 };
  assert.deepEqual(nudgePosition(pos, "y", 0.5), { x: 1, y: 2.5, z: 3 });
  assert.deepEqual(nudgePosition(pos, "z", -3), { x: 1, y: 2, z: 0 });
});

test("nudgePosition does not mutate the source position", () => {
  const pos = { x: 1, y: 2, z: 3 };
  nudgePosition(pos, "x", 10);
  assert.deepEqual(pos, { x: 1, y: 2, z: 3 });
});

test("applyCalibration overlays the draft and preserves every other field", () => {
  const base = {
    id: "p1",
    slug: "north",
    title: "North yard",
    position: { x: 0, y: 0, z: 0 },
    yawOffset: 0,
  } as Panorama;

  const out = applyCalibration(base, { position: { x: 4, y: 5, z: 6 }, yawOffset: 1.2 });

  assert.deepEqual(out.position, { x: 4, y: 5, z: 6 });
  assert.equal(out.yawOffset, 1.2);
  assert.equal(out.id, "p1");
  assert.equal(out.title, "North yard");
});

test("applyCalibration leaves the stored panorama untouched", () => {
  const base = { id: "p1", position: { x: 0, y: 0, z: 0 }, yawOffset: 0 } as Panorama;
  applyCalibration(base, { position: { x: 9, y: 9, z: 9 }, yawOffset: 3 });
  assert.deepEqual(base.position, { x: 0, y: 0, z: 0 });
  assert.equal(base.yawOffset, 0);
});
