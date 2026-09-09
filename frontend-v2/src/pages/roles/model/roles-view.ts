import { actionOf, groupPermissions, type Permission } from "@/entities/permission";
import type { Role, RoleCardChip } from "@/entities/role";
import type { User } from "@/entities/user";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { CoverageSegment } from "@/shared/ui/coverage-meter";
import type { RoleEntry, RoleGroup } from "@/widgets/role-groups";
import type { RolesPageStat } from "../ui/roles-page";

/** The mock writes users.write; the gateway says users:write. Both work. */
const toSlug = (value: string) => value.replace(".", ":");

export function matchesRole(role: Role, query: string): boolean {
  for (const { key, value } of parseFilters(query)) {
    if (key === "kind" && role.kind !== value) return false;
    if (key === "grants" && !role.permissionSlugs.includes(toSlug(value))) return false;
  }
  const text = freeText(query).trim().toLowerCase();
  return text === "" || role.slug.includes(text) || role.title.toLowerCase().includes(text);
}

const live = (users: User[]) => users.filter((u) => u.status !== "deleted");

/** Fills `users` from the people list; null people leave every count unknown. */
export function withUserCounts(roles: Role[], users: User[] | null): Role[] {
  if (!users) return roles;
  const people = live(users);
  return roles.map((role) => ({
    ...role,
    users: people.filter((u) => u.roleSlugs.includes(role.slug)).length,
  }));
}

/**
 * The grants this role holds that the actor may not hand out.
 *
 * `PUT …/permissions` replaces the whole set and the gateway checks all of it,
 * so such a role cannot be saved from here however it is edited — the matrix
 * stops a locked chip being added, and cannot un-hold one that is already
 * there. The same set makes it unusable as a "Start from" template.
 */
export const unsaveable = (role: Role, grantable: Set<string>): string[] =>
  role.permissionSlugs.filter((slug) => !grantable.has(slug));

/** The roles whose whole set this actor could actually save as a new role. */
export const startableFrom = (roles: Role[], grantable: Set<string>): Role[] =>
  roles.filter((role) => unsaveable(role, grantable).length === 0);

const MAX_CHIPS = 3;
const MAX_FACES = 4;

/** `group.*` for a whole group held, else one chip per grant; locked when not grantable. */
export function roleChips(
  role: Role,
  all: Permission[],
  grantable?: Set<string>,
): RoleCardChip[] {
  const held = new Set(role.permissionSlugs);
  const chips: RoleCardChip[] = [];
  for (const group of groupPermissions(all)) {
    const mine = group.permissions.filter((p) => held.has(p.slug));
    if (mine.length === 0) continue;
    if (mine.length === group.permissions.length) {
      chips.push({ label: `${group.name}.*`, tone: "strong" });
      continue;
    }
    for (const p of mine) {
      chips.push({
        label: `${group.name}.${actionOf(p.slug)}`,
        ...(grantable && !grantable.has(p.slug) ? { tone: "locked" as const } : {}),
      });
    }
  }
  return chips.slice(0, MAX_CHIPS);
}

type Selection = { slug: string | null; dirty: boolean };

export function groupRoles(
  roles: Role[],
  users: User[] | null,
  all: Permission[],
  grantable: Set<string> | undefined,
  selection: Selection,
): RoleGroup[] {
  const entry = (role: Role): RoleEntry => {
    const selected = role.slug === selection.slug;
    const editing = selected && role.kind === "custom" && selection.dirty;
    return {
      role,
      tone: selected ? "accent" : role.kind === "system" ? "warn" : "ok",
      ...(role.kind === "system"
        ? { tag: "system", tagTone: "dim" as const }
        : editing
          ? { tag: "editing", tagTone: "accent" as const }
          : {}),
      chips: roleChips(role, all, grantable),
      faces: users
        ? live(users)
            .filter((u) => u.roleSlugs.includes(role.slug))
            .map((u) => u.username)
            .slice(0, MAX_FACES)
        : [],
    };
  };
  const system = roles.filter((r) => r.kind === "system");
  const custom = roles.filter((r) => r.kind === "custom");
  return [
    {
      key: "system",
      label: "System roles",
      note: "read-only · defined by migrations",
      roles: system.map(entry),
    },
    {
      key: "custom",
      label: "Custom roles",
      note: `${custom.length} ${custom.length === 1 ? "role" : "roles"} · editable`,
      roles: custom.map(entry),
    },
  ];
}

const TONES: CoverageSegment["tone"][] = ["accent", "ok", "neutral", "warn", "bad"];

/** Every grant counts: a person with two roles sits in two segments. */
export function distributionOf(
  roles: Role[],
  users: User[] | null,
): { label: string; detail: string; segments: CoverageSegment[] } {
  if (!users) return { label: "People by role", detail: "unavailable", segments: [] };
  const people = live(users);
  const segments = roles
    .map((role, i) => ({
      tone: TONES[i % TONES.length],
      value: people.filter((u) => u.roleSlugs.includes(role.slug)).length,
      label: role.slug,
    }))
    .filter((s) => s.value > 0);
  return { label: "People by role", detail: `${people.length} accounts`, segments };
}

export function statsOf(
  roles: Role[],
  permissions: Permission[],
  users: User[] | null,
): RolesPageStat[] {
  const system = roles.filter((r) => r.kind === "system").length;
  const groups = groupPermissions(permissions).length;
  const owners = users ? String(live(users).filter((u) => u.isOwner).length) : "—";
  return [
    {
      label: "Roles",
      value: String(roles.length),
      hint: `${system} system · ${roles.length - system} custom`,
    },
    {
      label: "Permissions",
      value: String(permissions.length),
      hint: `${groups} resource ${groups === 1 ? "group" : "groups"}`,
    },
    { label: "Root holders", value: owners, hint: "unrestricted access", tone: "accent" },
  ];
}
