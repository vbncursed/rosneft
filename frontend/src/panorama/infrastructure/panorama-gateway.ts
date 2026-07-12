import {
  httpDelete,
  httpGet,
  httpPost,
  httpPut,
} from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type {
  Panorama,
  PanoramaCreate,
  PanoramaUpdate,
} from "@/panorama/domain/panorama";

type PanoramaDto = components["schemas"]["Panorama"];

function mapPanorama(d: PanoramaDto): Panorama {
  return {
    id: d.id,
    territorySlug: d.territorySlug,
    slug: d.slug,
    title: d.title,
    sourceBlobHash: d.sourceBlobHash,
    position: d.position,
    yawOffset: d.yawOffset,
    defaultYaw: d.defaultYaw,
    updatedAt: d.updatedAt ?? "",
  };
}

const base = (slug: string) =>
  `/api/territories/${encodeURIComponent(slug)}/panoramas`;

export async function listPanoramas(territorySlug: string): Promise<Panorama[]> {
  const data = await httpGet<PanoramaDto[]>(base(territorySlug));
  return data.map(mapPanorama);
}

export async function createPanorama(
  territorySlug: string,
  body: PanoramaCreate,
): Promise<Panorama> {
  const data = await httpPost<PanoramaDto>(base(territorySlug), body);
  return mapPanorama(data);
}

export async function updatePanorama(
  territorySlug: string,
  id: number,
  body: PanoramaUpdate,
): Promise<Panorama> {
  const data = await httpPut<PanoramaDto>(`${base(territorySlug)}/${id}`, body);
  return mapPanorama(data);
}

export async function deletePanorama(
  territorySlug: string,
  id: number,
): Promise<void> {
  return httpDelete(`${base(territorySlug)}/${id}`);
}
