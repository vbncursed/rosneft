import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listPermissions } from "./permissions-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json([])));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("permissions gateway", () => {
  it("hits the permission catalog route", async () => {
    await listPermissions();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/permissions");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("maps to domain permissions, keeping a real description", async () => {
    fetchMock.mockResolvedValueOnce(json([{ slug: "territory:read", description: "See territories" }]));
    const permissions = await listPermissions();
    expect(permissions).toEqual([{ slug: "territory:read", description: "See territories" }]);
  });

  it("turns an empty description into an absent key", async () => {
    fetchMock.mockResolvedValueOnce(json([{ slug: "territory:read", description: "" }]));
    const permissions = await listPermissions();
    expect(permissions).toEqual([{ slug: "territory:read" }]);
    expect(permissions[0]).not.toHaveProperty("description");
  });
});
