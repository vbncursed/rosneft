import type { Vec3 } from "@/shared/domain/vec3";

// Panorama is an equirectangular image (Insta360 Pro source) anchored to
// a point in a territory's scene-units space. The viewer can switch into
// "panorama mode" — the camera teleports to `position` and a sphere
// skybox is rendered around it. Placements stay shared with the 3D view
// (same FK to same territory, same coordinates), so equipment placed in
// either mode is visible from the other.
export interface Panorama {
  id: number;
  territorySlug: string;
  slug: string;
  title: string;
  // BlobStore hash for the equirect JPG/PNG; resolved via assetUrl().
  sourceBlobHash: string;
  position: Vec3;
  // Rotation (radians) around the sphere's Y axis to align the panorama's
  // implicit "north" with the territory's axes.
  yawOffset: number;
  updatedAt: string;
}

export interface PanoramaCreate {
  // The slug is generated server-side from the title — not supplied here.
  title: string;
  sourceBlobHash: string;
  position?: Vec3;
  yawOffset?: number;
}

export interface PanoramaUpdate {
  title: string;
  position: Vec3;
  yawOffset: number;
}
