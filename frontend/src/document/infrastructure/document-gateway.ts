import {
  httpDelete,
  httpGet,
  httpPost,
} from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { Document, DocumentCreate } from "@/document/domain/document";

type DocumentDto = components["schemas"]["Document"];

export function mapDocument(d: DocumentDto): Document {
  return {
    id: d.id,
    territorySlug: d.territorySlug,
    title: d.title,
    sourceBlobHash: d.sourceBlobHash,
    createdAt: d.createdAt ?? "",
  };
}

const base = (slug: string) =>
  `/api/territories/${encodeURIComponent(slug)}/documents`;

export async function listDocuments(territorySlug: string): Promise<Document[]> {
  const data = await httpGet<DocumentDto[]>(base(territorySlug));
  return data.map(mapDocument);
}

export async function createDocument(
  territorySlug: string,
  body: DocumentCreate,
): Promise<Document> {
  const data = await httpPost<DocumentDto>(base(territorySlug), body);
  return mapDocument(data);
}

export async function deleteDocument(
  territorySlug: string,
  id: number,
): Promise<void> {
  return httpDelete(`${base(territorySlug)}/${id}`);
}
