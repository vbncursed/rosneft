import type { Vec3 } from "@/shared/domain/vec3";

// MeasurePoint is a single click-picked point on a visible surface (the
// parent GLB or any placement). Stored in scene-space.
export type MeasurePoint = Vec3;

// Measurement is a completed pair: two scene-space points and a stable id
// for keying.
export interface Measurement {
  id: number;
  a: MeasurePoint;
  b: MeasurePoint;
}
