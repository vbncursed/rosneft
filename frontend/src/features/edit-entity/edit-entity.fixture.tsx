import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { EditDetailsDialog } from "./ui/edit-details-dialog";

function Live() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="pencil" size={14} className="mr-2" />
        Edit details
      </Button>
      {open ? (
        <EditDetailsDialog
          kind="territory"
          slug="north-ridge-pad"
          title="North Ridge Pad"
          description="Wellpad with two separators and a flare stack."
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export default (
  <div className="flex gap-3 rounded-card border border-line bg-panel p-6">
    <Live />
  </div>
);
