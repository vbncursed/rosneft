import { useState } from "react";
import { RoleCard } from "./ui/role-card";
import type { Role } from "./model/role";

const role = (
  slug: string,
  title: string,
  kind: Role["kind"],
  grants: number,
  users: number,
  updated: string,
): Role => ({ slug, title, kind, grants, users, updated });

function Live() {
  const [selected, setSelected] = useState("field-operator");
  return (
    <div className="grid gap-2.5 p-6 md:grid-cols-2">
      <RoleCard
        role={role("root", "Root", "system", 15, 1, "immutable")}
        totalPermissions={15}
        tone="accent"
        tag="owner"
        tagTone="accent"
        chips={[
          { label: "all permissions", tone: "strong" },
          { label: "cannot edit", tone: "locked" },
        ]}
        faces={["a.ivanova"]}
        selected={selected === "root"}
        onSelect={() => setSelected("root")}
      />
      <RoleCard
        role={role("company-owner", "Company Owner", "system", 12, 3, "immutable")}
        totalPermissions={15}
        tone="warn"
        tag="system"
        chips={[{ label: "territory.*" }, { label: "users.*" }, { label: "audit.read", tone: "locked" }]}
        faces={["a.ivanova", "s.volkov", "m.orlova"]}
        selected={selected === "company-owner"}
        onSelect={() => setSelected("company-owner")}
      />
      <RoleCard
        role={role("field-operator", "Field Operator", "custom", 6, 11, "upd. 29.08")}
        totalPermissions={15}
        tone="accent"
        tag="editing"
        tagTone="accent"
        chips={[{ label: "territory.write" }, { label: "placement.write" }]}
        faces={["d.smirnov", "k.petrov", "i.lebedev"]}
        selected={selected === "field-operator"}
        onSelect={() => setSelected("field-operator")}
      />
      <RoleCard
        role={role("guest", "Guest", "system", 2, 9, "immutable")}
        totalPermissions={15}
        tone="neutral"
        tag="system"
        chips={[{ label: "territory.read" }, { label: "model.read" }]}
        selected={selected === "guest"}
        onSelect={() => setSelected("guest")}
      />
    </div>
  );
}

export default <Live />;
