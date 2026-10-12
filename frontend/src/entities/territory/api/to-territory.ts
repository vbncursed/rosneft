import type * as Dto from "@/shared/api/dto";
import type { Territory } from "../model/territory";

type TerritoryDto = Dto.Territory;

/** Empty strings from the gateway mean "none"; the model says so with absence. */
export function toTerritory(d: TerritoryDto): Territory {
  return {
    slug: d.slug,
    title: d.title,
    ...(d.description ? { description: d.description } : {}),
    ...(d.externalPanoramaUrl ? { externalPanoramaUrl: d.externalPanoramaUrl } : {}),
    sourceBlobHash: d.sourceBlobHash,
    ...(d.createdAt ? { createdAt: d.createdAt } : {}),
    ...(d.updatedAt ? { updatedAt: d.updatedAt } : {}),
    placementCount: d.placementCount ?? 0,
    ...(d.lods ? { lods: d.lods } : {}),
  };
}
