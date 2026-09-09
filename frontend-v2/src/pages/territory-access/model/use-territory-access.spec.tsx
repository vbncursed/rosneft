import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useTerritoryAccess } from "./use-territory-access";

const ROOT = {
  id: "root",
  email: "root@x",
  username: "admin",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: true,
  onboardingToursSeen: [],
};
const USERS = [
  {
    id: "u-1",
    email: "a@x",
    username: "a.ivanova",
    status: "active",
    roleSlugs: ["editor"],
    roleTitles: { editor: "Editor" },
    permissions: [],
    isOwner: false,
    totpRequired: false,
  },
  {
    id: "u-2",
    email: "k@x",
    username: "k.petrov",
    status: "active",
    roleSlugs: ["guest"],
    roleTitles: { guest: "Guest" },
    permissions: [],
    isOwner: false,
    totpRequired: false,
  },
];
const T1 = { slug: "t-1", title: "T 1", sourceBlobHash: "a".repeat(64) };
const T2 = { slug: "t-2", title: "T 2", sourceBlobHash: "b".repeat(64) };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], ROOT);
  setCsrfToken("csrf");
  clearNotices();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/territories") return json([T1, T2]);
    if (url.startsWith("/api/auth/users")) return json(USERS);
    if (url === "/api/territories/t-1/admins" && method === "GET") return json({ userIds: ["u-1"] });
    if (url === "/api/territories/t-2/admins" && method === "GET") return json({ userIds: null });
    if (url === "/api/territories/t-1/admins" && method === "PUT")
      return new Response(null, { status: 204 });
    return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

const puts = () => fetchMock.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "PUT");

describe("useTerritoryAccess", () => {
  it("is loading until every admins query answered, then ready with rows and grants", async () => {
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.territories?.map((t) => [t.slug, t.visibility, t.peopleLabel])).toEqual([
      ["t-1", "assigned", "1 person"],
      ["t-2", "private", "owner only"],
    ]);
    expect(result.current.grantsOf("t-1").map((g) => g.username)).toEqual(["a.ivanova"]);
    expect(result.current.grantsOf("t-2")).toEqual([]);
    expect(result.current.canManage).toBe(true);
  });

  it("edits a draft per territory, keeps it across a switch, and cancels one", async () => {
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("t-1"));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.add("u-2"));
    expect(result.current.draft.map((g) => g.userId)).toEqual(["u-1", "u-2"]);
    expect(result.current.dirty).toBe(true);
    act(() => result.current.select("t-2"));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.select("t-1"));
    expect(result.current.draft.map((g) => g.userId)).toEqual(["u-1", "u-2"]);
    act(() => result.current.remove("u-1"));
    expect(result.current.draft.map((g) => g.userId)).toEqual(["u-2"]);
    act(() => result.current.cancel());
    expect(result.current.draft.map((g) => g.userId)).toEqual(["u-1"]);
    expect(result.current.dirty).toBe(false);
  });

  it("offers as candidates only self-keyed active accounts not in the draft", async () => {
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("t-1"));
    expect(result.current.candidates.map((c) => c.id)).toEqual(["u-2"]);
  });

  it("saves the whole draft with one PUT, toasts and refetches that territory only", async () => {
    const { result } = renderHook(() => ({ s: useTerritoryAccess(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("t-1"));
    act(() => result.current.s.add("u-2"));
    act(() => result.current.s.save());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Access saved"));
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(puts()[0][1].body as string)).toEqual({ userIds: ["u-1", "u-2"] });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([u, i]) => u === "/api/territories/t-1/admins" && !(i as RequestInit | undefined)?.method,
        ),
      ).toHaveLength(2),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([u, i]) => u === "/api/territories/t-2/admins" && !(i as RequestInit | undefined)?.method,
      ),
    ).toHaveLength(1);
  });

  it("keeps the saved draft on screen until the refetch lands", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const base = fetchMock.getMockImplementation() as (u: string, i?: RequestInit) => Promise<Response>;
    let refetches = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/territories/t-1/admins" && (init?.method ?? "GET") === "GET") {
        refetches += 1;
        if (refetches > 1) {
          await held;
          return json({ userIds: ["u-1", "u-2"] });
        }
      }
      return base(url, init);
    });

    const { result } = renderHook(() => ({ s: useTerritoryAccess(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("t-1"));
    act(() => result.current.s.add("u-2"));
    act(() => result.current.s.save());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Access saved"));
    // The refetch is still in flight: the panel must not fall back to the
    // pre-save set, or an edit made now would build on it and the next PUT
    // would drop the grant just saved.
    expect(result.current.s.draft.map((g) => g.userId)).toEqual(["u-1", "u-2"]);
    await act(async () => {
      release();
      await held;
    });
    await waitFor(() => expect(result.current.s.dirty).toBe(false));
    expect(result.current.s.draft.map((g) => g.userId)).toEqual(["u-1", "u-2"]);
  });

  it("does nothing on save when nothing changed", async () => {
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("t-1"));
    act(() => result.current.save());
    expect(puts()).toHaveLength(0);
  });

  it("reports a refused save with the gateway's sentence and keeps the draft", async () => {
    const { result } = renderHook(() => ({ s: useTerritoryAccess(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("t-2"));
    act(() => result.current.s.add("u-1"));
    act(() => result.current.s.save());
    await waitFor(() => expect(result.current.notices[0]?.tone).toBe("error"));
    expect(result.current.notices[0]?.message).toBe("You don't have permission to do this");
    expect(result.current.s.dirty).toBe(true);
  });

  it("is unavailable when the territories list is refused", async () => {
    fetchMock.mockImplementation(async () =>
      json({ code: "forbidden", message: "You don't have permission to do this" }, 403),
    );
    const { result } = renderHook(() => useTerritoryAccess(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("You don't have permission to do this");
  });
});
