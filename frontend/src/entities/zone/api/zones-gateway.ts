import { httpDelete, httpPatch, httpPost } from "@/shared/api";
import type * as Dto from "@/shared/api/dto";
import type { ZoneBody } from "@/entities/site-plan";
import type { Zone } from "../model/zone";
import { toZone } from "./to-zone";

const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/zones`;

export type ZoneCreate = ZoneBody & { title: string; tagSlugs: string[] };

// The wire omits an unknown drawing size; it has no null there.
export const createZone = async (slug: string, { drawingWidthM, drawingHeightM, ...rest }: ZoneCreate): Promise<Zone> =>
  toZone(
    await httpPost<Dto.Zone>(base(slug), {
      ...rest,
      ...(drawingWidthM === null ? {} : { drawingWidthM }),
      ...(drawingHeightM === null ? {} : { drawingHeightM }),
    }),
  );

export const patchZone = async (
  slug: string,
  id: number,
  patch: { title?: string; tagSlugs?: string[] },
): Promise<Zone> => toZone(await httpPatch<Dto.Zone>(`${base(slug)}/${id}`, patch));

export const deleteZone = (slug: string, id: number): Promise<void> => httpDelete(`${base(slug)}/${id}`);
