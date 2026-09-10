import { httpDelete, httpPost, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { PlacementCreate, PlacementUpdate, Placement } from "../model/placement";
import { toPlacement } from "./to-placement";

type PlacementDto = components["schemas"]["Placement"];

const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/placements`;

export async function createPlacement(
  territorySlug: string,
  body: PlacementCreate,
): Promise<Placement> {
  return toPlacement(await httpPost<PlacementDto>(base(territorySlug), body));
}

/** The PUT carries the whole transform plus the label — a partial body would blank the rest. */
export async function updatePlacement(
  territorySlug: string,
  id: number,
  body: PlacementUpdate,
): Promise<Placement> {
  return toPlacement(await httpPut<PlacementDto>(`${base(territorySlug)}/${id}`, body));
}

export function deletePlacement(territorySlug: string, id: number): Promise<void> {
  return httpDelete(`${base(territorySlug)}/${id}`);
}
