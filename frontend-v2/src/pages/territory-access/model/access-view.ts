import type { AccessGrant, Territory, TerritoryAccess } from "@/entities/territory";
import { roleTitle, type User } from "@/entities/user";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { PersonOption } from "@/features/grant-access";
import { shortDate } from "@/shared/lib/short-date";
import type { AccessGroup } from "@/widgets/access-groups";
import type { AccessPageStat, TerritoryAccessPageProps } from "../ui/territory-access-page";

const MAX_FACES = 4;

const byId = (users: User[]) => new Map(users.map((u) => [u.id, u]));
const nameOf = (users: Map<string, User>, id: string) => users.get(id)?.username ?? id;

const people = (n: number) => (n === 0 ? "owner only" : n === 1 ? "1 person" : `${n} people`);

/** A row of the access list. Visibility is read off the admins: anyone assigned, or nobody. */
export function toTerritoryAccess(
  territory: Territory,
  userIds: string[],
  users: User[],
): TerritoryAccess {
  const known = byId(users);
  const date = shortDate(territory.updatedAt);
  return {
    slug: territory.slug,
    title: territory.title,
    visibility: userIds.length > 0 ? "assigned" : "private",
    meta: date ? `${territory.slug} · upd. ${date}` : territory.slug,
    faces: userIds.slice(0, MAX_FACES).map((id) => nameOf(known, id)),
    peopleLabel: people(userIds.length),
  };
}

/** Every grant is a row in territory_assignments — direct, revocable here. */
export function grantsOf(userIds: string[], users: User[]): AccessGrant[] {
  const known = byId(users);
  return userIds.map((userId) => {
    const user = known.get(userId);
    const first = user?.roleSlugs[0];
    const grant: AccessGrant = {
      userId,
      username: user?.username ?? userId,
      roleTitle: user && first ? roleTitle(user, first) : "—",
      via: "direct",
    };
    return !user || user.status !== "active" ? { ...grant, inactive: true } : grant;
  });
}

/** visibility: and person: chips plus free text on title or slug. Unknown keys are ignored. */
export function matchesAccess(
  item: TerritoryAccess,
  grants: AccessGrant[],
  query: string,
): boolean {
  for (const { key, value } of parseFilters(query)) {
    if (key === "visibility" && item.visibility !== value) return false;
    if (
      key === "person" &&
      !grants.some((g) => g.username.toLowerCase().includes(value.toLowerCase()))
    ) {
      return false;
    }
  }
  const text = freeText(query).trim().toLowerCase();
  return text === "" || item.title.toLowerCase().includes(text) || item.slug.toLowerCase().includes(text);
}

const count = (n: number) => `${n} ${n === 1 ? "territory" : "territories"}`;

export function groupAccess(items: TerritoryAccess[]): AccessGroup[] {
  const shared = items.filter((t) => t.visibility === "assigned");
  const alone = items.filter((t) => t.visibility !== "assigned");
  return [
    { key: "shared", label: "Shared", note: count(shared.length), territories: shared },
    { key: "not-shared", label: "Not shared", note: count(alone.length), territories: alone },
  ];
}

export function mixOf(items: TerritoryAccess[]): TerritoryAccessPageProps["mix"] {
  const shared = items.filter((t) => t.visibility === "assigned").length;
  return {
    label: "Access mix",
    detail: count(items.length),
    segments: [
      { tone: "accent", value: shared, label: "shared" },
      { tone: "neutral", value: items.length - shared, label: "not shared" },
    ],
  };
}

export function statsOf(
  items: TerritoryAccess[],
  adminsBySlug: Record<string, string[]>,
): AccessPageStat[] {
  const shared = items.filter((t) => t.visibility === "assigned").length;
  const distinct = new Set(Object.values(adminsBySlug).flat()).size;
  return [
    { label: "Territories", value: String(items.length), hint: `${shared} shared` },
    { label: "Not shared", value: String(items.length - shared), hint: "only Root can open", tone: "warn" },
    { label: "People with access", value: String(distinct), hint: "distinct accounts" },
  ];
}

export const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * Whoever could still be added: active accounts not already in the draft.
 * An owner is left out — it already opens every territory, so granting one
 * changes no access while flipping the row to "Shared" and inflating the
 * "People with access" count.
 */
export function candidatesOf(users: User[], draftIds: string[]): PersonOption[] {
  const taken = new Set(draftIds);
  return users
    .filter((u) => u.status === "active" && !u.isOwner && !taken.has(u.id))
    .map((u) => {
      const first = u.roleSlugs[0];
      return { id: u.id, username: u.username, ...(first ? { hint: roleTitle(u, first) } : {}) };
    });
}
