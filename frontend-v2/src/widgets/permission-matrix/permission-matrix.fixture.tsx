import { useState } from "react";
import { PermissionMatrix } from "./ui/permission-matrix";
import type { Permission } from "@/entities/permission";

const ALL: Permission[] = [
  { slug: "territory:read", description: "See territories" },
  { slug: "territory:write", description: "Create and edit territories" },
  { slug: "territory:delete", description: "Delete territories" },
  { slug: "territory:assign", description: "Assign territory admins" },
  { slug: "users:read" },
  { slug: "users:write" },
  { slug: "users:freeze" },
  { slug: "users:delete" },
  { slug: "audit:read" },
  { slug: "audit:export" },
];

function Live() {
  const [granted, setGranted] = useState(["territory:read", "territory:write", "users:read"]);
  return (
    <PermissionMatrix
      all={ALL}
      granted={granted}
      grantable={new Set(ALL.map((p) => p.slug).filter((s) => !s.endsWith(":assign") && !s.startsWith("users:freeze") && s !== "users:delete"))}
      onToggle={(slug) =>
        setGranted((g) => (g.includes(slug) ? g.filter((s) => s !== slug) : [...g, slug]))
      }
    />
  );
}

export default {
  editable: (
    <div className="rounded-card border border-line bg-panel p-6">
      <Live />
    </div>
  ),
  readOnly: (
    <div className="rounded-card border border-line bg-panel p-6">
      <PermissionMatrix all={ALL} granted={["audit:read"]} onToggle={() => {}} readOnly />
    </div>
  ),
};
