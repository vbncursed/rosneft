import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { login, verifyTwoFactor, logout } from "@/auth/infrastructure/auth-login";
import { isAuthed, markAuthed } from "@/auth/infrastructure/session-marker";

function ok(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

describe("auth-login", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  // The token in the response body is deliberately NOT stored: the session is
  // the httpOnly cookie the gateway set alongside it. Only the marker is kept.
  it("marks the session on non-2FA login", async () => {
    vi.stubGlobal("fetch", ok({ token: "t1", twoFactorRequired: false, challengeToken: "" }));
    const r = await login("me", "pw");
    expect(r.twoFactorRequired).toBe(false);
    expect(isAuthed()).toBe(true);
  });

  it("does NOT mark a session when 2FA required, returns challenge", async () => {
    vi.stubGlobal("fetch", ok({ token: "", twoFactorRequired: true, challengeToken: "chal" }));
    const r = await login("me", "pw");
    expect(r).toEqual({ twoFactorRequired: true, challengeToken: "chal" });
    expect(isAuthed()).toBe(false);
  });

  it("verifyTwoFactor marks the session", async () => {
    vi.stubGlobal("fetch", ok({ token: "t2" }));
    await verifyTwoFactor("chal", "123456");
    expect(isAuthed()).toBe(true);
  });

  it("logout clears the marker even if the request fails", async () => {
    markAuthed();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    await logout();
    expect(isAuthed()).toBe(false);
  });

  // The whole point of the move: nothing secret is left behind in localStorage.
  it("stores no token anywhere a script can read it", async () => {
    vi.stubGlobal("fetch", ok({ token: "super-secret", twoFactorRequired: false, challengeToken: "" }));
    await login("me", "pw");
    expect(JSON.stringify(localStorage)).not.toContain("super-secret");
  });
});
