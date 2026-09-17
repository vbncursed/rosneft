import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { CreateRoleDialog } from "./ui/create-role-dialog";

const START_FROM = [
  { slug: "field-operator", title: "field-operator", permissionSlugs: ["territory:read", "territory:write"] },
  { slug: "guest", title: "guest", permissionSlugs: ["territory:read"] },
];

function Live() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        + New role
      </Button>
      {open && (
        <CreateRoleDialog
          open={open}
          startFrom={START_FROM}
          onClose={() => setOpen(false)}
          onCreate={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default (
  <div className="flex gap-3 rounded-card border border-line bg-panel p-6">
    <Live />
  </div>
);
