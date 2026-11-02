import type { Vec3 } from "@/entities/placement";

// The territory model's source-unit bounding box, as exposed by the
// artifact. It is already in the converter's Y-up frame: x = UTM easting,
// y = elevation, z = -(UTM northing).
export interface SourceBbox {
  min: Vec3;
  max: Vec3;
}

// The converter centres the mesh and scales its largest axis to 2 units.
// Null for an empty box.
export function sceneScale(bbox: SourceBbox): number | null {
  const maxDim = Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);
  return maxDim > 0 ? 2 / maxDim : null;
}

// utmToScene maps a UTM easting/northing to the territory's normalised scene
// x/z, or null when it falls outside the model footprint.
export function utmToScene(e: number, n: number, bbox: SourceBbox): { x: number; z: number } | null {
  const sx = e;
  const sz = -n;
  if (sx < bbox.min.x || sx > bbox.max.x || sz < bbox.min.z || sz > bbox.max.z) return null;
  const scale = sceneScale(bbox);
  if (scale === null) return null;
  return {
    x: (sx - (bbox.min.x + bbox.max.x) / 2) * scale,
    z: (sz - (bbox.min.z + bbox.max.z) / 2) * scale,
  };
}
