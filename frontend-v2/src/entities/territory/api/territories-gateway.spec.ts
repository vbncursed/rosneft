import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { deleteTerritory, listTerritories } from "./territories-gateway";

const territory = { slug: "t-1", title: "T 1", sourceBlobHash: "a".repeat(64) };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json([territory])));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET" };
};

describe("territories gateway", () => {
  it("lists territories as domain objects", async () => {
    const out = await listTerritories();
    expect(request()).toEqual({ url: "/api/territories", method: "GET" });
    expect(out).toEqual([{ slug: "t-1", title: "T 1", sourceBlobHash: "a".repeat(64) }]);
  });

  it("deletes by slug, encoded, and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteTerritory("t 1")).resolves.toBeUndefined();
    expect(request()).toEqual({ url: "/api/territories/t%201", method: "DELETE" });
  });
});
