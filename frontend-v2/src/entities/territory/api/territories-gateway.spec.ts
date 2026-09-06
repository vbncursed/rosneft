import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import {
  createTerritory,
  deleteTerritory,
  getTerritory,
  listTerritories,
  replaceTerritorySource,
} from "./territories-gateway";

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
    expect(out).toEqual([{ slug: "t-1", title: "T 1", sourceBlobHash: "a".repeat(64), placementCount: 0 }]);
  });

  it("deletes by slug, encoded, and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteTerritory("t 1")).resolves.toBeUndefined();
    expect(request()).toEqual({ url: "/api/territories/t%201", method: "DELETE" });
  });

  it("creates a territory and maps the response to a domain territory and a job id", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        territory: { slug: "t-2", title: "T 2", sourceBlobHash: "b".repeat(64) },
        job: { id: "j-1", kind: "territory", slug: "t-2", status: "queued" },
      }),
    );
    const input = { title: "T 2", sourceBlobHash: "b".repeat(64) };
    const out = await createTerritory(input);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/territories");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
    expect(out).toEqual({
      territory: { slug: "t-2", title: "T 2", sourceBlobHash: "b".repeat(64), placementCount: 0 },
      job: { id: "j-1" },
    });
  });

  it("gets one territory by slug, encoded", async () => {
    fetchMock.mockResolvedValueOnce(json(territory));
    const out = await getTerritory("t 1");
    expect(request()).toEqual({ url: "/api/territories/t%201", method: "GET" });
    expect(out.slug).toBe("t-1");
  });

  it("replaces the source and maps the territory and the job id", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ territory, job: { id: "j-9", kind: "territory", slug: "t-1", status: "queued" } }, 202),
    );
    const out = await replaceTerritorySource("t-1", "d".repeat(64));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/territories/t-1/source");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sourceBlobHash: "d".repeat(64) });
    expect(out).toEqual({ territory: expect.objectContaining({ slug: "t-1" }), job: { id: "j-9" } });
  });
});
