import { useMemo, useState } from "react";
import { AccessRow } from "@/entities/territory";
import type { User } from "@/entities/user";
import { RoleChips } from "@/features/role-assign";
import { Callout } from "@/shared/ui/callout";
import { UsersPage } from "./ui/users-page";
import type { PeopleGroup } from "@/widgets/people-groups";

const noop = () => {};

const make = (
  id: string,
  username: string,
  roles: string[],
  over: Partial<User> = {},
): User => ({
  id,
  username,
  email: `${username}@example.com`,
  status: "active",
  totpEnabled: true,
  passkeyEnabled: true,
  roleSlugs: roles,
  roleTitles: Object.fromEntries(roles.map((r) => [r, r])),
  isOwner: false,
  ...over,
});

const GROUPS: PeopleGroup[] = [
  {
    key: "admins",
    label: "Owners & admins",
    total: 3,
    people: [
      {
        user: make("u-1", "a.ivanova", ["root", "company-owner"], { isOwner: true }),
        territories: "all territories",
        lastSeen: "today 09:14",
      },
      {
        user: make("u-2", "m.orlova", ["people-roles"]),
        territories: "6 territories",
        lastSeen: "today 08:31",
      },
      {
        user: make("u-3", "s.volkov", ["company-owner"], { passkeyEnabled: false }),
        territories: "all territories",
        lastSeen: "31.08 19:20",
      },
    ],
  },
  {
    key: "ops",
    label: "Field operators",
    total: 11,
    people: [
      {
        user: make("u-4", "d.smirnov", ["field-operator"], {
          totpEnabled: false,
          passkeyEnabled: false,
        }),
        territories: "3 territories",
        lastSeen: "yesterday 18:02",
      },
      {
        user: make("u-5", "k.petrov", ["field-operator"], { passkeyEnabled: false }),
        territories: "5 territories",
        lastSeen: "30.08 16:20",
      },
      {
        user: make("u-6", "n.baranov", ["field-operator"], { status: "frozen" }),
        territories: "2 territories",
        lastSeen: "18.08 11:05",
      },
      {
        user: make("u-7", "i.lebedev", ["field-operator"]),
        territories: "4 territories",
        lastSeen: "today 07:58",
      },
    ],
  },
  {
    key: "guests",
    label: "Guests",
    total: 9,
    people: [
      {
        user: make("u-8", "guest.viewer", ["guest"], { status: "frozen", totpEnabled: null }),
        territories: "1 territory",
        lastSeen: "24.08 08:55",
      },
      {
        user: make("u-9", "old.account", ["guest"], { status: "deleted", totpEnabled: null, passkeyEnabled: false }),
        territories: "—",
        lastSeen: "12.05 10:03",
      },
    ],
  },
];

const NAV = [
  { key: "users", label: "Users", href: "#" },
  { key: "roles", label: "Roles & Permissions", href: "#" },
  { key: "content", label: "Content", href: "#" },
  { key: "access", label: "Territory access", href: "#" },
  { key: "audit", label: "Audit journal", href: "#" },
  { key: "metrics", label: "Metrics", href: "#" },
];

const COVERAGE = {
  label: "2FA coverage",
  detail: "18 / 26",
  segments: [
    { tone: "ok" as const, value: 18, label: "2FA + passkey" },
    { tone: "warn" as const, value: 3, label: "2FA only" },
    { tone: "bad" as const, value: 5, label: "password only" },
  ],
};

const STATS = [
  { label: "Accounts", value: "26", hint: "24 active · 2 frozen" },
  { label: "Roles in use", value: "4", hint: "2 system · 2 custom" },
  { label: "Needs attention", value: "5", hint: "no second factor", tone: "bad" as const },
];

const everyone = GROUPS.flatMap((group) => group.people);

function Live({ initialSelected }: { initialSelected: string | null }) {
  const [query, setQuery] = useState("2fa:off");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const [roles, setRoles] = useState([{ slug: "field-operator", title: "field-operator" }]);

  const person = useMemo(
    () => everyone.find((p) => p.user.id === selectedId) ?? null,
    [selectedId],
  );

  const weak = person?.user.totpEnabled === false && person?.user.passkeyEnabled === false;

  return (
    <UsersPage
      nav={NAV}
      backHref="#"
      viewer={{ username: "a.ivanova", roleTitle: "Company Owner" }}
      groups={GROUPS}
      coverage={COVERAGE}
      stats={STATS}
      query={query}
      onQueryChange={setQuery}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onCloseInspector={() => setSelectedId(null)}
      inspected={
        person && {
          user: person.user,
          details: [
            { label: "created", value: "2026-04-11" },
            { label: "last seen", value: person.lastSeen },
            { label: "sessions", value: "2 devices" },
          ],
          body: (
            <>
              {weak ? <Callout tone="bad">No 2FA and no passkey — password only.</Callout> : null}
              <div>
                <p className="m-0 mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
                  Roles
                </p>
                <RoleChips
                  roles={roles}
                  onRemove={(slug) => setRoles((r) => r.filter((role) => role.slug !== slug))}
                  onAdd={() => setRoles((r) => [...r, { slug: "guest", title: "guest" }])}
                />
              </div>
              <div>
                <p className="m-0 mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
                  Territories · 3
                </p>
                <div className="flex flex-col gap-1.5">
                  <AccessRow slug="refinery-block-c" via="direct" />
                  <AccessRow slug="north-ridge-pad" via="role" />
                  <AccessRow slug="terminal-yard-4" via="direct" />
                </div>
              </div>
            </>
          ),
        }
      }
      onCreateUser={noop}
      onResetPassword={noop}
      onRequire2fa={noop}
      onFreeze={noop}
      onDelete={noop}
    />
  );
}

export default {
  withInspector: <Live initialSelected="u-4" />,
  listOnly: <Live initialSelected={null} />,
};
