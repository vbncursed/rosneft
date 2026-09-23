import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { ResetPasswordDialog } from "./ui/reset-password-dialog";

function Live() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Reset password</Button>
      {open && (
        <ResetPasswordDialog
          open={open}
          username="a.ivanova"
          onClose={() => setOpen(false)}
          onSubmit={() => setOpen(false)}
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
