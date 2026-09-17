import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpDelete, httpGet, httpGetBlob, httpHead, httpPost } from "./client";
import { markAuthed, isAuthed } from "@/shared/session";
import { setCsrfToken, clearCsrfToken } from "./csrf";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  assign = vi.fn();
  vi.stubGlobal("location", { pathname: "/console/users", search: "", assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("http client", () => {
  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { id: "u-1" })));
    await expect(httpGet<{ id: string }>("/api/auth/me")).resolves.toEqual({ id: "u-1" });
  });

  it("sends the CSRF token on mutations and not on reads", async () => {
    setCsrfToken("csrf-1");
    const f = vi.fn().mockImplementation(async () => jsonResponse(200, {}));
    vi.stubGlobal("fetch", f);

    await httpPost("/api/x", {});
    expect(((f.mock.calls[0][1] as RequestInit).headers as Record<string, string>)["X-CSRF-Token"])
      .toBe("csrf-1");

    await httpGet("/api/x");
    expect(((f.mock.calls[1][1] as RequestInit).headers as Record<string, string>)["X-CSRF-Token"])
      .toBeUndefined();
    clearCsrfToken();
  });

  it("sends no Authorization header — the session is a cookie", async () => {
    markAuthed();
    const f = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", f);
    await httpGet("/api/x");
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("omits Authorization when there is no session either", async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", f);
    await httpGet("/api/x");
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("returns undefined for 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(204, undefined)));
    await expect(httpGet("/api/x")).resolves.toBeUndefined();
  });

  // A 401 anywhere but /login means the session died under us: drop the marker
  // so the guard stops claiming otherwise, and take the user somewhere useful.
  it("drops the marker and bounces to login on a 401", async () => {
    markAuthed();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));

    await expect(httpGet("/api/territories")).rejects.toThrow();

    expect(isAuthed()).toBe(false);
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fconsole%2Fusers");
  });

  // A credentialed request's 401 answers the credential (a wrong login
  // password, a wrong current password), not the session. Bouncing would
  // replace the error the caller needs with a reload of wherever they were —
  // and for an already-live session, would sign the user out over a typo.
  it("does not bounce a credentialed request on a 401", async () => {
    markAuthed();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "bad" })));

    await expect(httpPost("/api/auth/login", {}, { credentialed: true })).rejects.toThrow("bad");

    expect(assign).not.toHaveBeenCalled();
    expect(isAuthed()).toBe(true);
  });

  it("still bounces a plain (non-credentialed) request on a 401", async () => {
    markAuthed();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "bad" })));

    await expect(httpPost("/api/x", {})).rejects.toThrow("bad");

    expect(assign).toHaveBeenCalledWith("/login?next=%2Fconsole%2Fusers");
    expect(isAuthed()).toBe(false);
  });

  // httpDelete is the one verb widened for `removePasskey`'s sake, so it is
  // the one most likely to acquire a wrong default later. Every other verb's
  // negative direction is covered above (httpGet, httpPost, httpGetBlob) —
  // this closes the gap a default-credentialed slip in httpDelete itself
  // would leave invisible.
  it("bounces a plain (non-credentialed) httpDelete on a 401", async () => {
    markAuthed();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "bad" })));

    await expect(httpDelete("/api/x")).rejects.toThrow("bad");

    expect(assign).toHaveBeenCalledWith("/login?next=%2Fconsole%2Fusers");
    expect(isAuthed()).toBe(false);
  });

  it("carries the gateway's own message on a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { message: "slug taken" })));
    await expect(httpPost("/api/territories", {})).rejects.toThrow("slug taken");
  });

  it("says something useful when a 403 carries no message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, {})));
    await expect(httpGet("/api/audit")).rejects.toThrow("You don't have permission to do this");
  });

  it("fetches a blob through the same base URL and 401 bounce as JSON", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response("a,b\n", { status: 200, headers: { "Content-Type": "text/csv" } }),
    );
    const blob = await httpGetBlob("/api/audit.csv");
    expect(await blob.text()).toBe("a,b\n");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${import.meta.env.VITE_API_URL}/api/audit.csv`);
    expect((init.headers as Record<string, string>).Accept).toBe("*/*");
  });

  it("resolves an empty blob on a 204, not undefined", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(204, undefined)));
    const blob = await httpGetBlob("/api/audit.csv");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(0);
  });

  it("drops the marker and bounces to login on a 401 for a blob too", async () => {
    markAuthed();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));

    await expect(httpGetBlob("/api/audit.csv")).rejects.toThrow();

    expect(isAuthed()).toBe(false);
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fconsole%2Fusers");
  });

  it("HEADs a path and hands back the response headers", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { "Content-Length": "1234" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const headers = await httpHead("/api/assets/abc");

    expect(headers.get("Content-Length")).toBe("1234");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${import.meta.env.VITE_API_URL}/api/assets/abc`);
    expect(init.method).toBe("HEAD");
    expect(new Headers(init.headers).has("X-CSRF-Token")).toBe(false);
  });
});
