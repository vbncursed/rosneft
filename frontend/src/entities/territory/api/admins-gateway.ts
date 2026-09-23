import { httpGet, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";

type AdminsMap = components["schemas"]["TerritoryAdminsMap"];

const route = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/admins`;

/**
 * Every visible territory's admin set in one call. Root only on the gateway;
 * the screen behind this is owner-gated to match. `?? []`: a Go nil slice
 * marshals as JSON null when nobody is assigned.
 */
export const listTerritoryAdmins = async (): Promise<Record<string, string[]>> =>
  Object.fromEntries(
    Object.entries(await httpGet<AdminsMap>("/api/territory-admins")).map(([slug, ids]) => [slug, ids ?? []]),
  );

/** Replaces the whole set — the gateway's PUT semantics. */
export const setTerritoryAdmins = async (slug: string, userIds: string[]): Promise<void> => {
  await httpPut<unknown>(route(slug), { userIds });
};
