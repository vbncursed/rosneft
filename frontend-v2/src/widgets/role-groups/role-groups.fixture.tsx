import { useState } from "react";
import { RoleGroups, type RoleGroup } from "./ui/role-groups";
import type { Role } from "@/entities/role";

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
        chips: [{ label: "all permissions", tone: "strong" }],
        faces: ["a.ivanova"],
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
        chips: [{ label: "territory.write" }, { label: "users.write", tone: "locked" }],
        faces: ["d.smirnov", "k.petrov"],
      },
      {
        role: role("people-roles", "People & Roles Manager", "custom", 8, 3, "upd. 21.08"),
        tone: "ok",
        chips: [{ label: "users.write" }, { label: "audit.read" }],
        faces: ["m.orlova"],
      },
    ],
  },
];

function Live() {
  const [selected, setSelected] = useState<string | null>("field-operator");
  return (
    <RoleGroups
      groups={GROUPS}
      totalPermissions={15}
      selectedSlug={selected}
      onSelect={setSelected}
    />
  );
}

export default {
  grouped: (
    <div className="max-w-3xl p-6">
      <Live />
    </div>
  ),
  filteredToNothing: (
    <div className="max-w-3xl p-6">
      <RoleGroups groups={[{ key: "custom", label: "Custom roles", roles: [] }]} totalPermissions={15} />
    </div>
  ),
};
