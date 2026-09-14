import type { AuditEntry } from "../model/audit-entry";
import { ActivityRow } from "./activity-row";

const now = new Date();
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

const base = {
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  entityId: "",
  entityLabel: "",
  territorySlug: "",
  oldRow: null,
  newRow: null,
  result: "ok",
} satisfies Omit<AuditEntry, "id" | "at" | "action" | "entity">;

const ENTRIES: AuditEntry[] = [
  { ...base, id: 4, at: ago(6), action: "auth.login", entity: "session" },
  { ...base, id: 3, at: ago(95), action: "territory.replace_source", entity: "territory" },
  {
    ...base,
    id: 2,
    at: ago(26 * 60),
    action: "model.create",
    entity: "model",
    entityLabel: "pump-jack-unit",
  },
  {
    ...base,
    id: 1,
    at: ago(4 * 24 * 60),
    action: "placement.update",
    entity: "placement",
    entityLabel: "Pump Jack Unit",
    territorySlug: "north-ridge-pad",
  },
];

export default (
  <ul className="m-0 list-none p-6">
    {ENTRIES.map((entry) => (
      <ActivityRow key={entry.id} entry={entry} now={now} className="px-[22px] py-3.5" />
    ))}
  </ul>
);
