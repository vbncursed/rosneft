import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { CreateUserDialog } from "./ui/create-user-dialog";

const ROLES = [
  { slug: "field-operator", title: "field-operator" },
  { slug: "auditor", title: "auditor" },
  { slug: "guest", title: "guest" },
];

function Live() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        + New user
      </Button>
      {open && (
        <CreateUserDialog
          open={open}
          roles={ROLES}
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
