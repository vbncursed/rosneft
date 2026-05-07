import type { Vec3 } from "@/shared/domain/vec3";
import type { LodArtifact } from "@/shared/domain/lod-artifact";

// PlacementTransform is the spatial state of a placement: position +
// rotation (XYZ Euler radians) + per-axis scale. Carried by the in-scene
// gizmo (commit on drag end) and the form panel.
export interface PlacementTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

// Placement is a positioned overlay of a Model on top of a Territory.
export interface Placement extends PlacementTransform {
  id: number;
  territorySlug: string;
  modelSlug: string;
  label: string;
  // Server-side mutation marker; consumers re-key on it so a successful
  // in-scene drag refreshes any open form inputs to the new values.
  updatedAt: string;
}

// ResolvedPlacement is a Placement enriched with its model's full LOD
// chain. Empty `lods` means the model has no converted artifact yet —
// the editor still shows the row so the user can reconvert.
export interface ResolvedPlacement extends Placement {
  lods: LodArtifact[];
}

export interface PlacementCreate {
  modelSlug: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  label?: string;
}

export interface PlacementUpdate extends PlacementTransform {
  label: string;
}
