import type { components } from "@/shared/api/dto";
import type { AuditEntry } from "../model/audit-entry";

type AuditEntryDto = components["schemas"]["AuditEntry"];

/** A snapshot is JSON text or empty; anything unparseable reads as none. */
function parseRow(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const toAuditEntry = (d: AuditEntryDto): AuditEntry => ({
  id: d.id,
  at: d.at,
  actorId: d.actorId ?? "",
  actorLogin: d.actorLogin ?? "",
  companyId: d.companyId ?? "",
  companyLogin: d.companyLogin ?? "",
  action: d.action,
  entity: d.entity,
  entityId: d.entityId ?? "",
  entityLabel: d.entityLabel ?? "",
  territorySlug: d.territorySlug ?? "",
  oldRow: parseRow(d.oldRow),
  newRow: parseRow(d.newRow),
  result: d.result,
});
