import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { listJobs } from "./jobs-gateway";

const dto = { id: "j1", kind: "territory", slug: "yard", status: "running", progress: 0.4 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json([dto])));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET" };
};

describe("jobs gateway", () => {
  it("lists the live jobs as domain objects", async () => {
    const out = await listJobs();
    expect(request()).toEqual({ url: "/api/jobs", method: "GET" });
    expect(out).toEqual([
      {
        kind: "territory",
        slug: "yard",
        status: "running",
        progress: 0.4,
        stage: null,
        errorMessage: null,
      },
    ]);
  });

  it("reads a null body as no jobs", async () => {
    fetchMock.mockResolvedValueOnce(json(null));
    await expect(listJobs()).resolves.toEqual([]);
  });
});
