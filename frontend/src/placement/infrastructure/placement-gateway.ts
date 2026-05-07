import {
  httpDelete,
  httpGet,
  httpPost,
  httpPut,
} from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type {
  Placement,
  PlacementCreate,
  PlacementUpdate,
} from "@/placement/domain/placement";

type PlacementDto = components["schemas"]["Placement"];

function mapPlacement(d: PlacementDto): Placement {
  return {
    id: d.id,
    parentSlug: d.parentSlug,
    assetSlug: d.assetSlug,
    position: d.position,
    rotation: d.rotation,
    scale: d.scale,
    label: d.label ?? "",
    updatedAt: d.updatedAt ?? "",
  };
}

export async function listPlacements(parentSlug: string): Promise<Placement[]> {
  const data = await httpGet<PlacementDto[]>(
    `/api/projects/${encodeURIComponent(parentSlug)}/placements`,
  );
  return data.map(mapPlacement);
}

export async function createPlacement(
  parentSlug: string,
  body: PlacementCreate,
): Promise<Placement> {
  const data = await httpPost<PlacementDto>(
    `/api/projects/${encodeURIComponent(parentSlug)}/placements`,
    body,
  );
  return mapPlacement(data);
}

export async function updatePlacement(
  parentSlug: string,
  id: number,
  body: PlacementUpdate,
): Promise<Placement> {
  const data = await httpPut<PlacementDto>(
    `/api/projects/${encodeURIComponent(parentSlug)}/placements/${id}`,
    body,
  );
  return mapPlacement(data);
}

export async function deletePlacement(
  parentSlug: string,
  id: number,
): Promise<void> {
  return httpDelete(
    `/api/projects/${encodeURIComponent(parentSlug)}/placements/${id}`,
  );
}
