import { RecordInspector } from "./ui/record-inspector";
import type { AuditEntry } from "@/entities/audit";

const entry: AuditEntry = {
  id: 1,
  at: "2026-09-01T09:14:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  action: "territory.update",
  entity: "territory",
  entityId: "t-1",
  entityLabel: "Refinery Block C",
  oldRow: { title: "Refinery Block", legacy_slug: "block-c-old" },
  newRow: { title: "Refinery Block C", external_panorama_url: "https://tour.example.com/rbc" },
  result: "ok",
};

export default {
  changed: (
    <div className="max-w-sm">
      <RecordInspector
        entry={entry}
        digest="sha256:9c1f…a204"
        onCopyJson={() => {}}
        onOpenEntity={() => {}}
      />
    </div>
  ),
  failedAndGone: (
    <div className="max-w-sm">
      <RecordInspector
        entry={{ ...entry, action: "model.delete", result: "failed", newRow: null }}
        onCopyJson={() => {}}
      />
    </div>
  ),
};
