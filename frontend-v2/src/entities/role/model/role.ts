/** A named permission set. System roles come from migrations and are read-only. */
export type Role = {
  slug: string;
  title: string;
  kind: "system" | "custom";
  /** How many permissions of `total` this role grants. */
  grants: number;
  /** People holding it. */
  users: number;
  /** Free-form, e.g. "upd. 29.08" or "immutable". */
  updated: string;
};

/** The rail and meter colour, which encodes how much reach the role has. */
export type RoleTone = "accent" | "warn" | "ok" | "neutral";

export const isEditable = (role: Role) => role.kind === "custom";

/** 0–100. A total of zero means "no permissions defined", not "none granted". */
export function grantShare(role: Role, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(role.grants, total) / total) * 100);
}

/** "6/15" — what the meter's caption reads. */
export const grantLabel = (role: Role, total: number) => `${role.grants}/${total}`;

/** "1 user" / "11 users". */
export const usersLabel = (role: Role) => `${role.users} ${role.users === 1 ? "user" : "users"}`;
