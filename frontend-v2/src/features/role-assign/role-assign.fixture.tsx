import { useState } from "react";
import { RoleChips } from "./ui/role-chips";

function Live() {
  const [roles, setRoles] = useState([
    { slug: "field-operator", title: "field-operator" },
    { slug: "guest", title: "guest" },
  ]);
  return (
    <RoleChips
      roles={roles}
      onRemove={(slug) => setRoles((r) => r.filter((role) => role.slug !== slug))}
      onAdd={() => setRoles((r) => [...r, { slug: `role-${r.length}`, title: `role ${r.length}` }])}
    />
  );
}

export default (
  <div className="flex max-w-md flex-col gap-4 rounded-card border border-line bg-panel p-6">
    <Live />
    <RoleChips
      roles={[{ slug: "admin", title: "Company Owner" }]}
      onRemove={() => {}}
      onAdd={() => {}}
      readOnly
    />
  </div>
);
