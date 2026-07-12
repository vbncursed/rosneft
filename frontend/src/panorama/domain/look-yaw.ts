import type { Vec3 } from "@/shared/domain/vec3";

// Yaw is the horizontal look angle measured as atan2(dirX, dirZ): 0 points
// toward +Z (the viewer's historical default look direction) and grows toward
// +X. Pitch is intentionally ignored — the panorama default view is horizontal.

// yawToTarget returns an OrbitControls target `radius` away from `anchor` in
// the horizontal direction `yaw`. y is left at the anchor's height (level look).
export function yawToTarget(anchor: Vec3, yaw: number, radius: number): Vec3 {
  return {
    x: anchor.x + Math.sin(yaw) * radius,
    y: anchor.y,
    z: anchor.z + Math.cos(yaw) * radius,
  };
}

// dirToYaw recovers the horizontal yaw from a look-direction's x/z components.
export function dirToYaw(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}
