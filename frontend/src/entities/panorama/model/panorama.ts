import type { Vec3 } from "@/entities/placement";

/** An equirect photo anchored at `position` in scene units; `yawOffset` turns the sphere, `defaultYaw` is where a reader first looks. Both radians. */
export type Panorama = {
  id: number;
  territorySlug: string;
  slug: string;
  title: string;
  sourceBlobHash: string;
  position: Vec3;
  yawOffset: number;
  defaultYaw: number;
  updatedAt: string;
};

export type PanoramaCreate = { title: string; sourceBlobHash: string; position?: Vec3; yawOffset?: number };

/** Every field, every time: the gateway's PUT replaces the row and zeroes what is absent. */
export type PanoramaUpdate = { title: string; position: Vec3; yawOffset: number; defaultYaw: number };

/** The mock's "not calibrated yet": nothing has moved the anchor off the origin. */
export const isCalibrated = (p: Panorama): boolean =>
  p.position.x !== 0 || p.position.y !== 0 || p.position.z !== 0 || p.yawOffset !== 0;
