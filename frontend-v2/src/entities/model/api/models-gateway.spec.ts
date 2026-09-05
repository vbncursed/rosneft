import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { createModel, deleteModel, listModels, setModelThumbnail } from "./models-gateway";

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
    expect(out).toEqual([{ slug: "m-1", title: "M 1", sourceBlobHash: "b".repeat(64), usageCount: 0 }]);
  });

  it("deletes by slug, encoded, and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteModel("m 1")).resolves.toBeUndefined();
    expect(request()).toEqual({ url: "/api/models/m%201", method: "DELETE" });
  });

  it("creates a model and maps the response to a domain model and a job id", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        model: { slug: "m-2", title: "M 2", sourceBlobHash: "c".repeat(64) },
        job: { id: "j-2", kind: "model", slug: "m-2", status: "queued" },
      }),
    );
    const input = { title: "M 2", sourceBlobHash: "c".repeat(64) };
    const out = await createModel(input);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/models");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
    expect(out).toEqual({
      model: { slug: "m-2", title: "M 2", sourceBlobHash: "c".repeat(64), usageCount: 0 },
      job: { id: "j-2" },
    });
  });

  it("sets a model's thumbnail with a PATCH and maps the response back", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ slug: "m-2", title: "M 2", sourceBlobHash: "c".repeat(64), thumbnailBlobHash: "d".repeat(64) }),
    );
    const out = await setModelThumbnail("m 2", "d".repeat(64));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/models/m%202");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ thumbnailBlobHash: "d".repeat(64) });
    expect(out).toEqual({
      slug: "m-2",
      title: "M 2",
      sourceBlobHash: "c".repeat(64),
      thumbnailBlobHash: "d".repeat(64),
      usageCount: 0,
    });
  });
});
