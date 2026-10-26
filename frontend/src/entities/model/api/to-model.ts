import type * as Dto from "@/shared/api/dto";
import { toModelTag } from "@/entities/model-tag";
import type { Model } from "../model/model";

type ModelDto = Dto.Model;

export function toModel(d: ModelDto): Model {
  return {
    slug: d.slug,
    title: d.title,
    ...(d.description ? { description: d.description } : {}),
    sourceBlobHash: d.sourceBlobHash,
    tag: toModelTag(d.tag),
    ...(d.thumbnailBlobHash ? { thumbnailBlobHash: d.thumbnailBlobHash } : {}),
    ...(d.createdAt ? { createdAt: d.createdAt } : {}),
    ...(d.updatedAt ? { updatedAt: d.updatedAt } : {}),
    usageCount: d.usageCount ?? 0,
    ...(d.lods ? { lods: d.lods } : {}),
  };
}
