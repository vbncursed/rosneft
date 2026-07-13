import type { Transition } from "motion/react";

// Timing presets, anchored to the app's existing feel (the old dropdown-enter
// keyframe was 120ms). quick = menus/toasts, smooth = modals/panels.
export const quick: Transition = { duration: 0.15, ease: "easeOut" };
export const smooth: Transition = { duration: 0.25, ease: "easeOut" };
export const spring: Transition = { type: "spring", stiffness: 400, damping: 32 };
