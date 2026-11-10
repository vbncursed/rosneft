import type { Pt } from "@/entities/site-plan";

const EPS = 1e-9;
const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const orientation = (a: Pt, b: Pt, c: Pt) => {
  const value = cross(a, b, c);
  const tolerance = EPS * Math.hypot(b.x - a.x, b.y - a.y);
  return value > tolerance ? 1 : value < -tolerance ? -1 : 0;
};
const same = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
const onSegment = (p: Pt, a: Pt, b: Pt) =>
  orientation(a, b, p) === 0 &&
  p.x >= Math.min(a.x, b.x) - EPS &&
  p.x <= Math.max(a.x, b.x) + EPS &&
  p.y >= Math.min(a.y, b.y) - EPS &&
  p.y <= Math.max(a.y, b.y) + EPS;
const edges = (points: Pt[]) => points.map((p, i) => [p, points[(i + 1) % points.length]] as const);

function intersects(a: Pt, b: Pt, c: Pt, d: Pt) {
  const [x, y, z, w] = [orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)];
  return (
    (x * y < 0 && z * w < 0) || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)
  );
}

export function validFence(points: Pt[]) {
  if (points.length < 3 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  if (points.some((p, i) => points.some((q, j) => j > i && same(p, q)))) return false;
  const sides = edges(points);
  const area = sides.reduce((sum, [a, b]) => sum + cross(points[0], a, b), 0);
  const perimeter = sides.reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y), 0);
  if (Math.abs(area) <= EPS * perimeter) return false;
  return sides.every(([a, b], i) =>
    sides.every(([c, d], j) => {
      if (j <= i || j === i + 1 || (i === 0 && j === sides.length - 1)) return true;
      return !intersects(a, b, c, d);
    }),
  );
}

function inside(p: Pt, polygon: Pt[]) {
  let result = false;
  for (const [a, b] of edges(polygon)) {
    if (onSegment(p, a, b)) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

export function rectInsideFence(rect: Pt[], fence: Pt[]) {
  if (!rect.every((p) => inside(p, fence))) return false;
  return edges(rect).every(([a, b]) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const cuts = [0, 1];
    for (const [c, d] of edges(fence)) {
      const ex = d.x - c.x,
        ey = d.y - c.y;
      const det = dx * ey - dy * ex;
      if (Math.abs(det) > EPS * Math.hypot(dx, dy) * Math.hypot(ex, ey)) {
        const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / det;
        const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / det;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(t);
      } else if (orientation(a, b, c) === 0) {
        const length = dx * dx + dy * dy;
        if (length)
          for (const p of [c, d]) {
            const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
            if (t > 0 && t < 1) cuts.push(t);
          }
      }
    }
    cuts.sort((x, y) => x - y);
    return cuts.slice(1).every((t, i) => {
      const mid = (t + cuts[i]) / 2;
      return inside({ x: a.x + mid * dx, y: a.y + mid * dy }, fence);
    });
  });
}
