import { utmToScene, type SourceBbox } from "@/entities/territory";
import type { Vec3 } from "@/entities/placement";

import type { ControlPoint } from "./control-points";
import type { Pt } from "./geometry";

export interface CalibrationPair {
  pdf: Pt;
  scene: Vec3;
  utm: { e: number; n: number } | null;
}

// autoPairs proposes one pair per control point that falls on the model, with
// the ground height from `groundAt` (or `fallbackY` where the probe misses).
// Fewer than two points on the model proposes nothing.
export function autoPairs(
  points: ControlPoint[],
  bbox: SourceBbox,
  groundAt: (x: number, z: number) => number | null,
  fallbackY: number,
): CalibrationPair[] {
  const pairs = points.flatMap((p) => {
    const xz = utmToScene(p.e, p.n, bbox);
    if (!xz) return [];
    return [{ pdf: p.at, scene: { x: xz.x, y: groundAt(xz.x, xz.z) ?? fallbackY, z: xz.z }, utm: { e: p.e, n: p.n } }];
  });
  return pairs.length < 2 ? [] : pairs;
}
