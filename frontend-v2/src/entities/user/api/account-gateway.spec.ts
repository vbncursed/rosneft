import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import {
  changePassword,
  disable2FA,
  enable2FA,
  regenerateRecoveryCodes,
  setup2FA,
  twoFactorStatus,
} from "./account-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // A factory, not mockResolvedValue: a real Response body can be read only
  // once, and this default answers more than one call per test.
  fetchMock = vi.fn(() => Promise.resolve(json({})));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe("account gateway", () => {
  it("changes a password with both fields", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await changePassword("old", "new");
    expect(request()).toEqual({
      url: "/api/auth/me/password",
      method: "POST",
      body: { oldPassword: "old", newPassword: "new" },
    });
  });

  it("reads the 2FA status and keeps a missing enabledAt as null", async () => {
    fetchMock.mockResolvedValueOnce(json({ enabled: true, recoveryRemaining: 7, recoveryTotal: 10 }));
    expect(await twoFactorStatus()).toEqual({
      enabled: true, enabledAt: null, recoveryRemaining: 7, recoveryTotal: 10,
    });
  });

  it("defaults every field when the status response omits all of them", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await twoFactorStatus()).toEqual({
      enabled: false, enabledAt: null, recoveryRemaining: 0, recoveryTotal: 0,
    });
  });

  it("sets up 2FA with no body, mapping a response missing both fields", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await setup2FA()).toEqual({ secret: "", otpauthUrl: "" });
    expect(request()).toEqual({ url: "/api/auth/2fa/setup", method: "POST", body: undefined });
  });

  it("returns the recovery codes enable answers with, and an empty set when it sends none", async () => {
    fetchMock.mockResolvedValueOnce(json({ recoveryCodes: ["a", "b"] }));
    expect(await enable2FA("402913")).toEqual(["a", "b"]);
    expect(request()).toEqual({ url: "/api/auth/2fa/enable", method: "POST", body: { code: "402913" } });

    fetchMock.mockResolvedValueOnce(json({}));
    expect(await regenerateRecoveryCodes("402913")).toEqual([]);
    expect(request(1)).toEqual({
      url: "/api/auth/2fa/recovery/regenerate",
      method: "POST",
      body: { code: "402913" },
    });
  });

  it("sends the code as the only field disable takes", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await disable2FA("402913");
    expect(request()).toEqual({ url: "/api/auth/2fa/disable", method: "POST", body: { code: "402913" } });
  });
});
