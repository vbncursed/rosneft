import { Raycaster, Vector3, type Intersection, type Mesh, type Object3D } from "three";

// Module-level scratch so we don't allocate a Raycaster + two Vector3s on
// every objectChange tick during a drag. Single-writer (PlacementsLayer's
// drag loop runs on the main thread, never interleaves).
const raycaster = new Raycaster();
const origin = new Vector3();
const DOWN = new Vector3(0, -1, 0);
// 1e4 is well above the converter's normalised max-axis = 2 envelope; any
// realistic placement sits below this, so a vertical ray from origin always
// starts outside the mesh.
const RAY_START_Y = 1e4;

// Resolve the surface Y of the territory mesh directly under (x, z) by
// casting a downward ray. Bypasses Mesh.raycast = noop (the wheel-perf
// optimisation in gltf-model.tsx) by calling each mesh's stashed
// userData.origRaycast — the user-facing raycastable flag stays off, but
// snap/floor logic still finds geometry.
export function raycastSurfaceY(target: Object3D, x: number, z: number): number | null {
  origin.set(x, RAY_START_Y, z);
  raycaster.set(origin, DOWN);
  target.updateMatrixWorld(true);
  const hits: Intersection[] = [];
  target.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const fn = (m.userData.origRaycast ?? m.raycast) as Mesh["raycast"];
    fn.call(m, raycaster, hits);
  });
  if (hits.length === 0) return null;
  // intersectObject sorts by distance; manual traversal doesn't, so the
  // first hit isn't guaranteed nearest.
  let best = hits[0];
  for (let i = 1; i < hits.length; i++) {
    if (hits[i].distance < best.distance) best = hits[i];
  }
  return best.point.y;
}
