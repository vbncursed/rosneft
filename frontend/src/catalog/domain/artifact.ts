import type { Vec3 } from "@/shared/domain/vec3";
import type { LodArtifact } from "@/catalog/domain/lod-artifact";

export interface Artifact {
  projectSlug: string;
  lod: number;
  hash: string;
  contentType: string;
  size: number;
  vertices?: number;
  faces?: number;
  bboxMin?: Vec3;
  bboxMax?: Vec3;
  createdAt?: string;
  // lods carries the full LOD chain for this project. Only populated by
  // the /scene endpoint; /artifacts list/get leaves it undefined to avoid
  // recursive payloads. Top-level fields (bbox, contentType) reflect LOD0.
  lods?: LodArtifact[];
}

// bboxAxis returns the size of one axis of a bounding box, rounded to 2
// decimals. Returns 0 when either bound is missing.
export function bboxAxis(min: number | undefined, max: number | undefined): number {
  if (min === undefined || max === undefined) return 0;
  return Number((max - min).toFixed(2));
}
