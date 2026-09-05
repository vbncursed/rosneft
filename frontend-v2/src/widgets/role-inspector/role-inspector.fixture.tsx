import { useState } from "react";
import type { Permission } from "@/entities/permission";
import type { Role } from "@/entities/role";
import { RoleInspector } from "./ui/role-inspector";

const ALL: Permission[] = [
  { slug: "territory:read" },
  { slug: "territory:write" },
  { slug: "territory:delete" },
  { slug: "territory:assign" },
  { slug: "model:read" },
  { slug: "model:write" },
  { slug: "placement:read" },
  { slug: "placement:write" },
  { slug: "users:read" },
  { slug: "users:write" },
  { slug: "audit:read" },
  { slug: "audit:export" },
];

const GRANTABLE = new Set(ALL.map((p) => p.slug).filter((s) => !s.startsWith("users:")));

const custom: Role = {
  slug: "field-operator",
  title: "Field Operator",
  kind: "custom",
  permissionSlugs: [],
  grants: 6,
  users: 11,
  updated: "upd. 29.08",
};

const system: Role = {
  slug: "guest",
  title: "Guest",
  kind: "system",
  permissionSlugs: [],
  grants: 2,
  users: 9,
  updated: "immutable",
};

const noop = () => {};

function Live() {
  const [granted, setGranted] = useState([
    "territory:read",
    "territory:write",
    "model:read",
    "model:write",
    "placement:read",
    "placement:write",
  ]);
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState(custom.title);

  return (
    <RoleInspector
      role={{ ...custom, title, users: 0 }}
      all={ALL}
      granted={granted}
      grantable={GRANTABLE}
      dirty={dirty}
      onToggle={(slug) => {
        setGranted((g) => (g.includes(slug) ? g.filter((s) => s !== slug) : [...g, slug]));
        setDirty(true);
      }}
      onRename={(next) => {
        setTitle(next);
        setDirty(true);
      }}
      onReset={() => setDirty(false)}
      onSave={() => setDirty(false)}
      onClose={noop}
      onDelete={noop}
    />
  );
}

export default {
  editable: (
    <div className="max-w-sm p-6">
      <Live />
    </div>
  ),
  systemRole: (
    <div className="max-w-sm p-6">
      <RoleInspector
        role={system}
        all={ALL}
        granted={["territory:read", "model:read"]}
        onToggle={noop}
        onRename={noop}
        onReset={noop}
        onSave={noop}
        onClose={noop}
      />
    </div>
  ),
};
