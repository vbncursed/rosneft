import type { Object3D } from "three";

// True when `node` is `root` or sits anywhere beneath it. Lets a raycast hit
// be constrained to a single subtree — e.g. keep a panorama-marker drag on the
// territory surface and ignore placements / gizmo pickers under the cursor.
export function isDescendant(node: Object3D | null, root: Object3D): boolean {
  for (let n: Object3D | null = node; n; n = n.parent) {
    if (n === root) return true;
  }
  return false;
}
