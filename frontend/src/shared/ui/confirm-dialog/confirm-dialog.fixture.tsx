import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "./confirm-dialog";

function DeleteUser() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        tone="danger"
        title="Delete d.smirnov?"
        description="This removes the account. Their history stays in the audit log."
        confirmLabel="Delete"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export default (
  <div className="flex gap-3 rounded-card border border-line bg-panel p-6">
    <DeleteUser />
  </div>
);
