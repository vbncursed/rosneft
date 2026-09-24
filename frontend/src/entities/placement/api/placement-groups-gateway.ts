import { httpDelete, httpPatch, httpPost } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { PlacementGroup } from "../model/placement";

type PlacementGroupDto = components["schemas"]["PlacementGroup"];

const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/placement-groups`;

/** The panel draws the title alone; the timestamps are the journal's business. */
export const toPlacementGroup = (d: PlacementGroupDto): PlacementGroup => ({ id: d.id, title: d.title });

export async function createPlacementGroup(territorySlug: string, title: string): Promise<PlacementGroup> {
  return toPlacementGroup(await httpPost<PlacementGroupDto>(base(territorySlug), { title }));
}

export async function renamePlacementGroup(
  territorySlug: string,
  id: number,
  title: string,
): Promise<PlacementGroup> {
  return toPlacementGroup(await httpPatch<PlacementGroupDto>(`${base(territorySlug)}/${id}`, { title }));
}

/** The group goes; its placements stay and drop back to No group (ON DELETE SET NULL). */
export function deletePlacementGroup(territorySlug: string, id: number): Promise<void> {
  return httpDelete(`${base(territorySlug)}/${id}`);
}
