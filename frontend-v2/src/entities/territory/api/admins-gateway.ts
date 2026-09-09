import { httpGet, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";

type TerritoryAdmins = components["schemas"]["TerritoryAdmins"];

const route = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/admins`;

// Root only on the gateway; the screen behind this is owner-gated to match.
// `?? []`: a Go nil slice marshals as JSON null when nobody is assigned.
export const getTerritoryAdmins = async (slug: string): Promise<string[]> =>
  (await httpGet<TerritoryAdmins>(route(slug))).userIds ?? [];

/** Replaces the whole set — the gateway's PUT semantics. */
export const setTerritoryAdmins = async (slug: string, userIds: string[]): Promise<void> => {
  await httpPut<unknown>(route(slug), { userIds });
};
