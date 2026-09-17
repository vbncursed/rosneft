import { describe, expect, it } from "vitest";
import { toAuditEntry } from "./to-audit-entry";

describe("toAuditEntry", () => {
  it("parses the row snapshots and defaults every optional string to empty", () => {
    expect(
      toAuditEntry({
        id: 7, at: "2026-09-01T09:14:00Z", action: "territory.update", entity: "territory", result: "ok",
        actorId: "u-1", actorLogin: "a.ivanova", companyId: "c-1", companyLogin: "cotest",
        entityId: "t-1", entityLabel: "refinery-block-c", territorySlug: "",
        oldRow: '{"title":"Old"}', newRow: '{"title":"New"}',
      }),
    ).toEqual({
      id: 7, at: "2026-09-01T09:14:00Z", action: "territory.update", entity: "territory", result: "ok",
      actorId: "u-1", actorLogin: "a.ivanova", companyId: "c-1", companyLogin: "cotest",
      entityId: "t-1", entityLabel: "refinery-block-c", territorySlug: "",
      oldRow: { title: "Old" }, newRow: { title: "New" },
    });
    const bare = toAuditEntry({ id: 8, at: "2026-09-01T00:00:00Z", action: "auth.login", entity: "session", result: "failed" });
    expect(bare).toMatchObject({ actorId: "", actorLogin: "", companyId: "", companyLogin: "", entityId: "", entityLabel: "", territorySlug: "", oldRow: null, newRow: null });
  });

  it("treats an empty or malformed snapshot as no snapshot", () => {
    expect(toAuditEntry({ id: 1, at: "x", action: "a.insert", entity: "a", result: "ok", oldRow: "", newRow: "{not json" }).newRow).toBeNull();
  });
});
