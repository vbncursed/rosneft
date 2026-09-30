import type { components } from "@/shared/api/dto";
import type { Panorama } from "../model/panorama";

type PanoramaDto = components["schemas"]["Panorama"];
// A panorama from a bundle saved before phases existed (the desktop shell's
// offline snapshot) has neither field.
type StoredPanoramaDto = Omit<PanoramaDto, "phase" | "hidden"> & Partial<Pick<PanoramaDto, "phase" | "hidden">>;

export const toPanorama = (d: StoredPanoramaDto): Panorama => ({
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
  // Where migration 00022 put every panorama that predates phases.
  phase: d.phase ?? "prior",
  hidden: d.hidden ?? false,
});
