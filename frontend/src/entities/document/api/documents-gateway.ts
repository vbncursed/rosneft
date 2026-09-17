import { httpDelete, httpGet, httpPost } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Document, DocumentCreate } from "../model/document";
import { toDocument } from "./to-document";

type DocumentDto = components["schemas"]["Document"];
const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/documents`;

export const listDocuments = async (slug: string): Promise<Document[]> =>
  (await httpGet<DocumentDto[]>(base(slug))).map(toDocument);

export const createDocument = async (slug: string, body: DocumentCreate): Promise<Document> =>
  toDocument(await httpPost<DocumentDto>(base(slug), body));

export const deleteDocument = (slug: string, id: number): Promise<void> =>
  httpDelete(`${base(slug)}/${id}`);
