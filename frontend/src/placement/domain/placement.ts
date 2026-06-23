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
  // Allowlist of panorama ids this placement is shown in (panorama mode
  // only — the 3D view always shows every placement). Empty = hidden in
  // every panorama.
  visiblePanoramaIds: number[];
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
  // Initial panorama allowlist — set to the active panorama when a
  // placement is dropped in panorama mode.
  visiblePanoramaIds?: number[];
}

export interface PlacementUpdate extends PlacementTransform {
  label: string;
}
