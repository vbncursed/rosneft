import type { Vec3 } from "@/entities/placement";

/**
 * Every zone stands this tall, whatever it is for: one constant, no height in
 * the database. 3 m is a typical cabin or piece of equipment, enough to see
 * and to click from an ordinary orbit camera without hiding what is behind.
 */
export const ZONE_HEIGHT_M = 3;

/** Triangles in one zone's faces: the top (2) and four sides (2 each). */
export const FACE_TRIANGLES = 10;
const VERTICES = 8;

/** The height in scene units; an unknown scale (`unitRatio` not positive) reads as one unit per metre. */
export const zoneHeight = (unitRatio: number) =>
  ZONE_HEIGHT_M / (unitRatio > 0 && Number.isFinite(unitRatio) ? unitRatio : 1);

/** The zone a raycast's triangle belongs to, in the order the zones were given. */
export const zoneOfTriangle = (faceIndex: number) => Math.floor(faceIndex / FACE_TRIANGLES);

export type PrismGeometry = {
  /** Per zone: its four corners at their own height, then the same four raised by the height. */
  positions: Float32Array;
  /** Top and sides; the underside stays open, nothing is ever seen or hit from below the ground. */
  faces: Uint32Array;
  /** The twelve edges as line-segment pairs. */
  edges: Uint32Array;
};

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/** The faces and edges of every zone's prism as three flat arrays: one merged mesh and one merged outline. */
export function prismGeometry(zones: [Vec3, Vec3, Vec3, Vec3][], height: number): PrismGeometry {
  const positions = new Float32Array(zones.length * VERTICES * 3);
  const faces = new Uint32Array(zones.length * FACE_TRIANGLES * 3);
  const edges = new Uint32Array(zones.length * 24);
  zones.forEach((corners, z) => {
    const base = z * VERTICES;
    corners.forEach((c, i) => {
      const y = finite(c.y);
      positions.set([c.x, y, c.z], (base + i) * 3);
      // The raised ring lives four vertices on, so the sides below index both rings alike.
      positions.set([c.x, y + height, c.z], (base + i + 4) * 3);
    });
    const tri = [4, 5, 6, 4, 6, 7];
    const ring = [0, 1, 2, 3];
    for (const i of ring) {
      const j = (i + 1) % 4;
      tri.push(i, j, j + 4, i, j + 4, i + 4);
    }
    faces.set(
      tri.map((v) => base + v),
      z * FACE_TRIANGLES * 3,
    );
    const lines = ring.flatMap((i) => [i, (i + 1) % 4, i + 4, ((i + 1) % 4) + 4, i, i + 4]);
    edges.set(
      lines.map((v) => base + v),
      z * 24,
    );
  });
  return { positions, faces, edges };
}
