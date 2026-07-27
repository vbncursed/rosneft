import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { httpGet, httpPost } from "@/shared/infrastructure/http/client";
import { setToken } from "@/auth/infrastructure/token-store";
import { HttpError } from "@/shared/infrastructure/http/http-error";

const API = "http://localhost:8080";

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

describe("api-client", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("prefixes VITE_API_URL and parses JSON", async () => {
    const f = mockFetch(200, { ok: true });
    vi.stubGlobal("fetch", f);
    const r = await httpGet<{ ok: boolean }>("/api/x");
    expect(f).toHaveBeenCalledWith(`${API}/api/x`, expect.anything());
    expect(r).toEqual({ ok: true });
  });

  it("attaches Bearer when a token is present", async () => {
    setToken("tok123");
    const f = mockFetch(200, {});
    vi.stubGlobal("fetch", f);
    await httpGet("/api/x");
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("omits Authorization when no token", async () => {
    const f = mockFetch(200, {});
    vi.stubGlobal("fetch", f);
    await httpGet("/api/x");
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("throws HttpError with gateway message on non-2xx", async () => {
    const f = mockFetch(403, { code: "forbidden", message: "nope" });
    vi.stubGlobal("fetch", f);
    await expect(httpPost("/api/x", {})).rejects.toMatchObject({
      constructor: HttpError,
      status: 403,
      message: "nope",
    });
  });

  it("returns undefined for 204", async () => {
    const f = mockFetch(204, undefined);
    vi.stubGlobal("fetch", f);
    const r = await httpGet("/api/x");
    expect(r).toBeUndefined();
  });
});
