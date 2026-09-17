import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { abortUpload, appendChunk, finalizeUpload, initiateUpload } from "./upload-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json({ id: "u1", size: 10, offset: 0 })));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return {
    url,
    method: init.method ?? "GET",
    headers: (init.headers ?? {}) as Record<string, string>,
    body: init.body,
  };
};

describe("upload gateway", () => {
  it("initiates a session with the file size and content type", async () => {
    const session = await initiateUpload(10, "application/zip");
    const req = request();
    expect(req.url).toBe("/api/uploads");
    expect(req.method).toBe("POST");
    expect(JSON.parse(req.body as string)).toEqual({ size: 10, contentType: "application/zip" });
    expect(session).toEqual({ id: "u1", size: 10, offset: 0 });
  });

  it("appends a chunk with the offset header, octet-stream, and the CSRF token", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { "Upload-Offset": "16" } }),
    );
    const next = await appendChunk("u1", 0, new Blob(["x"]));
    const req = request();
    expect(req.url).toBe("/api/uploads/u1");
    expect(req.method).toBe("PATCH");
    expect(req.headers["Upload-Offset"]).toBe("0");
    expect(req.headers["Content-Type"]).toBe("application/octet-stream");
    expect(req.headers["X-CSRF-Token"]).toBe("csrf");
    expect(next).toBe(16);
  });

  it("falls back to offset + chunk size when the response carries no Upload-Offset", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const blob = new Blob(["12345678"]);
    const next = await appendChunk("u1", 8, blob);
    expect(next).toBe(8 + blob.size);
  });

  it("rejects a non-2xx chunk append with the status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    await expect(appendChunk("u1", 0, new Blob(["x"]))).rejects.toThrow("409");
  });

  it("finalizes with a plain POST", async () => {
    fetchMock.mockResolvedValueOnce(json({ hash: "h1", size: 10 }));
    const out = await finalizeUpload("u1");
    const req = request();
    expect(req.url).toBe("/api/uploads/u1/finalize");
    expect(req.method).toBe("POST");
    expect(out).toEqual({ hash: "h1", size: 10 });
  });

  it("aborts with a DELETE", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await abortUpload("u1");
    const req = request();
    expect(req.url).toBe("/api/uploads/u1");
    expect(req.method).toBe("DELETE");
  });
});
