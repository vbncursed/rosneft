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
    territorySlug: d.territorySlug,
    modelSlug: d.modelSlug,
    position: d.position,
    rotation: d.rotation,
    scale: d.scale,
    label: d.label ?? "",
    updatedAt: d.updatedAt ?? "",
    visiblePanoramaIds: d.visiblePanoramaIds ?? [],
  };
}

const base = (slug: string) =>
  `/api/territories/${encodeURIComponent(slug)}/placements`;

export async function listPlacements(territorySlug: string): Promise<Placement[]> {
  const data = await httpGet<PlacementDto[]>(base(territorySlug));
  return data.map(mapPlacement);
}

export async function createPlacement(
  territorySlug: string,
  body: PlacementCreate,
): Promise<Placement> {
  const data = await httpPost<PlacementDto>(base(territorySlug), body);
  return mapPlacement(data);
}

export async function updatePlacement(
  territorySlug: string,
  id: number,
  body: PlacementUpdate,
): Promise<Placement> {
  const data = await httpPut<PlacementDto>(`${base(territorySlug)}/${id}`, body);
  return mapPlacement(data);
}

// setPlacementVisibility replaces a placement's panorama allowlist in full.
// Returns the server-acknowledged placement (new updatedAt) so callers can
// re-key any open form.
export async function setPlacementVisibility(
  territorySlug: string,
  id: number,
  panoramaIds: number[],
): Promise<Placement> {
  const data = await httpPut<PlacementDto>(
    `${base(territorySlug)}/${id}/visibility`,
    { panoramaIds },
  );
  return mapPlacement(data);
}

export async function deletePlacement(
  territorySlug: string,
  id: number,
): Promise<void> {
  return httpDelete(`${base(territorySlug)}/${id}`);
}
