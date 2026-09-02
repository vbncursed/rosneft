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
    <div className="p-6 max-w-sm">
      <RecordInspector
        entry={entry}
        recordId="4f21c8"
        details={[
          { label: "actor", value: "a.ivanova · Company Owner" },
          { label: "at", value: "2026-09-01 09:14:22 UTC" },
          { label: "ip", value: "10.42.0.18" },
          { label: "result", value: "ok", tone: "ok" },
          { label: "digest", value: "sha256:9c1f…a204", tone: "muted" },
        ]}
        onCopyJson={() => {}}
        onOpenEntity={() => {}}
      />
    </div>
  ),
  failedAndGone: (
    <div className="p-6 max-w-sm">
      <RecordInspector
        entry={{ ...entry, action: "model.delete", result: "failed", newRow: null }}
        onCopyJson={() => {}}
      />
    </div>
  ),
};
