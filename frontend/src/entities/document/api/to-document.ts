import type { components } from "@/shared/api/dto";
import type { Document } from "../model/document";

type DocumentDto = components["schemas"]["Document"];

export const toDocument = (d: DocumentDto): Document => ({
  id: d.id,
  territorySlug: d.territorySlug,
  title: d.title,
  sourceBlobHash: d.sourceBlobHash,
  createdAt: d.createdAt ?? "",
});
