import { toModelTag } from "@/entities/model-tag";
import type * as Dto from "@/shared/api/dto";
import type { Zone } from "../model/zone";

export const toZone = (d: Dto.Zone): Zone => ({
  id: d.id,
  title: d.title,
  corners: d.corners,
  tags: d.tags.map(toModelTag),
  drawingWidthM: d.drawingWidthM,
  drawingHeightM: d.drawingHeightM,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});
