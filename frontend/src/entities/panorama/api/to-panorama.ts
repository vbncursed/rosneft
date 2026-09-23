import type { components } from "@/shared/api/dto";
import type { Panorama } from "../model/panorama";

type PanoramaDto = components["schemas"]["Panorama"];

export const toPanorama = (d: PanoramaDto): Panorama => ({
  id: d.id,
  territorySlug: d.territorySlug,
  slug: d.slug,
  title: d.title,
  sourceBlobHash: d.sourceBlobHash,
  position: d.position,
  yawOffset: d.yawOffset,
  defaultYaw: d.defaultYaw,
  thumbnailBlobHash: d.thumbnailBlobHash ?? null,
  updatedAt: d.updatedAt ?? "",
});
