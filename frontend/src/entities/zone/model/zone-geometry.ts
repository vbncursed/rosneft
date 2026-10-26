import type { Vec3 } from "@/entities/placement";
import type { Zone } from "./zone";

const EDGE_EPS = 1e-9;
const MIN_AREA = 1e-9;

const area = (zone: Zone) =>
  Math.abs(
    zone.corners.reduce((sum, a, i) => {
      const b = zone.corners[(i + 1) % 4];
      return sum + (a.x * b.z - b.x * a.z);
    }, 0),
  ) / 2;

const side = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.z - a.z);

/** Inside the rectangle on the ground plane, an edge included; either winding. */
export function zoneContains(zone: Zone, p: { x: number; z: number }): boolean {
  if (area(zone) < MIN_AREA) return false; // a degenerate zone has no inside
  const crosses = zone.corners.map((a, i) => {
    const b = zone.corners[(i + 1) % 4];
    return (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  });
  return crosses.every((c) => c >= -EDGE_EPS) || crosses.every((c) => c <= EDGE_EPS);
}

export function zoneCentre(zone: Zone): Vec3 {
  const mean = (k: keyof Vec3) => zone.corners.reduce((sum, c) => sum + c[k], 0) / 4;
  return { x: mean("x"), y: mean("y"), z: mean("z") };
}

/** Three.js yaw of the long side, in (-pi/2, pi/2]: rotating (1,0,0) by it lies along that side. */
export function zoneAxis(zone: Zone): number {
  const [a, b, c] = zone.corners;
  const [from, to] = side(a, b) >= side(b, c) ? [a, b] : [b, c];
  const yaw = Math.atan2(-(to.z - from.z), to.x - from.x);
  if (yaw > Math.PI / 2) return yaw - Math.PI;
  if (yaw <= -Math.PI / 2) return yaw + Math.PI;
  return yaw;
}

/** Width runs corner 0 to 1 and height 1 to 2, as the drawing's sizes do; `unitRatio` is metres per scene unit. */
export function zoneSizeM(zone: Zone, unitRatio: number): { width: number; height: number } {
  const [a, b, c] = zone.corners;
  return { width: side(a, b) * unitRatio, height: side(b, c) * unitRatio };
}

export function placementsInside(zone: Zone, placements: { position: Vec3; hidden: boolean }[]): number {
  return placements.filter((p) => !p.hidden && zoneContains(zone, p.position)).length;
}
