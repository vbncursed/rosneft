export type PipGeometry = { x: number; y: number; w: number; h: number };
type Viewport = { w: number; h: number };

/** The mock's picture-in-picture window (spec §6.5), docked bottom-right by default. */
export const PIP_INIT = { w: 560, h: 400 };
export const PIP_MIN = { w: 320, h: 240 };

/** Docks a fresh window bottom-right, `inset` px from each edge — never off-screen to the left/top. */
export function dock(viewport: Viewport, inset: number): PipGeometry {
  return {
    w: PIP_INIT.w,
    h: PIP_INIT.h,
    x: Math.max(inset, viewport.w - PIP_INIT.w - inset),
    y: Math.max(inset, viewport.h - PIP_INIT.h - inset),
  };
}

/**
 * Moves `base` by (dx, dy), clamped to [0, viewport − size] on each axis. Size
 * is unchanged. The lower bound (0) is applied last, so a viewport narrower
 * than the window — where viewport − size is negative, an empty interval —
 * pins to 0 rather than letting the negative upper bound win and push the
 * window off-screen to the left/top.
 */
export function moved(base: PipGeometry, dx: number, dy: number, viewport: Viewport): PipGeometry {
  return {
    ...base,
    x: Math.max(0, Math.min(base.x + dx, viewport.w - base.w)),
    y: Math.max(0, Math.min(base.y + dy, viewport.h - base.h)),
  };
}

/**
 * Grows `base` from its fixed top-left corner, clamped to [min, viewport −
 * origin] on each axis. The minimum is applied last, for the same reason as
 * `moved`'s 0: a viewport too small for the origin makes viewport − origin
 * an empty interval below PIP_MIN, and the minimum must win it rather than
 * shrinking the window smaller than its floor.
 */
export function resized(base: PipGeometry, dx: number, dy: number, viewport: Viewport): PipGeometry {
  return {
    ...base,
    w: Math.max(PIP_MIN.w, Math.min(base.w + dx, viewport.w - base.x)),
    h: Math.max(PIP_MIN.h, Math.min(base.h + dy, viewport.h - base.y)),
  };
}
