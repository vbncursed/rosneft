import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { EditDetailsDialog } from "./ui/edit-details-dialog";

function Live() {
  const [open, setOpen] = useState(false);
  // The dialog's save is a mutation, which needs a client the moment it opens.
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
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
    </QueryClientProvider>
  );
}

export default (
  <div className="flex gap-3 rounded-card border border-line bg-panel p-6">
    <Live />
  </div>
);
