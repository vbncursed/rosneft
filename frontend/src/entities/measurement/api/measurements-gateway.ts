import { httpDelete, httpGet, httpPost, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { StoredChain } from "../model/measurement-reducer";
import { toStoredChain } from "./to-measurement";

type MeasurementDto = components["schemas"]["Measurement"];
export type MeasurementWrite = components["schemas"]["MeasurementWrite"];

const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/measurements`;

export async function listMeasurements(territorySlug: string): Promise<StoredChain[]> {
  return (await httpGet<MeasurementDto[]>(base(territorySlug))).map(toStoredChain);
}

export async function createMeasurement(territorySlug: string, body: MeasurementWrite): Promise<StoredChain> {
  return toStoredChain(await httpPost<MeasurementDto>(base(territorySlug), body));
}

/** The PUT replaces the points and the closed flag together. */
export async function updateMeasurement(
  territorySlug: string,
  id: number,
  body: MeasurementWrite,
): Promise<StoredChain> {
  return toStoredChain(await httpPut<MeasurementDto>(`${base(territorySlug)}/${id}`, body));
}

export function deleteMeasurement(territorySlug: string, id: number): Promise<void> {
  return httpDelete(`${base(territorySlug)}/${id}`);
}

/** Every chain on the territory, for every reader — the gateway's count is not read. */
export function deleteMeasurements(territorySlug: string): Promise<void> {
  return httpDelete(base(territorySlug));
}
