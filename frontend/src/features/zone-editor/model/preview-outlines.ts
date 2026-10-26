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

// A rectangle "is" a zone when every one of its corners has a zone corner within
// SAME_CORNER_M. Corner sets, not positions in the list: a zone may start from
// any corner, and heights are ignored because the ground was probed again.
function isZone(corners: Vec3[], zones: Zone[], tol: number): boolean {
  const near = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z) <= tol;
  return zones.some((z) => corners.every((c) => z.corners.some((zc) => near(c, zc))));
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
