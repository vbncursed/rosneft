import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { AddRoleDialog } from "./ui/add-role-dialog";
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

function AddRoleWithOptions() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ add role</Button>
      {open && (
        <AddRoleDialog
          open={open}
          options={[
            { slug: "field-operator", title: "field-operator" },
            { slug: "auditor", title: "auditor" },
          ]}
          onClose={() => setOpen(false)}
          onAdd={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddRoleExhausted() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ add role (none left)</Button>
      {open && (
        <AddRoleDialog open={open} options={[]} onClose={() => setOpen(false)} onAdd={() => {}} />
      )}
    </>
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
    <div className="flex gap-3">
      <AddRoleWithOptions />
      <AddRoleExhausted />
    </div>
  </div>
);
