import { useState } from "react";
import { AuditRow } from "./ui/audit-row";
import type { AuditEntry } from "./model/audit-entry";

const ENTRIES: AuditEntry[] = [
  {
    id: 2,
    at: "2026-08-31T14:02:00Z",
    actorId: "u-1",
    actorLogin: "a.ivanova",
    action: "territory.create",
    entity: "territory",
    entityId: "t-1",
    entityLabel: "Refinery Block C",
    oldRow: null,
    newRow: { slug: "refinery-block-c", title: "Refinery Block C" },
    result: "ok",
  },
  {
    id: 1,
    at: "2026-08-30T09:41:00Z",
    actorId: "u-2",
    actorLogin: "d.smirnov",
    action: "placement.update",
    entity: "placement",
    entityId: "p-9",
    entityLabel: "Pump Jack Unit",
    oldRow: { position_x: 8.2, visible_panorama_ids: [4, 7] },
    newRow: { position_x: 12.4, label: "Pump Jack A2" },
    result: "failed",
  },
];

function Journal() {
  const [openId, setOpenId] = useState<number | null>(1);
  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      {ENTRIES.map((entry) => (
        <AuditRow
          key={entry.id}
          entry={entry}
          expanded={openId === entry.id}
          onToggle={() => setOpenId((id) => (id === entry.id ? null : entry.id))}
        />
      ))}
    </div>
  );
}

export default <Journal />;
