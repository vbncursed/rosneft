import { httpDelete, httpGet, httpPatch, httpPost } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { User } from "../model/user";
import { toUser } from "./to-user";

type AuthUserDto = components["schemas"]["AuthUser"];

const at = (id: string) => `/api/auth/users/${encodeURIComponent(id)}`;

export type NewUser = { email: string; username: string; password: string; roleSlugs: string[] };

// Deleted accounts included: the screen shows them dimmed and lets status:
// narrow, rather than hiding a restore target behind a switch.
export const listUsers = async (): Promise<User[]> =>
  (await httpGet<AuthUserDto[]>("/api/auth/users?includeDeleted=true")).map(toUser);

export const createUser = async (input: NewUser): Promise<User> =>
  toUser(await httpPost<AuthUserDto>("/api/auth/users", input));

/** Replaces the whole set — the gateway's PATCH semantics for roleSlugs. */
export const setUserRoles = async (id: string, roleSlugs: string[]): Promise<User> =>
  toUser(await httpPatch<AuthUserDto>(at(id), { roleSlugs }));

export const freezeUser = async (id: string): Promise<User> =>
  toUser(await httpPost<AuthUserDto>(`${at(id)}/freeze`));

export const unfreezeUser = async (id: string): Promise<User> =>
  toUser(await httpPost<AuthUserDto>(`${at(id)}/unfreeze`));

export const deleteUser = (id: string): Promise<void> => httpDelete(at(id));

export const restoreUser = async (id: string): Promise<User> =>
  toUser(await httpPost<AuthUserDto>(`${at(id)}/restore`));

// Idempotent on the gateway; requiring twice is a 200. Unrequire does not
// disable an enrolled factor.
export const setTwoFactorRequired = async (id: string, required: boolean): Promise<User> =>
  toUser(await httpPost<AuthUserDto>(`${at(id)}/2fa/${required ? "require" : "unrequire"}`));
