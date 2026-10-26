import { apply, dist, type Pt } from "./geometry";

export interface ControlPoint {
  label: string;
  at: Pt; // top-down page points
  e: number;
  n: number;
}

type Item = { str: string; transform: number[] };

const COORD = /^([EN])\s*:\s*(-?\d+(?:\.\d+)?)$/u;
const ME = /^ME\d+$/u;
export const GENERAL_LABEL = "Plan point";
const SAME_COLUMN_PT = 1; // a label's lines share its left edge
const LINES_BELOW_PT = 12; // and sit within a few text lines under it

// controlPoints reads the plan's survey labels: `ME<n>` followed by `N:`/`E:`
// lines, and a bare `E: ... N: ...` pair.
export function controlPoints(text: { items: Item[] }, viewport: number[]): ControlPoint[] {
  const at = (i: Item): Pt => apply(viewport, i.transform[4], i.transform[5]);
  const coords = text.items.flatMap((i) => {
    const m = COORD.exec(i.str.trim());
    return m ? [{ axis: m[1], value: Number(m[2]), at: at(i) }] : [];
  });
  const used = new Set<(typeof coords)[number]>();
  const near = (axis: string, from: Pt) =>
    coords
      .filter((c) => c.axis === axis && !used.has(c) && Math.abs(c.at.x - from.x) < SAME_COLUMN_PT)
      .filter((c) => c.at.y > from.y && c.at.y - from.y < LINES_BELOW_PT)
      .sort((a, b) => dist(a.at, from) - dist(b.at, from))[0];

  const out: ControlPoint[] = [];
  const claim = (
    label: string,
    from: Pt,
    e: (typeof coords)[number] | undefined,
    n: (typeof coords)[number] | undefined,
  ) => {
    if (!e || !n) return;
    used.add(e).add(n);
    out.push({ label, at: from, e: e.value, n: n.value });
  };
  for (const i of text.items) {
    if (!ME.test(i.str.trim())) continue;
    const from = at(i);
    claim(i.str.trim(), from, near("E", from), near("N", from));
  }
  // What is left: an E line with its N line directly beneath (or above) it.
  for (const e of coords.filter((c) => c.axis === "E" && !used.has(c))) {
    const n = coords.find(
      (c) =>
        c.axis === "N" &&
        !used.has(c) &&
        Math.abs(c.at.x - e.at.x) < SAME_COLUMN_PT &&
        Math.abs(c.at.y - e.at.y) < LINES_BELOW_PT,
    );
    claim(GENERAL_LABEL, e.at, e, n);
  }
  return out;
}
