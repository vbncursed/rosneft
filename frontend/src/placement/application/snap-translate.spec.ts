// Run with: yarn test:spa  (vitest — the module resolves through the `@/`
// alias and drives real three.js objects).
import { test } from "vitest";
import assert from "node:assert/strict";
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D} from "three";

import { applySurface } from "./snap-translate";
import { raycastSurfaceY } from "./snap-to-surface";

// A 10×1×10 slab centred at the origin: its top face sits at y = 0.5.
const SURFACE_Y = 0.5;
function territory(): Mesh {
  return new Mesh(new BoxGeometry(10, 1, 10), new MeshBasicMaterial());
}

function at(x: number, y: number, z: number): Object3D {
  const o = new Object3D();
  o.position.set(x, y, z);
  return o;
}

test("raycastSurfaceY resolves the top face under the point", () => {
  assert.equal(raycastSurfaceY(territory(), 0, 0), SURFACE_Y);
});

test("raycastSurfaceY returns null when nothing is under the point", () => {
  assert.equal(raycastSurfaceY(territory(), 500, 500), null);
});

test("raycastSurfaceY still finds geometry whose raycast was disabled for wheel perf", () => {
  // gltf-model.tsx sets Mesh.raycast = noop and stashes the original in
  // userData.origRaycast. Snapping must bypass that, or dragging over the
  // territory silently stops finding a surface.
  const t = territory();
  t.userData.origRaycast = t.raycast;
  t.raycast = () => {};
  assert.equal(raycastSurfaceY(t, 0, 0), SURFACE_Y);
});

test("raycastSurfaceY picks the nearest hit, not the first traversed", () => {
  // Manual traversal does not sort by distance the way intersectObject does.
  const low = territory();
  const high = territory();
  high.position.y = 4;
  const scene = new Object3D();
  scene.add(low, high); // low is traversed first, high is nearer to the ray start
  assert.equal(raycastSurfaceY(scene, 0, 0), 4 + SURFACE_Y);
});

test("snap on pulls the object down onto the surface", () => {
  const obj = at(0, 5, 0);
  assert.equal(applySurface(obj, territory(), true), true);
  assert.equal(obj.position.y, SURFACE_Y);
});

test("snap on lifts an object buried below the surface", () => {
  const obj = at(0, -20, 0);
  assert.equal(applySurface(obj, territory(), true), true);
  assert.equal(obj.position.y, SURFACE_Y);
});

test("snap on reports no change when the object already hugs the surface", () => {
  // The return value gates a re-render under frameloop=\"demand\"; a false
  // positive here repaints on every drag tick.
  const obj = at(0, SURFACE_Y, 0);
  assert.equal(applySurface(obj, territory(), false), false);
  assert.equal(applySurface(obj, territory(), true), false);
});

test("snap off lets the object hover and leaves it untouched", () => {
  const obj = at(0, 5, 0);
  assert.equal(applySurface(obj, territory(), false), false);
  assert.equal(obj.position.y, 5);
});

test("snap off still refuses to bury the object", () => {
  const obj = at(0, -3, 0);
  assert.equal(applySurface(obj, territory(), false), true);
  assert.equal(obj.position.y, SURFACE_Y);
});

test("a drag past the edge of the territory leaves the object where it is", () => {
  const obj = at(500, 5, 500);
  assert.equal(applySurface(obj, territory(), true), false);
  assert.equal(obj.position.y, 5, "no surface under the point — do not drop to 0");
});

test("the shared raycaster scratch is safe to reuse across calls", () => {
  // Module-level Raycaster/Vector3 are reused; a stale origin would make the
  // second call answer for the first call's x/z.
  const t = territory();
  assert.equal(raycastSurfaceY(t, 500, 500), null);
  assert.equal(raycastSurfaceY(t, 0, 0), SURFACE_Y);
  // And the hit list does not accumulate across calls either.
  assert.equal(raycastSurfaceY(t, 0, 0), SURFACE_Y);
});
