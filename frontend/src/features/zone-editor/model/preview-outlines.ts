import type { Vec3 } from "@/entities/placement";
import { zoneFromRect, type PlanRect, type Similarity } from "@/entities/site-plan";
import type { Zone } from "@/entities/zone";

/** One detected rectangle on the ground: `index` is its place in the editor's list. */
export type PreviewOutline = { index: number; corners: [Vec3, Vec3, Vec3, Vec3] };

export type PreviewParams = {
  rects: PlanRect[];
  fit: Similarity;
  groundAt: (x: number, z: number) => number | null;
  fallbackY: number;
  zones: Zone[];
  /** Metres per scene unit. */
  unitRatio: number;
};

/** Corners this close (metres, on the ground plane) are the same corner. */
const SAME_CORNER_M = 0.5;

const areaOf = (c: Vec3[]) =>
  Math.abs(c.reduce((s, p, k) => s + (p.x * c[(k + 1) % c.length].z - c[(k + 1) % c.length].x * p.z), 0)) / 2;
const centreOf = (c: Vec3[]) => ({
  x: c.reduce((s, p) => s + p.x, 0) / c.length,
  z: c.reduce((s, p) => s + p.z, 0) / c.length,
});
/** The areas of one rectangle and its zone may differ by this much (relative) and still be the same shape. */
const AREA_TOLERANCE = 0.2;

// A rectangle "is" a zone when every one of its corners has a zone corner within
// SAME_CORNER_M, AND the centres lie within it too, AND the areas agree within
// AREA_TOLERANCE. Corner sets, not positions in the list: a zone may start from
// any corner, and heights are ignored because the ground was probed again. The
// centre and area guard the sub-metre case, where corners 0.5 m apart can
// belong to a thinner or shifted rectangle that is not the zone.
function isZone(corners: Vec3[], zones: Zone[], tol: number): boolean {
  const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z) <= tol;
  const [area, centre] = [areaOf(corners), centreOf(corners)];
  return zones.some(
    (z) =>
      corners.every((c) => z.corners.some((zc) => near(c, zc))) &&
      near(centre, centreOf(z.corners)) &&
      Math.abs(areaOf(z.corners) - area) <= AREA_TOLERANCE * Math.max(area, areaOf(z.corners)),
  );
}

/**
 * Every detected rectangle as four ground points, through the same mapping a
 * created zone uses, minus the ones that already are saved zones (their own
 * fill is on the model).
 */
export function previewOutlines({
  rects,
  fit,
  groundAt,
  fallbackY,
  zones,
  unitRatio,
}: PreviewParams): PreviewOutline[] {
  const tol = SAME_CORNER_M / (unitRatio > 0 ? unitRatio : 1);
  const out: PreviewOutline[] = [];
  rects.forEach((rect, index) => {
    const { corners } = zoneFromRect({ rect, fit, groundAt, fallbackY, metresPerPt: null });
    if (!isZone(corners, zones, tol)) out.push({ index, corners });
  });
  return out;
}
