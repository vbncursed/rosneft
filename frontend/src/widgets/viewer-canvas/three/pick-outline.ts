import type { PreviewOutline } from "@/features/zone-editor";

type Ground = { x: number; z: number };

const area = ({ corners }: PreviewOutline) =>
  Math.abs(corners.reduce((s, c, k) => s + (c.x * corners[(k + 1) % 4].z - corners[(k + 1) % 4].x * c.z), 0)) / 2;

// A rectangle is convex: the point is inside when it is on one side of every
// edge (or on it), whichever way the corners wind.
function contains({ corners }: PreviewOutline, p: Ground): boolean {
  const sides = corners.map((c, k) => {
    const n = corners[(k + 1) % 4];
    return (n.x - c.x) * (p.z - c.z) - (n.z - c.z) * (p.x - c.x);
  });
  return sides.every((s) => s >= 0) || sides.every((s) => s <= 0);
}

/**
 * The editor index of the rectangle a ground point means: of every outline
 * containing it, the smallest, and the later index of two equal ones. That is
 * the plan window's rule (the smaller sits on top, a later button wins), so a
 * tank inside its bund can be reached from the model too.
 */
export function pickOutline(outlines: PreviewOutline[], at: Ground): number | null {
  let best: { index: number; area: number } | null = null;
  for (const o of outlines) {
    if (!contains(o, at)) continue;
    const a = area(o);
    if (!best || a < best.area || (a === best.area && o.index > best.index)) best = { index: o.index, area: a };
  }
  return best?.index ?? null;
}
