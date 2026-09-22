export type Side = "top" | "bottom";
export type Box = { top: number; left: number; width: number; height: number };

/** Space between the trigger and the tooltip. */
export const GAP = 6;
/** The tooltip never comes closer than this to the viewport's edge. */
export const EDGE = 8;

// Above or below the trigger, centred on it. It takes the other side when the
// asked one does not fit and the other one does; with room on neither it keeps
// the asked side rather than jump. Horizontally it slides to stay on screen.
export function placeTooltip(
  trigger: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  side: Side,
): { top: number; left: number; side: Side } {
  const above = trigger.top - GAP - tip.height;
  const below = trigger.top + trigger.height + GAP;
  const fits = { top: above >= EDGE, bottom: below + tip.height <= viewport.height - EDGE };
  const other: Side = side === "top" ? "bottom" : "top";
  const chosen = fits[side] || !fits[other] ? side : other;
  const centred = trigger.left + trigger.width / 2 - tip.width / 2;
  const left = Math.min(Math.max(centred, EDGE), viewport.width - EDGE - tip.width);
  return { top: chosen === "top" ? above : below, left, side: chosen };
}
