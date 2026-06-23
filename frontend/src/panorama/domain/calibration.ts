import type { Vec3 } from "@/shared/domain/vec3";
import type { Panorama } from "@/panorama/domain/panorama";

// Live, unsaved calibration values for the panorama being aligned.
export interface CalibrationDraft {
  position: Vec3;
  yawOffset: number;
}

const MIN_OPACITY = 0.15;
const MAX_OPACITY = 1;

// clampOpacity keeps the ghosted photo visible enough to align against
// while still letting the model show through.
export function clampOpacity(o: number): number {
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, o));
}

// nudgePosition returns a copy of pos with one axis shifted by delta.
export function nudgePosition(
  pos: Vec3,
  axis: "x" | "y" | "z",
  delta: number,
): Vec3 {
  return { ...pos, [axis]: pos[axis] + delta };
}

// applyCalibration overlays a draft (position + yaw) onto a panorama,
// producing the panorama as it should render while calibrating.
export function applyCalibration(
  base: Panorama,
  draft: CalibrationDraft,
): Panorama {
  return { ...base, position: draft.position, yawOffset: draft.yawOffset };
}
