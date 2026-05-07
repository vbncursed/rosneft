import type { Vec3 } from "@/shared/domain/vec3";
import type { LodArtifact } from "@/catalog/domain/lod-artifact";

// PlacementTransform is the spatial state of a placement: position +
// rotation (XYZ Euler radians) + per-axis scale. Carried both by the
// in-scene gizmo (commit on drag end) and the form panel.
export interface PlacementTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

// Placement is a positioned overlay of an asset project on top of a parent
// project's scene.
export interface Placement extends PlacementTransform {
  id: number;
  parentSlug: string;
  assetSlug: string;
  label: string;
  // Server-side mutation marker; consumers re-key on it so a successful
  // in-scene drag refreshes any open form inputs to the new values.
  updatedAt: string;
}

// ResolvedPlacement is a Placement enriched with its asset's full LOD
// chain. Empty `lods` means the asset has no converted artifact yet —
// the editor still shows the row so the user can reconvert. Renderer
// picks one LOD from the chain (typically LOD2 for distant placements,
// LOD0 for close ones) via pickLod / pickLodUrl.
export interface ResolvedPlacement extends Placement {
  lods: LodArtifact[];
}

export interface PlacementCreate {
  assetSlug: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  label?: string;
}

export interface PlacementUpdate extends PlacementTransform {
  label: string;
}
