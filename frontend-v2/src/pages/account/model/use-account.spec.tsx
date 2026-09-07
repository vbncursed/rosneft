import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useAccount } from "./use-account";

const PRINCIPAL = {
  id: "u-1",
  email: "a.ivanova@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: true,
  roleSlugs: ["admin"],
  roleTitles: { admin: "Company Owner" },
  permissions: [],
  isOwner: true,
  onboardingToursSeen: [],
};

const TWO_FACTOR = { enabled: true, enabledAt: "2026-08-12T09:20:00Z", recoveryRemaining: 7, recoveryTotal: 10 };
const PASSKEYS = [{ id: "p-1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: null }];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
let twoFactorStatus = 200;
let passkeysStatus = 200;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setCsrfToken("csrf");
  twoFactorStatus = 200;
  passkeysStatus = 200;
  fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url, "http://x").pathname;
    if (path === "/api/auth/me") return json(PRINCIPAL);
    if (path === "/api/auth/2fa") {
      return twoFactorStatus === 200 ? json(TWO_FACTOR) : json({ message: "boom" }, twoFactorStatus);
    }
    if (path === "/api/auth/passkey/credentials") {
      return passkeysStatus === 200
        ? json({ credentials: PASSKEYS })
        : json({ message: "boom" }, passkeysStatus);
    }
    if (path === "/api/auth/me/password") return json(undefined, 204);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  clearNotices();
});

afterEach(() => {
  vi.unstubAllGlobals();
  client.clear();
});

describe("useAccount", () => {
  it("is loading, then ready with the principal and both side queries resolved", async () => {
    const { result } = renderHook(() => useAccount(), { wrapper });
    expect(result.current.phase).toBe("loading");

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    await waitFor(() => {
      if (result.current.phase !== "ready") throw new Error("not ready");
      expect(result.current.twoFactor).toEqual(TWO_FACTOR);
    });
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.me).toEqual(PRINCIPAL);
    expect(result.current.passkeys).toEqual(PASSKEYS);
    expect(result.current.passwordBusy).toBe(false);
  });

  // Not "off" — a 500 on the 2FA status must never be read as a factor being
  // disabled, which is exactly the shape postureCards depends on.
  it("reads twoFactor as null when that query fails but me succeeds", async () => {
    twoFactorStatus = 500;
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    await waitFor(() => {
      if (result.current.phase !== "ready") throw new Error("not ready");
      expect(result.current.me).toEqual(PRINCIPAL);
    });
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.twoFactor).toBeNull();
  });

  it("reads passkeys as null when that query fails but me succeeds", async () => {
    passkeysStatus = 500;
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    await waitFor(() => {
      if (result.current.phase !== "ready") throw new Error("not ready");
      expect(result.current.me).toEqual(PRINCIPAL);
    });
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.passkeys).toBeNull();
  });

  it("is unavailable when the principal itself cannot be fetched", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      if (path === "/api/auth/me") return json({ message: "down" }, 500);
      return json({});
    });
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("unavailable"));
  });

  it("changes the password and toasts success", async () => {
    const { result } = renderHook(() => ({ s: useAccount(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.phase).toBe("ready"));
    const ready = result.current.s;
    if (ready.phase !== "ready") throw new Error("unreachable");

    act(() => ready.onChangePassword("old-pass", "new-pass"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/me/password"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(result.current.notices).toHaveLength(1));
    expect(result.current.notices[0]?.tone).toBe("success");
  });

  it("toasts the gateway's message on a rejected password change", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      if (path === "/api/auth/me") return json(PRINCIPAL);
      if (path === "/api/auth/2fa") return json(TWO_FACTOR);
      if (path === "/api/auth/passkey/credentials") return json({ credentials: PASSKEYS });
      if (path === "/api/auth/me/password") return json({ message: "wrong current password" }, 400);
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result } = renderHook(() => ({ s: useAccount(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.phase).toBe("ready"));
    const ready = result.current.s;
    if (ready.phase !== "ready") throw new Error("unreachable");

    act(() => ready.onChangePassword("wrong", "new-pass"));
    await waitFor(() => expect(result.current.notices).toHaveLength(1));
    expect(result.current.notices[0]?.tone).toBe("error");
    expect(result.current.notices[0]?.message).toBe("wrong current password");
  });
});
