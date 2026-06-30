import { httpGet, httpPut } from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";

type TerritoryAdmins = components["schemas"]["TerritoryAdmins"];

export async function getTerritoryAdmins(slug: string): Promise<string[]> {
  const data = await httpGet<TerritoryAdmins>(`/api/territories/${encodeURIComponent(slug)}/admins`);
  return data.userIds ?? [];
}

export async function setTerritoryAdmins(slug: string, userIds: string[]): Promise<void> {
  await httpPut(`/api/territories/${encodeURIComponent(slug)}/admins`, { userIds });
}
