import { useMemo, useState } from "react";
import type { Permission } from "@/entities/permission";
import type { Role } from "@/entities/role";
import { ConsoleLayout } from "@/widgets/console-layout";
import type { RoleGroup } from "@/widgets/role-groups";
import { RolesPage } from "./ui/roles-page";

const noop = () => {};

const ALL: Permission[] = [
  { slug: "territory:read", description: "See territories" },
  { slug: "territory:write" },
  { slug: "territory:delete" },
  { slug: "territory:assign" },
  { slug: "model:read" },
  { slug: "model:write" },
  { slug: "model:delete" },
  { slug: "placement:read" },
  { slug: "placement:write" },
  { slug: "users:read" },
  { slug: "users:write" },
  { slug: "users:freeze" },
  { slug: "users:delete" },
  { slug: "audit:read" },
  { slug: "audit:export" },
];

const role = (
  slug: string,
  title: string,
  kind: Role["kind"],
  grants: number,
  users: number,
  updated: string,
): Role => ({ slug, title, kind, grants, users, updated });

const GROUPS: RoleGroup[] = [
  {
    key: "system",
    label: "System roles",
    note: "read-only · defined by migrations",
    roles: [
      {
        role: role("root", "Root", "system", 15, 1, "immutable"),
        tone: "accent",
        tag: "owner",
        tagTone: "accent",
        chips: [
          { label: "all permissions", tone: "strong" },
          { label: "cannot edit", tone: "locked" },
        ],
        faces: ["a.ivanova"],
      },
      {
        role: role("company-owner", "Company Owner", "system", 12, 3, "immutable"),
        tone: "warn",
        tag: "system",
        chips: [
          { label: "territory.*" },
          { label: "users.*" },
          { label: "audit.read", tone: "locked" },
        ],
        faces: ["a.ivanova", "s.volkov", "m.orlova"],
      },
      {
        role: role("guest", "Guest", "system", 2, 9, "immutable"),
        tone: "neutral",
        tag: "system",
        chips: [{ label: "territory.read" }, { label: "model.read" }],
        faces: ["guest.viewer", "k.petrov"],
      },
    ],
  },
  {
    key: "custom",
    label: "Custom roles",
    note: "2 roles · editable",
    roles: [
      {
        role: role("field-operator", "Field Operator", "custom", 6, 11, "upd. 29.08"),
        tone: "accent",
        tag: "editing",
        tagTone: "accent",
        chips: [
          { label: "territory.write" },
          { label: "placement.write" },
          { label: "users.write", tone: "locked" },
        ],
        faces: ["d.smirnov", "k.petrov", "i.lebedev"],
      },
      {
        role: role("people-roles", "People & Roles Manager", "custom", 8, 3, "upd. 21.08"),
        tone: "ok",
        chips: [{ label: "users.write" }, { label: "users.freeze" }, { label: "audit.read" }],
        faces: ["m.orlova", "n.baranov"],
      },
    ],
  },
];

const DISTRIBUTION = {
  label: "People by role",
  detail: "26 accounts",
  segments: [
    { tone: "accent" as const, value: 11, label: "field-operator" },
    { tone: "neutral" as const, value: 9, label: "guest" },
    { tone: "ok" as const, value: 3, label: "people-roles" },
    { tone: "warn" as const, value: 3, label: "owner" },
  ],
};

const STATS = [
  { label: "Roles", value: "5", hint: "2 system · 3 custom" },
  { label: "Permissions", value: String(ALL.length), hint: "5 resource groups" },
  { label: "Root holders", value: "1", hint: "unrestricted access", tone: "accent" as const },
];

const NAV = [
  { key: "users", label: "Users", href: "#" },
  { key: "roles", label: "Roles & Permissions", href: "#" },
  { key: "content", label: "Content", href: "#" },
  { key: "access", label: "Territory access", href: "#" },
  { key: "audit", label: "Audit journal", href: "#" },
  { key: "metrics", label: "Metrics", href: "#" },
];

const GRANTABLE = new Set(
  ALL.map((p) => p.slug).filter((slug) => !slug.startsWith("users:") && slug !== "territory:assign"),
);

const INITIAL: Record<string, string[]> = {
  root: ALL.map((p) => p.slug),
  "company-owner": ALL.slice(0, 12).map((p) => p.slug),
  guest: ["territory:read", "model:read"],
  "field-operator": [
    "territory:read",
    "territory:write",
    "model:read",
    "model:write",
    "placement:read",
    "placement:write",
  ],
  "people-roles": ALL.slice(0, 8).map((p) => p.slug),
};

const everyRole = GROUPS.flatMap((group) => group.roles);

function Live({ initialSelected }: { initialSelected: string | null }) {
  const [query, setQuery] = useState("kind:custom");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSelected);
  const [granted, setGranted] = useState<string[]>(INITIAL[initialSelected ?? "guest"] ?? []);
  const [dirty, setDirty] = useState(false);

  const entry = useMemo(
    () => everyRole.find((r) => r.role.slug === selectedSlug) ?? null,
    [selectedSlug],
  );

  const select = (slug: string) => {
    setSelectedSlug(slug);
    setGranted(INITIAL[slug] ?? []);
    setDirty(false);
  };

  return (
    <ConsoleLayout
      items={NAV}
      active="roles"
      backHref="#"
      viewer={{ username: "a.ivanova", roleTitle: "Company Owner" }}
    >
      <RolesPage
        groups={GROUPS}
        allPermissions={ALL}
        distribution={DISTRIBUTION}
        stats={STATS}
        query={query}
        onQueryChange={setQuery}
        selectedSlug={selectedSlug}
        onSelect={select}
        onCloseInspector={() => setSelectedSlug(null)}
        edited={entry && { role: entry.role, granted, dirty }}
        grantable={GRANTABLE}
        onTogglePermission={(slug) => {
          setGranted((g) => (g.includes(slug) ? g.filter((s) => s !== slug) : [...g, slug]));
          setDirty(true);
        }}
        onRenameRole={() => setDirty(true)}
        onResetRole={() => {
          setGranted(INITIAL[selectedSlug ?? ""] ?? []);
          setDirty(false);
        }}
        onSaveRole={() => setDirty(false)}
        onCreateRole={noop}
      />
    </ConsoleLayout>
  );
}

export default {
  editingCustom: <Live initialSelected="field-operator" />,
  viewingSystem: <Live initialSelected="guest" />,
  listOnly: <Live initialSelected={null} />,
};
