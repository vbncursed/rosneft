import { test } from "node:test";
import assert from "node:assert/strict";
import { yawToTarget, dirToYaw } from "./look-yaw.ts";

const anchor = { x: 5, y: 2, z: -3 };

test("yaw 0 looks toward +Z", () => {
  const t = yawToTarget(anchor, 0, 1);
  assert.ok(Math.abs(t.x - anchor.x) < 1e-9, "no x offset");
  assert.equal(t.y, anchor.y, "y unchanged");
  assert.ok(t.z - anchor.z > 0, "target is +Z of anchor");
});

test("yaw round-trips through dirToYaw", () => {
  for (const yaw of [0, 0.5, 1.5, 3, -1, -2.5]) {
    const t = yawToTarget(anchor, yaw, 0.01);
    const back = dirToYaw(t.x - anchor.x, t.z - anchor.z);
    // atan2 returns (-π, π]; compare via the shortest angular distance.
    const diff = Math.atan2(Math.sin(back - yaw), Math.cos(back - yaw));
    assert.ok(Math.abs(diff) < 1e-9, `round-trip yaw ${yaw} → ${back}`);
  }
});

test("radius scales the offset but not the direction", () => {
  const near = yawToTarget(anchor, 1.2, 0.01);
  const far = yawToTarget(anchor, 1.2, 5);
  assert.ok(dirToYaw(near.x - anchor.x, near.z - anchor.z) - 1.2 < 1e-9);
  assert.ok(dirToYaw(far.x - anchor.x, far.z - anchor.z) - 1.2 < 1e-9);
});
