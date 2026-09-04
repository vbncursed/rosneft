import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { exportAuditCsv, listAudit, listAuditActors, toBound } from "./audit-gateway";

const entry = { id: 7, at: "2026-09-01T09:14:00Z", action: "territory.update", entity: "territory", result: "ok" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json({ entries: [entry], nextCursor: 6, refs: { "role_id:1": "Editor" } })));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const url = (n = 0) => fetchMock.mock.calls[n][0] as string;

describe("audit gateway", () => {
  it("builds the query from the filters and the cursor, and maps the page", async () => {
    const page = await listAudit({ actor: "u-1", entity: "territory", from: "2026-09-01T00:00:00Z" }, 40);
    expect(url()).toBe("/api/audit?actor=u-1&entity=territory&from=2026-09-01T00%3A00%3A00Z&cursor=40&limit=50");
    expect(page.entries[0].id).toBe(7);
    expect(page.nextCursor).toBe(6);
    expect(page.refs).toEqual({ "role_id:1": "Editor" });
  });

  it("sends only what is set, honours a limit, and reads 0 or absent nextCursor as the last page", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [] }));
    const page = await listAudit({}, null, 200);
    expect(url()).toBe("/api/audit?limit=200");
    expect(page).toEqual({ entries: [], nextCursor: null, refs: {} });
    fetchMock.mockResolvedValueOnce(json({ entries: [], nextCursor: 0 }));
    expect((await listAudit({}, null)).nextCursor).toBeNull();
  });

  it("widens a date to the edges of its day", () => {
    expect(toBound("2026-09-01", "from")).toBe("2026-09-01T00:00:00Z");
    expect(toBound("2026-09-01", "to")).toBe("2026-09-01T23:59:59Z");
  });

  it("lists actors with an empty login for a deleted account", async () => {
    fetchMock.mockResolvedValueOnce(json([{ id: "u-1", login: "a.ivanova" }, { id: "u-2" }]));
    await expect(listAuditActors()).resolves.toEqual([{ id: "u-1", login: "a.ivanova" }, { id: "u-2", login: "" }]);
    expect(url()).toBe("/api/audit/actors");
  });

  it("exports the same filters as CSV, never the cursor, and refuses with the status", async () => {
    fetchMock.mockResolvedValueOnce(new Response("at,actor\n", { status: 200, headers: { "Content-Type": "text/csv" } }));
    const blob = await exportAuditCsv({ entity: "model" });
    expect(url()).toBe("/api/audit.csv?entity=model");
    expect(await blob.text()).toBe("at,actor\n");
    fetchMock.mockResolvedValueOnce(json({ code: "forbidden", message: "You don't have permission to do this" }, 403));
    await expect(exportAuditCsv({})).rejects.toMatchObject({
      status: 403,
      message: "You don't have permission to do this",
    });
  });

  it("names the status when the refusal carries no sentence of its own", async () => {
    fetchMock.mockResolvedValueOnce(new Response("upstream down", { status: 502 }));
    await expect(exportAuditCsv({})).rejects.toMatchObject({ status: 502, message: "Export failed (502)" });
  });
});
