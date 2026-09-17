import { useState } from "react";
import { EventTimeline } from "./ui/event-timeline";
import type { AuditEntry } from "@/entities/audit";

const at = (time: string) => `2026-09-01T${time}:00Z`;

const make = (
  id: number,
  action: string,
  entityLabel: string,
  time: string,
  actorLogin: string,
  result: "ok" | "failed" = "ok",
): AuditEntry => ({
  id,
  at: at(time),
  actorId: actorLogin === "system" ? "" : `u-${id}`,
  actorLogin: actorLogin === "system" ? "" : actorLogin,
  companyId: "",
  companyLogin: "",
  action,
  entity: action.split(".")[0],
  entityId: `e-${id}`,
  entityLabel,
  territorySlug: "",
  oldRow: null,
  newRow: null,
  result,
});

const EVENTS = [
  { entry: make(1, "territory.update", "Refinery Block C", "09:14", "a.ivanova"), summary: "4 fields changed" },
  { entry: make(2, "placement.insert", "Storage Tank 500", "08:52", "d.smirnov"), summary: "placed at 12.4 / 0.0 / −3.1" },
  { entry: make(3, "model.delete", "Pipe Segment 12", "07:58", "a.ivanova"), summary: "soft-deleted · 3 placements detached" },
  { entry: make(4, "auth.login", "session started", "07:40", "system", "failed"), summary: "passkey · Chrome on macOS" },
];

function Live() {
  const [selected, setSelected] = useState<number | null>(1);
  return (
    <EventTimeline
      day="Today · 1 September"
      total={312}
      events={EVENTS}
      selectedId={selected}
      onSelect={setSelected}
    />
  );
}

export default {
  day: (
    <div className="max-w-2xl rounded-card border border-line bg-panel p-6">
      <Live />
    </div>
  ),
  quiet: (
    <div className="max-w-2xl rounded-card border border-line bg-panel p-6">
      <EventTimeline day="Sunday · 31 August" total={0} events={[]} />
    </div>
  ),
};
