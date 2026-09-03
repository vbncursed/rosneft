import type { components } from "@/shared/api/dto";
import type { Model } from "../model/model";

type ModelDto = components["schemas"]["Model"];

export function toModel(d: ModelDto): Model {
  return {
    slug: d.slug,
    title: d.title,
    ...(d.description ? { description: d.description } : {}),
    sourceBlobHash: d.sourceBlobHash,
    ...(d.thumbnailBlobHash ? { thumbnailBlobHash: d.thumbnailBlobHash } : {}),
    ...(d.createdAt ? { createdAt: d.createdAt } : {}),
    ...(d.updatedAt ? { updatedAt: d.updatedAt } : {}),
  };
}
