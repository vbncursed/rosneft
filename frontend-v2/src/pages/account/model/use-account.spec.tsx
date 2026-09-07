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
const AUDIT_PAGE_1 = {
  entries: [{ id: 9, at: "2026-09-07T09:14:00Z", action: "auth.login", entity: "session", result: "ok" }],
  nextCursor: 9,
};
const AUDIT_PAGE_2 = {
  entries: [{ id: 4, at: "2026-09-06T18:20:00Z", action: "auth.passkey_register", entity: "credential", result: "ok" }],
  nextCursor: 0,
};

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
    if (path === "/api/audit/mine") {
      return json(new URL(url, "http://x").searchParams.has("cursor") ? AUDIT_PAGE_2 : AUDIT_PAGE_1);
    }
    if (path === "/api/auth/2fa/disable") return json(undefined, 204);
    if (path.startsWith("/api/auth/passkey/credentials/")) return json(undefined, 204);
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
    expect(result.current.twoFactorLoading).toBe(false);
    expect(result.current.passkeysLoading).toBe(false);
  });

  // `catalogRoute`'s loader awaits `me`, so it is never actually pending on
  // mount in production — phase flips to "ready" while the two side queries
  // are typically still in flight. That window must read as "still loading"
  // on each card, not a confident null.
  it("is ready with both side queries still pending when they resolve after me does", async () => {
    let resolveTwoFactor: (() => void) | undefined;
    let resolvePasskeys: (() => void) | undefined;
    fetchMock.mockImplementation(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      if (path === "/api/auth/me") return json(PRINCIPAL);
      if (path === "/api/auth/2fa") {
        await new Promise<void>((resolve) => (resolveTwoFactor = resolve));
        return json(TWO_FACTOR);
      }
      if (path === "/api/auth/passkey/credentials") {
        await new Promise<void>((resolve) => (resolvePasskeys = resolve));
        return json({ credentials: PASSKEYS });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.twoFactorLoading).toBe(true);
    expect(result.current.passkeysLoading).toBe(true);
    // Not a confident answer while still in flight.
    expect(result.current.twoFactor).toBeNull();
    expect(result.current.passkeys).toBeNull();

    await act(async () => {
      resolveTwoFactor?.();
      resolvePasskeys?.();
    });
    await waitFor(() => {
      if (result.current.phase !== "ready") throw new Error("not ready");
      expect(result.current.twoFactorLoading).toBe(false);
      expect(result.current.passkeysLoading).toBe(false);
    });
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

    await act(async () => {
      await ready.onChangePassword("old-pass", "new-pass");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/me/password"),
      expect.objectContaining({ method: "POST" }),
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

    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      await ready.onChangePassword("wrong", "new-pass").catch(() => {});
    });
    await waitFor(() => expect(result.current.notices).toHaveLength(1));
    expect(result.current.notices[0]?.tone).toBe("error");
    expect(result.current.notices[0]?.message).toBe("wrong current password");
    // Self-correcting: a dead session 401s here exactly like a wrong password
    // does, so `me` is re-asked either way — a genuinely dead session then
    // takes the ordinary 401 path on its own within one round trip.
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["me"] }));
  });

  // The reviewer's trap: swapping `unanswered(me)` for `me.isError` leaves
  // every other test green, because none of them cover a refetch that fails
  // on top of a principal the hook already has.
  it("stays ready when a refetch fails on top of the principal it already has", async () => {
    const { result, rerender } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));

    fetchMock.mockImplementation(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      if (path === "/api/auth/me") return json({ message: "boom" }, 500);
      return json({});
    });
    await act(async () => {
      await client.refetchQueries({ queryKey: ["me"] });
    });
    // The refetch really did fail — the cache holds the error beside the
    // data, and the hook is re-rendered so it reads that state rather than a
    // stale one.
    await waitFor(() => expect(client.getQueryState(["me"])?.status).toBe("error"));
    rerender();
    expect(result.current.phase).toBe("ready");
  });

  it("flattens the activity pages and asks for the next one on demand", async () => {
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => {
      if (result.current.phase !== "ready") throw new Error("not ready");
      expect(result.current.activity).toHaveLength(1);
    });
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.activity[0].action).toBe("auth.login");
    expect(result.current.activityHasMore).toBe(true);

    act(() => {
      (result.current as { onLoadMore: () => void }).onLoadMore();
    });
    await waitFor(() => {
      if (result.current.phase !== "ready") throw new Error("not ready");
      expect(result.current.activity.map((e) => e.id)).toEqual([9, 4]);
      // The second page reported cursor 0 — the last page, so no more.
      expect(result.current.activityHasMore).toBe(false);
    });
  });

  // The bug the old SPA shipped: 2FA changed, `me` stayed stale, and the next
  // passkey removal asked for a password on an account that had just turned
  // 2FA on. A test that only checks the toast passes against that.
  it("invalidates both the 2FA status and the principal after a disable", async () => {
    const { result } = renderHook(() => ({ s: useAccount(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.phase).toBe("ready"));
    const ready = result.current.s;
    if (ready.phase !== "ready") throw new Error("unreachable");

    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      await ready.onDisable2FA("123456");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/2fa/disable"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "123456" }) }),
    );
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
    expect(keys).toContainEqual(["two-factor"]);
    expect(keys).toContainEqual(["me"]);
    // The journal records the disable, and this screen prints the journal
    // three sections lower. Without this the feed sits there missing the very
    // event the user just caused.
    expect(keys).toContainEqual(["audit", "mine"]);
    await waitFor(() => expect(result.current.notices[0]?.tone).toBe("success"));
  });

  it("leaves both caches alone and toasts the gateway's message when the disable is refused", async () => {
    const { result } = renderHook(() => ({ s: useAccount(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.phase).toBe("ready"));
    const ready = result.current.s;
    if (ready.phase !== "ready") throw new Error("unreachable");

    fetchMock.mockImplementationOnce(async () => json({ message: "invalid code" }, 401));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      await ready.onDisable2FA("000000").catch(() => {});
    });
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
    expect(keys).not.toContainEqual(["two-factor"]);
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("invalid code"));
  });

  it("removes a passkey with the credential it was handed and refreshes the list", async () => {
    const { result } = renderHook(() => ({ s: useAccount(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.phase).toBe("ready"));
    const ready = result.current.s;
    if (ready.phase !== "ready") throw new Error("unreachable");

    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      await ready.onRemovePasskey("p-1", { code: "123456" });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/passkey/credentials/p-1"),
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ code: "123456" }) }),
    );
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
    expect(keys).toContainEqual(["passkeys"]);
    expect(keys).toContainEqual(["audit", "mine"]);
    await waitFor(() => expect(result.current.notices[0]?.tone).toBe("success"));
  });

  it("refreshes the passkey list after one is added elsewhere", async () => {
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    if (result.current.phase !== "ready") throw new Error("unreachable");

    const invalidate = vi.spyOn(client, "invalidateQueries");
    act(() => {
      (result.current as { onPasskeyAdded: () => void }).onPasskeyAdded();
    });
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
    expect(keys).toContainEqual(["passkeys"]);
    expect(keys).toContainEqual(["audit", "mine"]);
  });
});
