import { type RefObject, useLayoutEffect, useState } from "react";

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// useAnchoredPosition tracks the viewport rect of `anchor` while `enabled` is
// true. Position is recomputed on scroll (capture phase, so any ancestor
// scroll bubbles up to the listener) and resize. Returns null until the first
// measurement to avoid a flash at the origin, and null again whenever the
// anchor is absent from the DOM.
//
// `anchor` is either a ref or a CSS selector. The selector form exists for the
// onboarding tour, which finds its target by `data-tour` attribute and changes
// it every step — a mutated `ref.current` would not re-trigger the effect,
// whereas a changed selector string does.
//
// Used by the dropdown menu to position itself relative to its trigger after
// being portaled out of the React tree — we lose the trigger's stacking
// context but keep its on-screen anchor.
export function useAnchoredPosition(
  anchor: RefObject<HTMLElement | null> | string,
  enabled: boolean,
): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useLayoutEffect(() => {
    // Stale rect from the previous open is harmless — the menu is
    // unmounted while `enabled` is false, and the next mount re-measures
    // synchronously below before paint (useLayoutEffect contract).
    if (!enabled) return;

    // Resolved on every measure, not once: a selector's target can be unmounted
    // and remounted (a panel tab switching) between measurements.
    const measure = () => {
      const element =
        typeof anchor === "string"
          ? document.querySelector<HTMLElement>(anchor)
          : anchor.current;
      // A vanished anchor drops the rect rather than keeping a stale one, so
      // nothing is drawn at the old position.
      if (!element) {
        setRect(null);
        return;
      }
      const r = element.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchor, enabled]);

  return rect;
}
