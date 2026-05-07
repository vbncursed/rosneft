import type { Vec3 } from "@/shared/domain/vec3";

// computeUnitRatio derives the scale factor that turns a scene-space
// distance back into the source mesh's original units. The converter
// normalises every mesh to a max axis of 2 scene units, so the largest
// bbox dimension divided by 2 is the conversion factor. A return of 1
// means "metadata missing → fall back to raw scene units".
export function computeUnitRatio(dimensions: Vec3): number {
  const max = Math.max(dimensions.x, dimensions.y, dimensions.z);
  if (!Number.isFinite(max) || max <= 0) return 1;
  return max / 2;
}
