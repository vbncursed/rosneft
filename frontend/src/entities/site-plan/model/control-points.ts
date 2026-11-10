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

type Coordinate = { axis: string; value: number; at: Pt };

function coordinates(items: Item[], viewport: number[]): Coordinate[] {
  return items.flatMap((item) => {
    const match = COORD.exec(item.str.trim());
    return match
      ? [{ axis: match[1], value: Number(match[2]), at: apply(viewport, item.transform[4], item.transform[5]) }]
      : [];
  });
}

function sameColumn(a: Pt, b: Pt): boolean {
  return Math.abs(a.x - b.x) < SAME_COLUMN_PT;
}

function claim(
  out: ControlPoint[],
  used: Set<Coordinate>,
  label: string,
  from: Pt,
  e: Coordinate | undefined,
  n: Coordinate | undefined,
) {
  if (!e || !n) return;
  used.add(e).add(n);
  out.push({ label, at: from, e: e.value, n: n.value });
}

// What is left: an E line with its N line directly beneath (or above) it.
function claimBarePairs(coords: Coordinate[], used: Set<Coordinate>, out: ControlPoint[]): void {
  for (const e of coords.filter((c) => c.axis === "E" && !used.has(c))) {
    const n = coords.find(
      (c) => c.axis === "N" && !used.has(c) && sameColumn(c.at, e.at) && Math.abs(c.at.y - e.at.y) < LINES_BELOW_PT,
    );
    claim(out, used, GENERAL_LABEL, e.at, e, n);
  }
}

// controlPoints reads the plan's survey labels: `ME<n>` followed by `N:`/`E:`
// lines, and a bare `E: ... N: ...` pair.
export function controlPoints(text: { items: Item[] }, viewport: number[]): ControlPoint[] {
  const coords = coordinates(text.items, viewport);
  const used = new Set<Coordinate>();
  const near = (axis: string, from: Pt) =>
    coords
      .filter((c) => c.axis === axis && !used.has(c) && sameColumn(c.at, from))
      .filter((c) => c.at.y > from.y && c.at.y - from.y < LINES_BELOW_PT)
      .sort((a, b) => dist(a.at, from) - dist(b.at, from))[0];

  const out: ControlPoint[] = [];
  for (const i of text.items) {
    if (!ME.test(i.str.trim())) continue;
    const from = apply(viewport, i.transform[4], i.transform[5]);
    claim(out, used, i.str.trim(), from, near("E", from), near("N", from));
  }
  claimBarePairs(coords, used, out);
  return out;
}
