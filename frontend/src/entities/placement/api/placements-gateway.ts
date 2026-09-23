import { httpDelete, httpPost, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { PlacementCreate, PlacementUpdate, Placement } from "../model/placement";
import { toPlacement } from "./to-placement";

type PlacementDto = components["schemas"]["Placement"];

const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/placements`;

/**
 * One transaction for the whole batch (1–100 items); the answer is the created rows, in order.
 * `idempotencyKey` names the placing action: the gateway answers a key it has seen on this
 * territory with the rows it already stored, so a retry after a lost answer places once.
 */
export async function createPlacements(
  territorySlug: string,
  items: PlacementCreate[],
  idempotencyKey: string,
): Promise<Placement[]> {
  const created = await httpPost<PlacementDto[]>(`${base(territorySlug)}/batch`, { items }, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return created.map(toPlacement);
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

/** Replaces the allowlist in full; the answer carries a fresh updatedAt so an open form re-keys. */
export async function setPlacementVisibility(
  territorySlug: string,
  id: number,
  panoramaIds: number[],
): Promise<Placement> {
  return toPlacement(
    await httpPut<PlacementDto>(`${base(territorySlug)}/${id}/visibility`, { panoramaIds }),
  );
}
