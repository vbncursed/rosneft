import type { LodArtifact } from "@/entities/scene";

export type Vec3 = { x: number; y: number; z: number };

/**
 * The spatial state of a placement: position, rotation (XYZ Euler radians)
 * and per-axis scale. Carried by the in-scene gizmo and the form panel alike.
 */
export type PlacementTransform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

/** A positioned overlay of a model on top of a territory. */
export type Placement = PlacementTransform & {
  id: number;
  territorySlug: string;
  modelSlug: string;
  label: string;
  /** Bumped server-side; consumers re-key on it so a drag refreshes the form. */
  updatedAt: string;
  /**
   * Panorama ids this placement shows in — panorama mode only; the 3D view
   * shows every placement that is not `hidden`. Empty means hidden in every panorama.
   */
  visiblePanoramaIds: number[];
  /** Hidden for everyone who opens the territory (G-1): not drawn, not preloaded, not framed. */
  hidden: boolean;
  /** The user group it sits in (at most one, G-2); null is "No group". */
  groupId: number | null;
};

export const IDENTITY_TRANSFORM: PlacementTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

/** Whether this placement is shown in the panorama currently being viewed. */
export function isVisibleIn(placement: Placement, panoramaId: number | null): boolean {
  if (panoramaId === null) return true;
  return placement.visiblePanoramaIds.includes(panoramaId);
}

const DEGREES = 180 / Math.PI;

/** Radians are what the scene stores; degrees are what a person types. */
export const toDegrees = (radians: number) => Number((radians * DEGREES).toFixed(2));
export const toRadians = (degrees: number) => degrees / DEGREES;

/** A placement with its model's LOD chain; empty when the model is not converted. */
export type ResolvedPlacement = Placement & { chain: LodArtifact[] };

/** The POST body: everything but the transform defaults the server fills in. */
export type PlacementCreate = {
  modelSlug: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  label?: string;
  /** Initial panorama allowlist (e.g. the active panorama). */
  visiblePanoramaIds?: number[];
  /** The user group it is placed into — a group's own Add (G-4). */
  groupId?: number;
};

/** The PUT body: the whole transform, plus the label, every time. */
export type PlacementUpdate = PlacementTransform & { label: string };
