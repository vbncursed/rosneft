import type { Pt, Similarity } from "@/entities/site-plan";
import type { Zone } from "@/entities/zone";

export type PlanZone = { id: number; title: string; corners: Pt[] };

/** applyFit backwards: a scene (x, z) back to page points. */
export function unapplyFit(fit: Similarity, p: { x: number; z: number }): Pt {
  const [c, s] = [Math.cos(fit.rotation), Math.sin(fit.rotation)];
  const [dx, dz] = [p.x - fit.tx, p.z - fit.tz];
  return { x: (c * dx + s * dz) / fit.scale, y: (c * dz - s * dx) / fit.scale };
}

/** The saved zones as polygons on the page, for the plan window to fill. */
export const planZones = (zones: Zone[], fit: Similarity | null): PlanZone[] =>
  fit ? zones.map((z) => ({ id: z.id, title: z.title, corners: z.corners.map((c) => unapplyFit(fit, c)) })) : [];
