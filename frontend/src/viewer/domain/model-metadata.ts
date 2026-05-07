import type { Vec3 } from "@/shared/domain/vec3";

// ModelMetadata is the catalog-derived view of a converted GLB. Geometry
// stats come from the catalog API (computed once on the server during
// conversion), not from browser-side mesh inspection.
export interface ModelMetadata {
  name: string;
  vertices: number;
  faces: number;
  dimensions: Vec3;
}
