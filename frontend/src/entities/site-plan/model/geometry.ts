// Page points: top-left origin, y down (the viewport applied).
export interface Pt {
  x: number;
  y: number;
}

export type Matrix = [number, number, number, number, number, number];

// mul(a, b) applies b first, then a (column-vector convention, as PDF's cm).
export const mul = (a: ArrayLike<number>, b: ArrayLike<number>): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

export const apply = (m: ArrayLike<number>, x: number, y: number): Pt => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export interface Box {
  angle: number; // radians, direction of the u axis in page space
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

// Cross product of o->a and o->b.
const cross = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const half = (src: Pt[]): Pt[] => {
    const h: Pt[] = [];
    for (const q of src) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    return h.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

// Extents of the points in the frame rotated by `angle`.
export function boxAt(points: Pt[], angle: number): Box {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const box: Box = { angle, u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity };
  for (const p of points) {
    const u = p.x * c + p.y * s;
    const v = -p.x * s + p.y * c;
    box.u0 = Math.min(box.u0, u);
    box.u1 = Math.max(box.u1, u);
    box.v0 = Math.min(box.v0, v);
    box.v1 = Math.max(box.v1, v);
  }
  return box;
}

// Minimum-area oriented box: one side lies on a hull edge. angle in [0, pi/2).
export function minAreaBox(points: Pt[]): Box {
  const hull = convexHull(points);
  let best: Box | null = null;
  for (let i = 0; i < hull.length; i++) {
    const [a, b] = [hull[i], hull[(i + 1) % hull.length]];
    const angle = ((Math.atan2(b.y - a.y, b.x - a.x) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2) || 0;
    const box = boxAt(points, angle);
    if (!best || (box.u1 - box.u0) * (box.v1 - box.v0) < (best.u1 - best.u0) * (best.v1 - best.v0) - 1e-9) best = box;
  }
  return best ?? boxAt(points, 0);
}

// Back from the box frame to page space.
export const fromUv = (angle: number, u: number, v: number): Pt => ({
  x: u * Math.cos(angle) - v * Math.sin(angle),
  y: u * Math.sin(angle) + v * Math.cos(angle),
});
