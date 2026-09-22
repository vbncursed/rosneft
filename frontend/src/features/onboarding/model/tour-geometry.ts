import type { CSSProperties } from "react";

// The card's own width lives on TourTooltip (`w-80`); this is the same number,
// needed here for the fit maths. The two must agree.
const WIDTH = 320;
const GAP = 12;
// The card is measured once it is up (a four-line body runs ~215px); this is
// only the first frame's guess, and what a layout-less test sees.
export const HEIGHT = 190;
const HALO = 6;

// `clipLeft`: the left edge of the nearest scrolling container the anchor sits
// in — the Overlays panel for a panel control. Only the card reads it.
export type Rect = { top: number; left: number; width: number; height: number; clipLeft?: number };

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

const CENTRED: CSSProperties = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

// Beside the anchor when the card fits to its right, to the left of the panel
// it sits in when it does not (the Overlays panel is on the right edge, and a
// card over it would hide the headers that explain the control), below it
// when neither does, centred last.
export function cardStyle(rect: Rect | null, height: number): CSSProperties {
  if (!rect) return CENTRED;
  const beside = rect.left + rect.width + GAP;
  if (beside + WIDTH + GAP <= window.innerWidth) {
    return { top: clamp(rect.top, GAP, window.innerHeight - height - GAP), left: beside };
  }
  const before = Math.min(rect.left, rect.clipLeft ?? rect.left) - GAP - WIDTH;
  if (before >= GAP) {
    return { top: clamp(rect.top, GAP, window.innerHeight - height - GAP), left: before };
  }
  const below = rect.top + rect.height + GAP;
  if (below + height + GAP <= window.innerHeight) {
    return { top: below, left: clamp(rect.left, GAP, window.innerWidth - WIDTH - GAP) };
  }
  return CENTRED;
}

// The dim covers everything, and the mock redraws the anchored control *above*
// it — lit, not veiled at 60 %. An evenodd hole in the dim's own clip-path is
// the whole of that: no page element changes z-index (a control inside its own
// stacking context could not be raised above a fixed overlay anyway), and
// hit-testing follows the clip, so the lit control is what
// `document.elementFromPoint` answers at its centre. Losing the dim's click
// there is the point: the mock draws a live control, not a picture of one.
export function dimStyle(rect: Rect | null): CSSProperties {
  if (!rect) return {};
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const hole = [
    `${rect.left}px ${rect.top}px`,
    `${rect.left}px ${bottom}px`,
    `${right}px ${bottom}px`,
    `${right}px ${rect.top}px`,
    `${rect.left}px ${rect.top}px`,
  ].join(", ");
  return {
    clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${hole})`,
  };
}

export function haloStyle(rect: Rect): CSSProperties {
  return {
    top: rect.top - HALO,
    left: rect.left - HALO,
    width: rect.width + HALO * 2,
    height: rect.height + HALO * 2,
  };
}

// The part of `el` its clipping ancestors actually show. A tall anchor — the
// list of fifteen panoramas — is taller than the panel it scrolls in, and its
// raw box ran the halo and the dim's hole past the panel and off the screen.
// Keyed on the values that clip rather than on `visible`: jsdom computes the
// shorthand as "" on an element that never set it, and clipping to <body>'s
// empty box there hid every halo.
const CLIPS = /auto|scroll|hidden|clip/;
export function visibleRect(el: Element): Rect {
  let { top, left, right, bottom } = el.getBoundingClientRect();
  // The nearest *scrolling* clipper, not the widest clipper: the viewer's
  // <main> is overflow:hidden from x=0, and would push every panel card off
  // the left edge.
  let clipLeft: number | undefined;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (!CLIPS.test(style.overflow)) continue;
    const box = p.getBoundingClientRect();
    if (clipLeft === undefined && /auto|scroll/.test(style.overflow)) clipLeft = box.left;
    // A scrolled container may lay chrome over its own top — the Overlays
    // panel's "scrolled" strip — and declares that band as scroll-padding.
    const covered = p.scrollTop > 0 ? parseFloat(style.scrollPaddingTop) || 0 : 0;
    top = Math.max(top, box.top + covered);
    left = Math.max(left, box.left);
    right = Math.min(right, box.right);
    bottom = Math.min(bottom, box.bottom);
  }
  // Scrolled wholly out of a clipping ancestor, the box is empty; park it on
  // the clip's edge rather than at the anchor's own off-screen place.
  top = Math.min(top, bottom);
  left = Math.min(left, right);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top), clipLeft };
}

// The ancestor a wheel over the anchor should scroll: the nearest one that
// scrolls vertically and has somewhere to go.
export function scrollerOf(el: Element | null): Element | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}
