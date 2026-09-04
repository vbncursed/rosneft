import { useState } from "react";
import { AuditRow } from "./ui/audit-row";
import { EventCard } from "./ui/event-card";
import type { AuditEntry } from "./model/audit-entry";

const ENTRIES: AuditEntry[] = [
  {
    id: 2,
    at: "2026-08-31T14:02:00Z",
    actorId: "u-1",
    actorLogin: "a.ivanova",
    companyId: "",
    companyLogin: "",
    action: "territory.insert",
    entity: "territory",
    entityId: "t-1",
    entityLabel: "Refinery Block C",
    territorySlug: "",
    oldRow: null,
    newRow: { slug: "refinery-block-c", title: "Refinery Block C" },
    result: "ok",
  },
  {
    id: 1,
    at: "2026-08-30T09:41:00Z",
    actorId: "u-2",
    actorLogin: "d.smirnov",
    companyId: "",
    companyLogin: "",
    action: "placement.update",
    entity: "placement",
    entityId: "p-9",
    entityLabel: "Pump Jack Unit",
    territorySlug: "",
    oldRow: { position_x: 8.2, visible_panorama_ids: [4, 7] },
    newRow: { position_x: 12.4, label: "Pump Jack A2" },
    result: "failed",
  },
];

function Journal() {
  const [openId, setOpenId] = useState<number | null>(1);
  return (
    <div className="p-6 overflow-hidden rounded-card border border-line bg-panel">
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

const KINDS: { entry: AuditEntry; summary: string }[] = [
  {
    entry: { ...ENTRIES[0], id: 10, action: "territory.update", at: "2026-09-01T09:14:00Z" },
    summary: "4 fields changed",
  },
  {
    entry: { ...ENTRIES[0], id: 11, action: "placement.insert", entityLabel: "Storage Tank 500", at: "2026-09-01T08:52:00Z" },
    summary: "placed at 12.4 / 0.0 / −3.1",
  },
  {
    entry: { ...ENTRIES[0], id: 12, action: "model.delete", entityLabel: "Pipe Segment 12", at: "2026-09-01T07:58:00Z" },
    summary: "soft-deleted · 3 placements detached",
  },
  {
    entry: { ...ENTRIES[0], id: 13, action: "auth.login", entityLabel: "session started", actorId: "", actorLogin: "", result: "failed", at: "2026-09-01T07:40:00Z" },
    summary: "passkey · Chrome on macOS",
  },
];

export default {
  journalRows: <Journal />,
  eventCards: (
    <div className="flex max-w-2xl flex-col gap-3 rounded-card border border-line bg-panel p-6">
      {KINDS.map(({ entry, summary }, i) => (
        <EventCard key={entry.id} entry={entry} summary={summary} selected={i === 0} />
      ))}
    </div>
  ),
};
