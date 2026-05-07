import type { Vec3 } from "@/shared/domain/vec3";
import type { LodArtifact } from "@/shared/domain/lod-artifact";

// Artifact is a converted GLB output for either a Territory or a Model.
// Slug refers to whichever entity owns it — the gateway sets it from
// territorySlug or modelSlug at the boundary.
export interface Artifact {
  slug: string;
  lod: number;
  hash: string;
  contentType: string;
  size: number;
  vertices?: number;
  faces?: number;
  bboxMin?: Vec3;
  bboxMax?: Vec3;
  createdAt?: string;
  lods?: LodArtifact[];
}

export function bboxAxis(min: number | undefined, max: number | undefined): number {
  if (min === undefined || max === undefined) return 0;
  return Number((max - min).toFixed(2));
}
