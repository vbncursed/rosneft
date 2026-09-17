import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { raycastSurfaceY } from "./snap-to-surface";

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
});
