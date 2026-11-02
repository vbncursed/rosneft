import type { Vec3 } from "@/entities/placement";

import type { PlanRect } from "./detect-rects";
import { applyFit, type Similarity } from "./fit-similarity";

export interface ZoneBody {
  corners: [Vec3, Vec3, Vec3, Vec3];
  drawingWidthM: number | null;
  drawingHeightM: number | null;
}

// zoneFromRect places a detected rectangle on the model: corners on the ground
// (the 3D layer adds the lift) and, when the plan has a scale, its drawn size.
export function zoneFromRect(args: {
  rect: PlanRect;
  fit: Similarity;
  groundAt: (x: number, z: number) => number | null;
  fallbackY: number;
  metresPerPt: number | null;
}): ZoneBody {
  const { rect, fit, groundAt, fallbackY, metresPerPt } = args;
  const corners = rect.corners.map((c) => {
    const { x, z } = applyFit(fit, c);
    return { x, y: groundAt(x, z) ?? fallbackY, z };
  }) as ZoneBody["corners"];
  return {
    corners,
    drawingWidthM: metresPerPt === null ? null : rect.widthPt * metresPerPt,
    drawingHeightM: metresPerPt === null ? null : rect.heightPt * metresPerPt,
  };
}
