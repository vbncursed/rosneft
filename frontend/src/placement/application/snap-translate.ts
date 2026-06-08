import type { Object3D } from "three";
import { raycastSurfaceY } from "@/placement/application/snap-to-surface";

// applySurface enforces the translate-mode surface contract on `obj`:
//   • snap on  → set Y to the resolved surface (object hugs terrain).
//   • snap off → use the surface as a floor (object can hover, never bury).
// Returns true if the position was mutated, so the caller can decide
// whether to request a re-render under frameloop="demand".
export function applySurface(
  obj: Object3D,
  territory: Object3D,
  snapEnabled: boolean,
): boolean {
  const surfaceY = raycastSurfaceY(territory, obj.position.x, obj.position.z);
  if (surfaceY == null) return false;
  if (snapEnabled) {
    if (obj.position.y === surfaceY) return false;
    obj.position.y = surfaceY;
    return true;
  }
  if (obj.position.y < surfaceY) {
    obj.position.y = surfaceY;
    return true;
  }
  return false;
}
