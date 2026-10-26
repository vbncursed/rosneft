import { BufferAttribute, BufferGeometry } from "three";
import type { PreviewOutline } from "@/features/zone-editor";

const geometry = (positions: number[], index?: number[]) => {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  if (index) g.setIndex(index);
  return g;
};
const flat = (o: PreviewOutline) => o.corners.flatMap((c) => [c.x, c.y, c.z]);

/** Every outline's four sides as line segments: one draw call for all of them. */
export const segmentsGeometry = (outlines: PreviewOutline[]) =>
  geometry(
    outlines.flatMap((o) =>
      o.corners.flatMap((c, k) => {
        const next = o.corners[(k + 1) % 4];
        return [c.x, c.y, c.z, next.x, next.y, next.z];
      }),
    ),
  );

/** Two triangles per outline, in outline order, so triangle `faceIndex` belongs to outline `floor(faceIndex / 2)`. */
export const footprintsGeometry = (outlines: PreviewOutline[]) =>
  geometry(
    outlines.flatMap(flat),
    outlines.flatMap((_, i) => [0, 1, 2, 0, 2, 3].map((v) => i * 4 + v)),
  );

/** One outline as a closed loop, for the picked rectangle. */
export const loopGeometry = (outline: PreviewOutline) => geometry(flat(outline));
