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
 * The zone a click means. The zone the ray enters first decides what the click is on: only zones whose
 * stretch along the ray really overlaps that one's (a wall or edge they merely share does not count) can
 * take it from it, and among those the smallest footprint wins, as the preview rectangles pick (a tie goes
 * to the later zone), so a small zone nested in a big one stays reachable while a neighbour the ray reaches
 * only after leaving the first is never chosen. A zone with no area (collinear corners) is never picked.
 * `exit` is the chosen prism's far wall. `hits` are every triangle the ray meets in the merged mesh.
 */
export function pickZone(hits: RayHit[], zones: { corners: Corners }[]): { index: number; exit: number } | null {
  const stretches = new Map<number, { enter: number; exit: number }>();
  for (const h of hits) {
    const z = zoneOfTriangle(h.faceIndex);
    const s = stretches.get(z) ?? { enter: Infinity, exit: -Infinity };
    stretches.set(z, { enter: Math.min(s.enter, h.distance), exit: Math.max(s.exit, h.distance) });
  }
  const crossed = [...stretches].flatMap(([index, s]) => {
    const zone = zones[index];
    const area = zone ? footprintArea(zone.corners) : 0;
    return area > 0 ? [{ index, ...s, area }] : [];
  });
  const first = crossed.reduce<(typeof crossed)[number] | null>((n, c) => (!n || c.enter < n.enter ? c : n), null);
  if (!first) return null;
  // Relative to the first stretch, so a shallow ray (long stretches) and a steep one judge "touching" alike.
  const epsilon = 1e-6 * Math.max(first.exit - first.enter, 1e-9);
  let best = first;
  for (const c of crossed) {
    const overlap = Math.min(c.exit, first.exit) - Math.max(c.enter, first.enter);
    if (overlap <= epsilon) continue;
    if (c.area < best.area || (c.area === best.area && c.index > best.index)) best = c;
  }
  return { index: best.index, exit: best.exit };
}
