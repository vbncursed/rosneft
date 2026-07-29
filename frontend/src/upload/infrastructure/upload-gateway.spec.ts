import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appendChunk, getUploadStatus, abortUpload } from "@/upload/infrastructure/upload-gateway";
import { markAuthed } from "@/auth/infrastructure/session-marker";

const API = "http://localhost:8080";

// The parameters are declared so mock.calls is typed as (url, init) rather
// than the empty tuple an argless vi.fn infers.
function mockFetch(status: number, headers: Record<string, string> = {}) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status, headers }));
}

describe("upload-gateway raw fetches", () => {
  beforeEach(() => {
    localStorage.clear();
    markAuthed();
  });
  afterEach(() => vi.restoreAllMocks());

  it("appendChunk hits absolute gateway URL with Bearer + Upload-Offset", async () => {
    const f = mockFetch(204, { "Upload-Offset": "16" });
    vi.stubGlobal("fetch", f);
    const next = await appendChunk("s1", 0, new Blob(["x"]));
    expect(f.mock.calls[0][0]).toBe(`${API}/api/uploads/s1`);
    const init = f.mock.calls[0][1] as RequestInit;
    const h = init.headers as Record<string, string>;
    // No Authorization: the session cookie rides on this same-origin fetch.
    expect(h.Authorization).toBeUndefined();
    expect(h["Upload-Offset"]).toBe("0");
    expect(next).toBe(16);
  });

  it("getUploadStatus HEAD returns offset/size, 404 → null", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { "Upload-Offset": "8", "Upload-Length": "32" }));
    expect(await getUploadStatus("s1")).toEqual({ offset: 8, size: 32 });
    vi.stubGlobal("fetch", mockFetch(404));
    expect(await getUploadStatus("s1")).toBeNull();
  });

  it("abortUpload DELETEs the absolute URL with Bearer", async () => {
    const f = mockFetch(204);
    vi.stubGlobal("fetch", f);
    await abortUpload("s1");
    expect(f.mock.calls[0][0]).toBe(`${API}/api/uploads/s1`);
    expect((f.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    expect(
      ((f.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });
});
