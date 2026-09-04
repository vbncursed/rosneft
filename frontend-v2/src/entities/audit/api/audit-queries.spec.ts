import { describe, expect, it, vi } from "vitest";

vi.mock("./audit-gateway", () => ({
  listAudit: vi.fn(async () => ({ entries: [], nextCursor: null, refs: {} })),
  listAuditActors: vi.fn(async () => []),
}));
const { auditActorsQuery, auditQuery, auditWindowQuery, followInterval } = await import("./audit-queries");

describe("audit queries", () => {
  it("keys the journal by its filters, pages by nextCursor, and follows only the first page", () => {
    const q = auditQuery({ entity: "territory" });
    expect(q.queryKey).toEqual(["audit", { entity: "territory" }]);
    expect(q.getNextPageParam({ entries: [], nextCursor: 12, refs: {} }, [], null, [])).toBe(12);
    expect(q.getNextPageParam({ entries: [], nextCursor: null, refs: {} }, [], null, [])).toBeNull();
    expect(q.refetchIntervalInBackground).toBe(false);
    expect(followInterval(1)).toBe(30000);
    expect(followInterval(2)).toBe(false);
    expect(followInterval(0)).toBe(30000);
  });

  it("keys the actors and the 24h window", () => {
    expect(auditActorsQuery.queryKey).toEqual(["audit", "actors"]);
    expect(auditWindowQuery("2026-09-01T00:00:00Z").queryKey).toEqual(["audit", "window", "2026-09-01T00:00:00Z"]);
  });
});
