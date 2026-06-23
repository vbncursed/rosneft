import { readExifGps } from "@/panorama/domain/exif-gps";
import {
  gpsToScenePosition,
  type SourceBbox,
} from "@/panorama/domain/geo-anchor";
import type { Vec3 } from "@/shared/domain/vec3";

export type ScenePositionResult =
  | { position: Vec3 }
  | { position: null; reason: "no-gps" | "outside" };

// exifScenePosition reads the file's EXIF GPS (head bytes only — EXIF lives
// near the start, so 256 KB avoids loading the whole multi-MB image) and
// maps it to the territory's scene coordinates. Returns a reason when no
// usable position is found so the caller can message precisely.
export async function exifScenePosition(
  file: File,
  bbox: SourceBbox | null,
): Promise<ScenePositionResult> {
  if (!bbox) return { position: null, reason: "no-gps" };
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const fix = readExifGps(head);
  if (!fix) return { position: null, reason: "no-gps" };
  const position = gpsToScenePosition(fix, bbox);
  if (!position) return { position: null, reason: "outside" };
  return { position };
}
