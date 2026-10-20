import { Raycaster, Vector3, type Intersection, type Mesh, type Object3D } from "three";

// Module-level scratch so we don't allocate a Raycaster + two Vector3s on
// every objectChange tick during a drag. Single-writer (PlacementsLayer's
// drag loop runs on the main thread, never interleaves).
const raycaster = new Raycaster();
const origin = new Vector3();
const DOWN = new Vector3(0, -1, 0);
// 1e4 is well above the converter's normalised max-axis = 2 envelope; any
// realistic placement sits below this, so a vertical ray from origin always
// starts outside the mesh. The walk passes its own start (the knee, over the feet).
const RAY_START_Y = 1e4;

// The nearest surface of `target` along the ray from `from` towards `dir`
// (a unit vector), within `far`. Bypasses Mesh.raycast = noop (the
// wheel-perf optimisation in gltf-model.tsx) by calling each mesh's stashed
// userData.origRaycast — the user-facing raycastable flag stays off, but
// snap/floor/wall logic still finds geometry. Which faces count follows each
// mesh's material.side: the territory GLBs are DoubleSide, so a back face is
// hit too; a one-sided material hits nothing from inside the mesh.
function nearestHit(target: Object3D, from: Vector3, dir: Vector3, far = Infinity): Intersection | null {
  raycaster.set(from, dir);
  // Set on every call: the Raycaster is shared, and a probe's short reach must not clip the next ray.
  raycaster.far = far;
  target.updateMatrixWorld(true);
  const hits: Intersection[] = [];
  target.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    // oxlint-disable-next-line typescript/unbound-method -- always invoked as fn.call(m, ...) on the mesh it came from
    const fn = (m.userData.origRaycast ?? m.raycast) as Mesh["raycast"];
    fn.call(m, raycaster, hits);
  });
  // intersectObject sorts by distance; manual traversal doesn't, so the
  // first hit isn't guaranteed nearest.
  let best: Intersection | null = null;
  for (const hit of hits) {
    if (!best || hit.distance < best.distance) best = hit;
  }
  return best;
}

// The surface Y under (x, z), seen straight down from `fromY`. The default
// starts above everything; the walk starts it at the knee over the feet, so a
// roof overhead is not taken for the ground.
export function raycastSurfaceY(target: Object3D, x: number, z: number, fromY = RAY_START_Y): number | null {
  return nearestHit(target, origin.set(x, fromY, z), DOWN)?.point.y ?? null;
}

/** Is there a surface within `reach` of `from` along `dir` (a unit vector)? The walk's wall probe. */
export function hitsWithin(target: Object3D, from: Vector3, dir: Vector3, reach: number): boolean {
  return nearestHit(target, from, dir, reach) !== null;
}
