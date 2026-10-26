import { httpDelete, httpGet, httpPost, httpPut } from "@/shared/api";
import type * as Dto from "@/shared/api/dto";
import type { Calibration, Document, DocumentCreate } from "../model/document";
import { toCalibration, toDocument } from "./to-document";

type DocumentDto = Dto.Document;
const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/documents`;

export const listDocuments = async (slug: string): Promise<Document[]> =>
  (await httpGet<DocumentDto[]>(base(slug))).map(toDocument);

export const createDocument = async (slug: string, body: DocumentCreate): Promise<Document> =>
  toDocument(await httpPost<DocumentDto>(base(slug), body));

export const deleteDocument = (slug: string, id: number): Promise<void> => httpDelete(`${base(slug)}/${id}`);

const calibrationPath = (slug: string, id: number) => `${base(slug)}/${id}/calibration`;

export const putCalibration = async (slug: string, id: number, c: Calibration): Promise<Calibration> =>
  toCalibration(await httpPut<Dto.Calibration>(calibrationPath(slug, id), c));

export const deleteCalibration = (slug: string, id: number): Promise<void> => httpDelete(calibrationPath(slug, id));
