import type * as Dto from "@/shared/api/dto";
import type { Calibration, Document } from "../model/document";

type DocumentDto = Dto.Document;

export const toCalibration = (c: Dto.Calibration): Calibration => ({
  page: c.page,
  points: c.points.map((p) => ({ pdf: p.pdf, scene: p.scene, utm: p.utm })),
});

export const toDocument = (d: DocumentDto): Document => ({
  id: d.id,
  territorySlug: d.territorySlug,
  title: d.title,
  sourceBlobHash: d.sourceBlobHash,
  createdAt: d.createdAt ?? "",
  calibration: d.calibration ? toCalibration(d.calibration) : null,
});
