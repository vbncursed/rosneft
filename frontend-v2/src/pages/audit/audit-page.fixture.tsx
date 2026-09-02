import { useMemo, useState } from "react";
import type { AuditEntry } from "@/entities/audit";
import { ConsoleLayout } from "@/widgets/console-layout";
import { AuditPage, type AuditDay } from "./ui/audit-page";

const noop = () => {};

const make = (
  id: number,
  action: string,
  entityLabel: string,
  actorLogin: string,
  time: string,
  over: Partial<AuditEntry> = {},
): AuditEntry => ({
  id,
  at: `2026-09-01T${time}:00Z`,
  actorId: actorLogin === "system" ? "" : `u-${id}`,
  actorLogin: actorLogin === "system" ? "" : actorLogin,
  action,
  entity: action.split(".")[0],
  entityId: `e-${id}`,
  entityLabel,
  oldRow: { title: "Refinery Block", legacy_slug: "block-c-old" },
  newRow: { title: "Refinery Block C", external_panorama_url: "https://tour.example.com/rbc" },
  result: "ok",
  ...over,
});

const DAYS: AuditDay[] = [
  {
    key: "today",
    label: "Today · 1 September",
    total: 312,
    events: [
      {
        entry: make(1, "territory.update", "Refinery Block C", "a.ivanova", "09:14"),
        summary: "title, description and 2 more fields changed",
      },
      {
        entry: make(2, "placement.create", "Storage Tank 500", "d.smirnov", "08:52"),
        summary: "placed at 12.4 / 0.0 / −3.1 · scale 1×",
      },
      {
        entry: make(3, "auth.login", "session started", "m.orlova", "08:31"),
        summary: "passkey · Chrome on macOS",
      },
      {
        entry: make(4, "model.delete", "Pipe Segment 12", "a.ivanova", "07:58"),
        summary: "soft-deleted with 3 placements detached",
      },
    ],
  },
  {
    key: "yesterday",
    label: "Yesterday · 31 August",
    total: 268,
    events: [
      {
        entry: make(5, "model.upload", "Flare Stack", "system", "22:07", { result: "failed" }),
        summary: "OBJ parse error at line 84120",
      },
      {
        entry: make(6, "user.role_change", "guest.viewer", "a.ivanova", "16:31"),
        summary: "Guest → Field Operator",
      },
      {
        entry: make(7, "territory.create", "Terminal Yard 4", "a.ivanova", "14:02"),
        summary: "conversion queued · job 8f21",
      },
    ],
  },
];

const ACTIVITY = {
  label: "Events · last 24h",
  detail: "peak 41/h at 14:00",
  dimFrom: 18,
  values: [12, 18, 9, 6, 4, 5, 11, 24, 31, 38, 44, 39, 47, 52, 41, 36, 44, 29, 22, 17, 12, 9, 14, 8],
};

const COUNTERS = [
  { label: "Today", value: "312" },
  { label: "Failed", value: "4", tone: "bad" as const },
  { label: "Actors", value: "9", tone: "accent" as const },
];

const NAV = [
  { key: "users", label: "Users", href: "#" },
  { key: "roles", label: "Roles & Permissions", href: "#" },
  { key: "content", label: "Content", href: "#" },
  { key: "access", label: "Territory access", href: "#" },
  { key: "audit", label: "Audit journal", href: "#" },
  { key: "metrics", label: "Metrics", href: "#" },
];

const everyone = DAYS.flatMap((day) => day.events);

function Live({ initialSelected }: { initialSelected: number | null }) {
  const [query, setQuery] = useState("entity:territory");
  const [range, setRange] = useState<string | null>("last 7 days");
  const [selectedId, setSelectedId] = useState<number | null>(initialSelected);

  const found = useMemo(
    () => everyone.find((e) => e.entry.id === selectedId) ?? null,
    [selectedId],
  );

  return (
    <ConsoleLayout
      items={NAV}
      active="audit"
      backHref="#"
      viewer={{ username: "a.ivanova", roleTitle: "Company Owner" }}
    >
      <AuditPage
        live
        days={DAYS}
        activity={ACTIVITY}
        counters={COUNTERS}
        query={query}
        onQueryChange={setQuery}
        extraFilters={range ? [{ label: range, onRemove: () => setRange(null) }] : []}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCloseInspector={() => setSelectedId(null)}
        inspected={
          found && {
            entry: found.entry,
            recordId: "4f21c8",
            details: [
              { label: "actor", value: "a.ivanova · Company Owner" },
              { label: "at", value: "2026-09-01 09:14:22 UTC" },
              { label: "ip", value: "10.42.0.18" },
              { label: "result", value: found.entry.result, tone: found.entry.result === "ok" ? "ok" : "bad" },
              { label: "digest", value: "sha256:9c1f…a204", tone: "muted" },
            ],
          }
        }
        onExport={noop}
        onCopyJson={noop}
        onOpenEntity={noop}
        onLoadOlder={noop}
      />
    </ConsoleLayout>
  );
}

export default {
  withRecord: <Live initialSelected={1} />,
  journalOnly: <Live initialSelected={null} />,
};
