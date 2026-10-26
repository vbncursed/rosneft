import type { PagePath } from "./extract-paths";
import { boxAt, dist, fromUv, minAreaBox, type Pt } from "./geometry";

export interface PlanRect {
  corners: [Pt, Pt, Pt, Pt];
  widthPt: number;
  heightPt: number;
  angle: number; // radians in [0, pi/2): direction of the width side in page space
}

// ~1 m at the plan's 6.6 pt/m; used while no drawing scale is known.
export const MIN_SIDE_PT_UNSCALED = 6;

const COS_TOLERANCE = 0.05;
const MERGE_PT = 0.5;
const GRID_PT = 0.5;
const HOLE_INSET_PT = 0.25; // frame lines are ~0.6 pt thick; hole corners sit at least this far inside
const FRAME_RING = 8; // a thick rectangular frame is eight filled triangles
const PAGE_FRAME_RATIO = 0.9;

function toRect(c: [Pt, Pt, Pt, Pt]): PlanRect {
  const width = (dist(c[0], c[1]) + dist(c[3], c[2])) / 2;
  const height = (dist(c[1], c[2]) + dist(c[0], c[3])) / 2;
  const angle = Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x);
  return {
    corners: c,
    widthPt: width,
    heightPt: height,
    angle: ((angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2),
  };
}

// Drops repeated points, the closing repeat and collinear vertices.
function simplify(points: Pt[]): Pt[] {
  let q = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 0.3);
  if (q.length > 1 && dist(q[0], q[q.length - 1]) < 0.3) q = q.slice(0, -1);
  for (let again = true; again && q.length > 3;) {
    again = false;
    for (let i = 0; i < q.length; i++) {
      const [a, b, c] = [q[(i + q.length - 1) % q.length], q[i], q[(i + 1) % q.length]];
      const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) / (dist(a, c) || 1) < 0.3) {
        q.splice(i, 1);
        again = true;
        break;
      }
    }
  }
  return q;
}

function outlineRect(path: PagePath): PlanRect | null {
  const closesBack = path.points.length > 3 && dist(path.points[0], path.points[path.points.length - 1]) < 0.5;
  if (!path.closed && !closesBack) return null;
  const q = simplify(path.points);
  if (q.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [q[i], q[(i + 1) % 4], q[(i + 2) % 4]];
    const cos = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (dist(a, b) * dist(b, c));
    if (Math.abs(cos) > COS_TOLERANCE) return null;
  }
  return toRect(q as [Pt, Pt, Pt, Pt]);
}

// Groups filled triangles that share a vertex on the 0.5 pt grid.
function triangleClusters(paths: PagePath[]): Pt[][][] {
  const tris = paths.filter((p) => p.points.length === 3 && p.fill !== null).map((p) => p.points);
  const parent = tris.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  tris.forEach((t, i) =>
    t.forEach((p) => {
      const key = `${Math.round(p.x / GRID_PT)},${Math.round(p.y / GRID_PT)}`;
      const o = owner.get(key);
      if (o === undefined) owner.set(key, i);
      else parent[find(i)] = find(o);
    }),
  );
  const groups = new Map<number, Pt[][]>();
  tris.forEach((t, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), t]));
  return [...groups.values()];
}

// The frame's centreline: the mean of the outer rectangle and the hole.
function frameRect(triangles: Pt[][]): PlanRect | null {
  const pts = triangles.flat();
  const outer = minAreaBox(pts);
  const inside = pts.filter((p) => {
    const b = boxAt([p], outer.angle);
    return (
      b.u0 > outer.u0 + HOLE_INSET_PT &&
      b.u0 < outer.u1 - HOLE_INSET_PT &&
      b.v0 > outer.v0 + HOLE_INSET_PT &&
      b.v0 < outer.v1 - HOLE_INSET_PT
    );
  });
  if (inside.length < 3) return null;
  const hole = boxAt(inside, outer.angle);
  const [u0, u1] = [(outer.u0 + hole.u0) / 2, (outer.u1 + hole.u1) / 2];
  const [v0, v1] = [(outer.v0 + hole.v0) / 2, (outer.v1 + hole.v1) / 2];
  const a = outer.angle;
  return toRect([fromUv(a, u0, v0), fromUv(a, u1, v0), fromUv(a, u1, v1), fromUv(a, u0, v1)]);
}

const sameRect = (a: PlanRect, b: PlanRect): boolean => {
  const centre = (r: PlanRect) => ({
    x: r.corners.reduce((s, c) => s + c.x, 0) / 4,
    y: r.corners.reduce((s, c) => s + c.y, 0) / 4,
  });
  const [lo, hi] = [a, b].map((r) => [r.widthPt, r.heightPt].sort((x, y) => x - y));
  return (
    dist(centre(a), centre(b)) < MERGE_PT && Math.abs(lo[0] - hi[0]) < MERGE_PT && Math.abs(lo[1] - hi[1]) < MERGE_PT
  );
};

// detectRects finds the rectangles a plan draws: closed right-angled four-vertex
// outlines, and thick frames drawn as eight filled triangles.
export function detectRects(paths: PagePath[], page: { width: number; height: number }, minSidePt: number): PlanRect[] {
  const found: (PlanRect | null)[] = paths.filter((p) => p.points.length !== 3).map(outlineRect);
  for (const cluster of triangleClusters(paths)) if (cluster.length === FRAME_RING) found.push(frameRect(cluster));

  const [pageShort, pageLong] = [page.width, page.height].sort((x, y) => x - y);
  const out: PlanRect[] = [];
  for (const r of found) {
    if (!r) continue;
    const [short, long] = [r.widthPt, r.heightPt].sort((x, y) => x - y);
    if (short < minSidePt) continue;
    if (short >= pageShort * PAGE_FRAME_RATIO && long >= pageLong * PAGE_FRAME_RATIO) continue;
    if (!out.some((o) => sameRect(o, r))) out.push(r);
  }
  return out;
}
