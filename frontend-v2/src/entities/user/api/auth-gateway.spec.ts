import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthed, markAuthed } from "@/shared/session";
import { login, logout, verifyTwoFactor } from "./auth-gateway";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("auth gateway", () => {
  // A password accepted with a second factor still outstanding is NOT a
  // session. Marking here would wave the guard into a console whose every
  // request 401s, and the user would watch it bounce straight back out.
  it("does not mark a session when a second factor is still due", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { twoFactorRequired: true, challengeToken: "chal-1" }),
      ),
    );

    const r = await login("a.ivanova", "pw");

    expect(r.twoFactorRequired).toBe(true);
    expect(r.challengeToken).toBe("chal-1");
    expect(isAuthed()).toBe(false);
  });

  it("marks the session when no second factor is due", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { twoFactorRequired: false, token: "t", csrfToken: "c" }),
      ),
    );

    await login("a.ivanova", "pw");

    expect(isAuthed()).toBe(true);
  });

  it("marks the session once the second factor is verified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { token: "t", csrfToken: "c" })),
    );

    await verifyTwoFactor("chal-1", "402913");

    expect(isAuthed()).toBe(true);
  });

  // The server call is what actually revokes the session; dropping the marker
  // is what stops this tab pretending otherwise. The second must happen even
  // when the first cannot.
  it("clears the marker on logout even when the server call fails", async () => {
    markAuthed();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await logout();

    expect(isAuthed()).toBe(false);
  });
});
