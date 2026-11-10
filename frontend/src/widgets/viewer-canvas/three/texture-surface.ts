import { Vector3, type Mesh } from "three";

type Point = { x: number; y: number; z: number };

/** Resolves a batch in one triangle pass; overlapping islands at different locations are ambiguous. */
export function pointsOnTexture(mesh: Mesh, points: { x: number; y: number }[]): (Point | null)[] {
  const { geometry } = mesh;
  const uv = geometry.getAttribute("uv"),
    position = geometry.getAttribute("position");
  if (!uv || !position) return points.map(() => null);
  const index = geometry.getIndex(),
    count = index?.count ?? position.count;
  const found: (Vector3 | null)[] = points.map(() => null);
  const ambiguous = new Set<number>();
  for (let i = 0; i + 2 < count; i += 3) {
    const a = index ? index.getX(i) : i,
      b = index ? index.getX(i + 1) : i + 1,
      c = index ? index.getX(i + 2) : i + 2;
    const ax = uv.getX(a),
      ay = uv.getY(a),
      bx = uv.getX(b),
      by = uv.getY(b),
      cx = uv.getX(c),
      cy = uv.getY(c);
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const minX = Math.min(ax, bx, cx) - 1e-7,
      maxX = Math.max(ax, bx, cx) + 1e-7;
    const minY = Math.min(ay, by, cy) - 1e-7,
      maxY = Math.max(ay, by, cy) + 1e-7;
    for (let j = 0; j < points.length; j++) {
      if (ambiguous.has(j)) continue;
      const { x: u, y: v } = points[j];
      if (u < minX || u > maxX || v < minY || v > maxY) continue;
      const wa = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / det;
      const wb = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / det;
      const wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) < -1e-7) continue;
      const p = new Vector3(
        wa * position.getX(a) + wb * position.getX(b) + wc * position.getX(c),
        wa * position.getY(a) + wb * position.getY(b) + wc * position.getY(c),
        wa * position.getZ(a) + wb * position.getZ(b) + wc * position.getZ(c),
      ).applyMatrix4(mesh.matrixWorld);
      if (found[j] && found[j]!.distanceToSquared(p) > 1e-10) ambiguous.add(j);
      else found[j] = p;
    }
  }
  return found.map((p, i) => (p && !ambiguous.has(i) ? { x: p.x, y: p.y, z: p.z } : null));
}

export function pointOnTexture(mesh: Mesh, u: number, v: number): Point | null {
  return pointsOnTexture(mesh, [{ x: u, y: v }])[0];
}
