import { Button } from "@/shared/ui/button";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { Card } from "./card";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

export default (
  <div className="flex flex-col gap-4">
    <Card title="Users" actions={<Button variant="primary" size="sm">+ New user</Button>}>
      <p className="m-0 text-[13px] text-muted">Table rows go here.</p>
    </Card>
    <Card overline="Progress · upload">
      <ProgressBar className="mt-3" value={64} label="Uploading chunks" detail="64%" />
    </Card>
    <div className="grid grid-cols-3 gap-4">
      <EmptyState
        title="Catalog is empty"
        description="Upload your first territory."
        action={<Button variant="primary" size="sm">+ Upload</Button>}
      />
      <ErrorState
        title="Could not load the journal"
        detail="HTTP 503 · audit-service unavailable"
      />
      <Card>
        <p className="m-0 text-[13px] font-semibold">Loading interface…</p>
        <ProgressBar className="mt-2.5" value={45} />
        <p className="m-0 mt-2 font-mono text-[10px] text-dim">viewer skeleton</p>
      </Card>
    </div>
  </div>
);
