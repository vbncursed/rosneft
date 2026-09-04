import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpGet, httpGetBlob, httpPost } from "./client";
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

  // On /login a 401 is a wrong password, not a dead session. Redirecting there
  // would replace the error message with a reload of the same screen.
  it("leaves a 401 alone when the user is already on /login", async () => {
    vi.stubGlobal("location", { pathname: "/login", search: "", assign });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "bad" })));

    await expect(httpPost("/api/auth/login", {})).rejects.toThrow("bad");

    expect(assign).not.toHaveBeenCalled();
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
});
