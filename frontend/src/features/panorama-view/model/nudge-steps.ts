/**
 * How far one arrow press moves a calibration anchor, in scene units. A
 * territory is normalised to max-axis 2, so Fine is a shade under a thousandth
 * of it — enough to settle a capture point on a doorway — and Coarse crosses
 * the site in twenty presses.
 */
export const NUDGE_STEPS = [
  { label: "Fine", value: 0.005 },
  { label: "Med", value: 0.02 },
  { label: "Coarse", value: 0.1 },
] as const;

export type NudgeStep = (typeof NUDGE_STEPS)[number];
