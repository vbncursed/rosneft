"use client";

import { useReducedMotion, type Variants } from "motion/react";

// resolveVariants keeps the state change (mount/unmount still cross-fades) but
// drops movement and scale for users who prefer reduced motion. Pure so it can
// be unit-tested without a renderer.
export function resolveVariants(variants: Variants, reduced: boolean): Variants {
  if (!reduced) return variants;
  return { hidden: { opacity: 0 }, visible: { opacity: 1 } };
}

export function useResolvedVariants(variants: Variants): Variants {
  return resolveVariants(variants, useReducedMotion() ?? false);
}
