import { describe, expect, it, vi } from "vitest";

const listMyAudit = vi.fn(async () => ({ entries: [], nextCursor: null, refs: {} }));
vi.mock("./audit-gateway", () => ({ listMyAudit }));
const { myAuditQuery } = await import("./my-audit-query");

describe("myAuditQuery", () => {
  // Not ["audit", filters] — this feed has no filters, and sharing that key
  // shape would let the console journal's cache answer for it.
  it("is keyed apart from the company journal", () => {
    expect(myAuditQuery.queryKey).toEqual(["audit", "mine"]);
  });

  it("starts with no cursor and pages by the one the last page reported", () => {
    expect(myAuditQuery.initialPageParam).toBeNull();
    expect(myAuditQuery.getNextPageParam({ entries: [], nextCursor: 12, refs: {} }, [], null, [])).toBe(12);
    expect(myAuditQuery.getNextPageParam({ entries: [], nextCursor: null, refs: {} }, [], null, [])).toBeNull();
  });

  it("fetches its own route with the page's cursor", async () => {
    await myAuditQuery.queryFn!({ pageParam: 40 } as never);
    expect(listMyAudit).toHaveBeenCalledWith(40);
  });
});
