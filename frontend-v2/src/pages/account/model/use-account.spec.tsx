import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useAccount, type AccountState } from "./use-account";

type Ready = Extract<AccountState, { phase: "ready" }>;

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
const auditEntry = (id: number) => ({
  id,
  at: "2026-09-07T09:14:00Z",
  action: "auth.login",
  entity: "session",
  result: "ok",
});

/** Nine events in one gateway page (limit 50) — two pages of six on screen. */
const AUDIT_NINE = {
  entries: Array.from({ length: 9 }, (_, i) => auditEntry(9 - i)),
  nextCursor: 0,
  total: 9,
};

/** Six-row cursor pages, as a feed longer than one gateway page really arrives. */
const auditCursorPage = (cursor: number | null) => {
  const first = cursor === null ? 60 : cursor - 1;
  return {
    entries: Array.from({ length: 6 }, (_, i) => auditEntry(first - i)),
    nextCursor: first - 6 > 36 ? first - 5 : 0,
    total: 24,
  };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
let twoFactorStatus = 200;
let passkeysStatus = 200;
/** What /api/audit/mine answers for a cursor. Reassigned by the paging cases. */
let auditPage: (cursor: number | null) => unknown | Promise<unknown>;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

/** Narrows the union — every paging case reads the ready phase. */
const ready = (result: { current: AccountState }): Ready => {
  if (result.current.phase !== "ready") throw new Error(`not ready: ${result.current.phase}`);
  return result.current;
};

const fetchCalls = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => new URL(url as string, "http://x").pathname === path);

