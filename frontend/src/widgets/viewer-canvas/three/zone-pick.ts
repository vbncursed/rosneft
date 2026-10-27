import type { Vec3 } from "@/entities/placement";
import { zoneOfTriangle } from "./zone-prism-geometry";

type Corners = [Vec3, Vec3, Vec3, Vec3];
export type RayHit = { faceIndex: number; distance: number };

/** The footprint's area on the ground plane, either winding. */
export const footprintArea = (corners: Corners): number =>
  Math.abs(
    corners.reduce((sum, a, i) => {
      const b = corners[(i + 1) % 4];
      return sum + (a.x * b.z - b.x * a.z);
    }, 0),
  ) / 2;

/**
 * Of the zones whose prism the ray crosses, the one with the smallest footprint
 * (a tie goes to the later zone), as the preview rectangles pick, so a small
 * zone nested in a big one stays reachable. `exit` is that prism's far wall.
 * `hits` are every triangle the ray meets in the merged mesh, in any order.
 */
export function pickZone(hits: RayHit[], zones: { corners: Corners }[]): { index: number; exit: number } | null {
  const exits = new Map<number, number>();
  for (const h of hits) {
    const z = zoneOfTriangle(h.faceIndex);
    exits.set(z, Math.max(exits.get(z) ?? -Infinity, h.distance));
  }
  let best: { index: number; exit: number; area: number } | null = null;
  for (const [index, exit] of exits) {
    const zone = zones[index];
    if (!zone) continue;
    const area = footprintArea(zone.corners);
    if (!best || area < best.area || (area === best.area && index > best.index)) best = { index, exit, area };
  }
  return best && { index: best.index, exit: best.exit };
}
