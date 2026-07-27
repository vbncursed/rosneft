import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { login, verifyTwoFactor, logout } from "@/auth/infrastructure/auth-login";
import { getToken, setToken } from "@/auth/infrastructure/token-store";

function ok(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

describe("auth-login", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("stores token on non-2FA login", async () => {
    vi.stubGlobal("fetch", ok({ token: "t1", twoFactorRequired: false, challengeToken: "" }));
    const r = await login("me", "pw");
    expect(r.twoFactorRequired).toBe(false);
    expect(getToken()).toBe("t1");
  });

  it("does NOT store token when 2FA required, returns challenge", async () => {
    vi.stubGlobal("fetch", ok({ token: "", twoFactorRequired: true, challengeToken: "chal" }));
    const r = await login("me", "pw");
    expect(r).toEqual({ twoFactorRequired: true, challengeToken: "chal" });
    expect(getToken()).toBeNull();
  });

  it("verifyTwoFactor stores token", async () => {
    vi.stubGlobal("fetch", ok({ token: "t2" }));
    await verifyTwoFactor("chal", "123456");
    expect(getToken()).toBe("t2");
  });

  it("logout clears token even if request fails", async () => {
    setToken("t3");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    await logout();
    expect(getToken()).toBeNull();
  });
});
