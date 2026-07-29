import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  setCsrfToken,
  getCsrfToken,
  clearCsrfToken,
  ensureCsrfToken,
} from "@/auth/infrastructure/csrf-token";
import { markAuthed } from "@/auth/infrastructure/session-marker";

beforeEach(() => {
  clearCsrfToken();
  localStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe("csrf token", () => {
  it("has no token before anyone logs in", () => {
    expect(getCsrfToken()).toBeNull();
  });

  it("remembers the token handed out at login", () => {
    setCsrfToken("tok-1");
    expect(getCsrfToken()).toBe("tok-1");
  });

  it("forgets on logout", () => {
    setCsrfToken("tok-1");
    clearCsrfToken();
    expect(getCsrfToken()).toBeNull();
  });

  // Memory only, deliberately: a token in storage outlives the tab and is one
  // more secret at rest. It is re-read from /api/auth/me on every page load.
  it("never touches persistent storage", () => {
    setCsrfToken("tok-1");
    expect(JSON.stringify(localStorage)).not.toContain("tok-1");
    expect(document.cookie).not.toContain("tok-1");
  });

  // The bug this pins. A page load starts with an empty module, the route guard
  // is synchronous and the layout renders its children while meQuery is still
  // in flight — so a scene is interactive, and its gizmo can commit a PUT,
  // before anything has put a token in memory. Reading it would have returned
  // null and the mutation would have gone out bare and been refused.
  it("fetches the token when the tab has none yet", async () => {
    markAuthed();
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ csrfToken: "from-me" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", f);

    expect(getCsrfToken()).toBeNull();
    expect(await ensureCsrfToken()).toBe("from-me");
    expect(getCsrfToken()).toBe("from-me");
  });

  // Three mutations firing at once on a cold start must cost one round trip.
  it("deduplicates concurrent refreshes", async () => {
    markAuthed();
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ csrfToken: "once" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", f);

    const all = await Promise.all([ensureCsrfToken(), ensureCsrfToken(), ensureCsrfToken()]);
    expect(all).toEqual(["once", "once", "once"]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  // An anonymous visitor has nothing to fetch, and asking would 401. This is
  // also what stops the public login POST from buying a doomed round trip.
  it("does not ask when no session was ever established", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);

    expect(await ensureCsrfToken()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("returns the cached token without asking again", async () => {
    markAuthed();
    setCsrfToken("cached");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);

    expect(await ensureCsrfToken()).toBe("cached");
    expect(f).not.toHaveBeenCalled();
  });
});
