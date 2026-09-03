import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { deleteModel, listModels } from "./models-gateway";

const model = { slug: "m-1", title: "M 1", sourceBlobHash: "b".repeat(64), thumbnailBlobHash: "" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json([model])));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET" };
};

describe("models gateway", () => {
  it("lists models as domain objects", async () => {
    const out = await listModels();
    expect(request()).toEqual({ url: "/api/models", method: "GET" });
    expect(out).toEqual([{ slug: "m-1", title: "M 1", sourceBlobHash: "b".repeat(64) }]);
  });

  it("deletes by slug, encoded, and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteModel("m 1")).resolves.toBeUndefined();
    expect(request()).toEqual({ url: "/api/models/m%201", method: "DELETE" });
  });
});