/** The cursor of every /api/audit/mine call, in order — null for the first page. */
const cursorsAsked = () =>
  fetchCalls("/api/audit/mine").map(([url]) => {
    const raw = new URL(url as string, "http://x").searchParams.get("cursor");
    return raw === null ? null : Number(raw);
  });

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setCsrfToken("csrf");
  twoFactorStatus = 200;
  passkeysStatus = 200;
  auditPage = () => AUDIT_NINE;
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
      const raw = new URL(url, "http://x").searchParams.get("cursor");
      return json(await auditPage(raw === null ? null : Number(raw)));
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

  // Every Guest lacks audit:read_own (auth-service migration 00013), so the
  // feed 403s for them. Reporting that as an empty list told the reader
  // nothing had ever happened under their own account. Both sibling sections
  // already distinguish "we could not find out" from "none".
  it("reports a feed that never answered as unknown, not as an empty history", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      if (path === "/api/auth/me") return json(PRINCIPAL);
      if (path === "/api/auth/2fa") return json(TWO_FACTOR);
      if (path === "/api/auth/passkey/credentials") return json({ credentials: PASSKEYS });
      if (path === "/api/audit/mine") return json({ message: "You don't have permission" }, 403);
      throw new Error(`unexpected fetch ${url}`);
    });

    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => {
      if (result.current.phase !== "ready") throw new Error("not ready");
      expect(result.current.activity).toBeNull();
    });
    if (result.current.phase !== "ready") throw new Error("unreachable");
    // A dead feed is not a dead page — everything else still renders.
    expect(result.current.me).toEqual(PRINCIPAL);
    expect(result.current.activityTotal).toBeNull();
  });

  it("shows the first six of what is loaded and reads the total off the first page", async () => {
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));
    expect(ready(result).activityTotal).toBe(9);
    expect(ready(result).activityPage).toBe(1);
    expect(ready(result).activityPageCount).toBe(2);

    act(() => ready(result).onPage(2));
    // The short last page comes out of the rows already loaded — no request.
    expect(ready(result).activity!.map((e) => e.id)).toEqual([3, 2, 1]);
    expect(fetchCalls("/api/audit/mine")).toHaveLength(1);
  });

  // The API pages by cursor and only forwards, so a jump to page 4 has to walk
  // the pages in between. One request in flight at a time, in order.
  it("fetches the cursor pages a far page needs, in order, then shows it", async () => {
    auditPage = auditCursorPage;
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));

    act(() => ready(result).onPage(4));
    await waitFor(() =>
      expect(ready(result).activity!.map((e) => e.id)).toEqual([42, 41, 40, 39, 38, 37]),
    );
    expect(cursorsAsked()).toEqual([null, 55, 49, 43]);
    expect(ready(result).activityBusy).toBe(false);
  });

  // A feed that shrank under an invalidation must land on its new last page,
  // not on an empty slice past the end.
  it("clamps a page past the count", async () => {
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));
    act(() => ready(result).onPage(9));
    expect(ready(result).activityPage).toBe(2);
  });

  // The first load has nothing to show and no error either, so an empty slice
  // there would print "Nothing to show yet" about a journal nobody has asked
  // for yet. The section needs to hear "wait", not "none".
  it("waits on the first load rather than reporting an empty feed", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    auditPage = async () => {
      await held;
      return AUDIT_NINE;
    };
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(ready(result).activityBusy).toBe(true);
    expect(ready(result).activity).toEqual([]);

    await act(async () => {
      release?.();
      await held;
    });
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));
    expect(ready(result).activityBusy).toBe(false);
  });

  // Every mutation on this screen invalidates the feed, so a background
  // refetch runs with the rows still on screen. `isFetching` would disable the
  // pager under the reader's cursor for it; only a page actually on its way
  // waits, which is `isFetchingNextPage`.
  it("leaves the pager live while a refetch of the page on screen is in flight", async () => {
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));

    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    auditPage = async () => {
      await held;
      return AUDIT_NINE;
    };
    await act(async () => {
      void client.refetchQueries({ queryKey: ["audit", "mine"] });
    });
    await waitFor(() => expect(client.getQueryState(["audit", "mine"])?.fetchStatus).toBe("fetching"));
    expect(ready(result).activityBusy).toBe(false);
    expect(ready(result).activity).toHaveLength(6);

    await act(async () => {
      release?.();
      await held;
    });
  });

  // The frame between the click and the effect: the slice is already empty and
  // no request has started yet. Measured on the live page — it rendered "This
  // page could not be loaded." for one frame on every jump, which is the
  // stalled state lying about a page that was merely about to be fetched.
  it("never reports an empty page between the click and the request it triggers", async () => {
    auditPage = auditCursorPage;
    const frames: { busy: boolean; rows: number }[] = [];
    const { result } = renderHook(
      () => {
        const s = useAccount();
        if (s.phase === "ready") frames.push({ busy: s.activityBusy, rows: s.activity?.length ?? -1 });
        return s;
      },
      { wrapper },
    );
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));

    act(() => ready(result).onPage(4));
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));
    expect(frames.filter((f) => f.rows === 0 && !f.busy)).toEqual([]);
  });

  // Without a guard on the failed page, the effect sees the rows it still
  // needs, asks again, fails again — a loop against the gateway that nothing
  // on screen would show.
  it("stops asking after a page fetch fails", async () => {
    auditPage = (cursor) => {
      if (cursor !== null) throw new Error("page is down");
      return { entries: Array.from({ length: 6 }, (_, i) => auditEntry(60 - i)), nextCursor: 55, total: 24 };
    };
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));

    act(() => ready(result).onPage(4));
    await waitFor(() => expect(cursorsAsked().length).toBeGreaterThan(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cursorsAsked()).toEqual([null, 55]);
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

  // 400 is what the gateway really answers for a wrong code here — measured.
  it("leaves both caches alone and toasts the gateway's message when the disable is refused", async () => {
    const { result } = renderHook(() => ({ s: useAccount(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.phase).toBe("ready"));
    const ready = result.current.s;
    if (ready.phase !== "ready") throw new Error("unreachable");

    fetchMock.mockImplementationOnce(async () => json({ message: "invalid 2fa code" }, 400));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      await ready.onDisable2FA("000000").catch(() => {});
    });
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
    expect(keys).not.toContainEqual(["two-factor"]);
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("invalid 2fa code"));
  });

  // authhttp/audit.go journals the password change, and journals a refusal
  // too (result="failed") — which summaryOf then prints. Every mutation on
  // this screen therefore has to re-ask for the feed on both paths, or the
  // list three sections lower is missing the event the reader just caused.
  describe.each([
    ["a password change", (s: Ready) => s.onChangePassword("old-pass", "New1234!x")],
    ["a 2FA disable", (s: Ready) => s.onDisable2FA("123456")],
    ["a passkey removal", (s: Ready) => s.onRemovePasskey("p-1", { code: "123456" })],
  ])("%s", (_name, run) => {
    it("re-asks for the journal when it succeeds", async () => {
      const { result } = renderHook(() => useAccount(), { wrapper });
      await waitFor(() => expect(result.current.phase).toBe("ready"));
      const ready = result.current as Ready;

      const invalidate = vi.spyOn(client, "invalidateQueries");
      await act(async () => {
        await run(ready).catch(() => {});
      });
      const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
      expect(keys).toContainEqual(["audit", "mine"]);
    });

    it("re-asks for the journal when it is refused, because the refusal is journalled too", async () => {
      const { result } = renderHook(() => useAccount(), { wrapper });
      await waitFor(() => expect(result.current.phase).toBe("ready"));
      const ready = result.current as Ready;

      fetchMock.mockImplementationOnce(async () => json({ message: "refused" }, 400));
      const invalidate = vi.spyOn(client, "invalidateQueries");
      await act(async () => {
        await run(ready).catch(() => {});
      });
      const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
      expect(keys).toContainEqual(["audit", "mine"]);
    });
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
