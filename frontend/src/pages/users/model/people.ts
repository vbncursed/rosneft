import type { Role } from "@/entities/role";
import { knownLabel, knownTone, type Known, type User } from "@/entities/user";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { CoverageSegment } from "@/shared/ui/coverage-meter";
import type { PeopleGroup, Person } from "@/widgets/people-groups";
import type { PersonDetail } from "@/widgets/person-inspector";
import type { UsersPageStat } from "../ui/users-page";

const known = (value: Known) => (value === null ? "unknown" : value ? "on" : "off");

/** role:, status:, 2fa:, passkey: chips plus free text on username or email. */
export function matchesPerson(user: User, query: string): boolean {
  for (const { key, value } of parseFilters(query)) {
    if (key === "role" && !user.roleSlugs.includes(value)) return false;
    if (key === "status" && user.status !== value) return false;
    if (key === "2fa" && known(user.totpEnabled) !== value) return false;
    if (key === "passkey" && known(user.passkeyEnabled) !== value) return false;
  }
  const text = freeText(query).trim().toLowerCase();
  return (
    text === "" ||
    user.username.toLowerCase().includes(text) ||
    user.email.toLowerCase().includes(text)
  );
}

const person = (user: User): Person => ({ user });

/**
 * Owners first, then one group per role in the order the gateway lists them,
 * then whoever holds none. A person appears once: under Owners if they are
 * one, else under the first of their roles that still exists.
 */
export function groupPeople(users: User[], roles: Role[]): PeopleGroup[] {
  const slugs = new Set(roles.map((r) => r.slug));
  const others = users.filter((u) => !u.isOwner);
  const firstRole = (u: User) => u.roleSlugs.find((s) => slugs.has(s));
  return [
    { key: "owners", label: "Owners", people: users.filter((u) => u.isOwner).map(person) },
    ...roles.map((role) => ({
      key: role.slug,
      label: role.title,
      people: others.filter((u) => firstRole(u) === role.slug).map(person),
    })),
    {
      key: "none",
      label: "No role",
      people: others.filter((u) => firstRole(u) === undefined).map(person),
    },
  ];
}

const live = (users: User[]) => users.filter((u) => u.status !== "deleted");
const hasFactor = (u: User) => u.totpEnabled === true || u.passkeyEnabled === true;

export function coverageOf(users: User[]): {
  label: string;
  detail: string;
  segments: CoverageSegment[];
} {
  const people = live(users);
  const both = people.filter((u) => u.totpEnabled === true && u.passkeyEnabled === true).length;
  const withFactor = people.filter(hasFactor).length;
  const none = people.filter((u) => u.totpEnabled === false && u.passkeyEnabled === false).length;
  // Anything left is unknown on at least one side and known on neither as on.
  const unknown = people.length - withFactor - none;
  return {
    label: "2FA coverage",
    detail: `${withFactor} / ${people.length}`,
    segments: [
      { tone: "ok", value: both, label: "2FA + passkey" },
      { tone: "warn", value: withFactor - both, label: "one factor" },
      { tone: "bad", value: none, label: "password only" },
      { tone: "neutral", value: unknown, label: "unknown" },
    ],
  };
}

export function statsOf(users: User[], roles: Role[]): UsersPageStat[] {
  const people = live(users);
  const frozen = people.filter((u) => u.status === "frozen").length;
  const inUse = new Set(people.flatMap((u) => u.roleSlugs));
  const system = roles.filter((r) => r.kind === "system" && inUse.has(r.slug)).length;
  const weak = people.filter((u) => u.totpEnabled === false && u.passkeyEnabled === false).length;
  return [
    {
      label: "Accounts",
      value: String(people.length),
      hint: `${people.length - frozen} active · ${frozen} frozen`,
    },
    {
      label: "Roles in use",
      value: String(inUse.size),
      hint: `${system} system · ${inUse.size - system} custom`,
    },
    {
      label: "Needs attention",
      value: String(weak),
      hint: "no second factor",
      tone: weak > 0 ? "bad" : "ok",
    },
  ];
}

/** The three facts AuthUser carries about a person's second factor. */
export function inspectorDetails(user: User): PersonDetail[] {
  return [
    { label: "2FA", value: knownLabel(user.totpEnabled), tone: knownTone(user.totpEnabled) },
    { label: "passkey", value: knownLabel(user.passkeyEnabled), tone: knownTone(user.passkeyEnabled) },
    // Policy, not health: no ok/bad tone, only emphasis.
    { label: "2FA required", value: user.totpRequired ? "yes" : "no", tone: user.totpRequired ? "fg" : "dim" },
  ];
}
