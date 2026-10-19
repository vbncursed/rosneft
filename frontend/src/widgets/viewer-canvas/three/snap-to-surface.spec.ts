import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { hitsWithin, raycastSurfaceY } from "./snap-to-surface";

// A 10×1×10 slab centred at the origin: its top face sits at y = 0.5.
const SURFACE_Y = 0.5;
const territory = () => new Mesh(new BoxGeometry(10, 1, 10), new MeshBasicMaterial());

describe("raycastSurfaceY", () => {
  it("resolves the top face under the point", () => {
    expect(raycastSurfaceY(territory(), 0, 0)).toBe(SURFACE_Y);
  });

  it("answers null when nothing is under the point", () => {
    expect(raycastSurfaceY(territory(), 500, 500)).toBeNull();
  });

  it("still finds geometry whose raycast was disabled for wheel perf", () => {
    // gltf-model.tsx sets Mesh.raycast = noop and stashes the original in
    // userData.origRaycast. Snapping must bypass that, or dragging over the
    // territory silently stops finding a surface.
    const t = territory();
    t.userData.origRaycast = t.raycast;
    t.raycast = () => {};
    expect(raycastSurfaceY(t, 0, 0)).toBe(SURFACE_Y);
  });

  it("picks the nearest hit, not the first traversed", () => {
    // Manual traversal does not sort by distance the way intersectObject does.
    const low = territory();
    const high = territory();
    high.position.y = 4;
    const scene = new Object3D();
    scene.add(low, high); // low is traversed first, high is nearer to the ray start
    expect(raycastSurfaceY(scene, 0, 0)).toBe(4 + SURFACE_Y);
  });

  it("keeps the shared scratch safe across calls", () => {
    // Module-level Raycaster/Vector3 are reused; a stale origin would make the
    // second call answer for the first call's x/z, and the hit list would
    // accumulate across calls.
    const t = territory();
    expect(raycastSurfaceY(t, 500, 500)).toBeNull();
    expect(raycastSurfaceY(t, 0, 0)).toBe(SURFACE_Y);
    expect(raycastSurfaceY(t, 0, 0)).toBe(SURFACE_Y);
  });

  it("starts the ray where asked: under a roof it finds the floor", () => {
    // The walk casts from one step over the feet, so a roof overhead is not the ground.
    const floor = territory();
    const roof = territory();
    roof.position.y = 4;
    const scene = new Object3D();
    scene.add(floor, roof);
    expect(raycastSurfaceY(scene, 0, 0)).toBe(4 + SURFACE_Y);
    expect(raycastSurfaceY(scene, 0, 0, 2)).toBe(SURFACE_Y);
  });

  it("answers null when the ray starts below every surface", () => {
    expect(raycastSurfaceY(territory(), 0, 0, -5)).toBeNull();
  });
});

describe("hitsWithin", () => {
  // A 4×2×0.1 wall whose +Z face stands at z = -0.95.
  const wall = () => {
    const m = new Mesh(new BoxGeometry(4, 2, 0.1), new MeshBasicMaterial());
    m.position.z = -1;
    return m;
  };
  const from = new Vector3(0, 0, 0);
  const north = new Vector3(0, 0, -1);

  it("sees a wall within reach along a level ray, and not beyond it or behind", () => {
    expect(hitsWithin(wall(), from, north, 1)).toBe(true);
    expect(hitsWithin(wall(), from, north, 0.9)).toBe(false);
    expect(hitsWithin(wall(), from, new Vector3(0, 0, 1), 10)).toBe(false);
  });

  it("sees nothing from inside a mesh, so a walker inside can walk out", () => {
    expect(hitsWithin(wall(), new Vector3(0, 0, -1), north, 1)).toBe(false);
  });

  it("still finds a wall whose raycast was disabled for wheel perf", () => {
    const t = wall();
    t.userData.origRaycast = t.raycast;
    t.raycast = () => {};
    expect(hitsWithin(t, from, north, 1)).toBe(true);
  });

  it("leaves no reach behind: the next ray down is not cut short", () => {
    // The Raycaster is shared; a probe's far must not clip the 1e4-long ray down.
    hitsWithin(wall(), from, north, 0.5);
    expect(raycastSurfaceY(territory(), 0, 0)).toBe(SURFACE_Y);
  });
});
