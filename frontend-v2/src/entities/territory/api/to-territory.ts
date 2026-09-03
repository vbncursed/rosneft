import type { components } from "@/shared/api/dto";
import type { Territory } from "../model/territory";

type TerritoryDto = components["schemas"]["Territory"];

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
  };
}
