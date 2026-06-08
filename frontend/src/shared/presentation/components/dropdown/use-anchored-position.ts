import { type RefObject, useLayoutEffect, useState } from "react";

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// useAnchoredPosition tracks the viewport rect of `anchorRef` while
// `enabled` is true. Position is recomputed on scroll (capture phase, so
// any ancestor scroll bubbles up to the listener) and resize. Returns
// null until the first measurement to avoid a flash at the origin.
//
// Used by the dropdown menu to position itself relative to its trigger
// after being portaled out of the React tree — we lose the trigger's
// stacking context but keep its on-screen anchor.
export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useLayoutEffect(() => {
    // Stale rect from the previous open is harmless — the menu is
    // unmounted while `enabled` is false, and the next mount re-measures
    // synchronously below before paint (useLayoutEffect contract).
    if (!enabled) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    const measure = () => {
      const r = anchor.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef, enabled]);

  return rect;
}
