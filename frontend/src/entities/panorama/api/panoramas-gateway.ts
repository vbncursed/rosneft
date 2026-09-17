import { httpDelete, httpGet, httpPost, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Panorama, PanoramaCreate, PanoramaUpdate } from "../model/panorama";
import { toPanorama } from "./to-panorama";

type PanoramaDto = components["schemas"]["Panorama"];
const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/panoramas`;

export const listPanoramas = async (slug: string): Promise<Panorama[]> =>
  (await httpGet<PanoramaDto[]>(base(slug))).map(toPanorama);

export const createPanorama = async (slug: string, body: PanoramaCreate): Promise<Panorama> =>
  toPanorama(await httpPost<PanoramaDto>(base(slug), body));

export const updatePanorama = async (slug: string, id: number, body: PanoramaUpdate): Promise<Panorama> =>
  toPanorama(await httpPut<PanoramaDto>(`${base(slug)}/${id}`, body));

export const deletePanorama = (slug: string, id: number): Promise<void> =>
  httpDelete(`${base(slug)}/${id}`);
