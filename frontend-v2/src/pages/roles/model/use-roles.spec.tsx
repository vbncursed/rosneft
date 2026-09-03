import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useRoles } from "./use-roles";

const PRINCIPAL = {
  id: "me",
  email: "me@x",
  username: "me",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: ["admin"],
  roleTitles: { admin: "Company Owner" },
  permissions: ["roles:read", "roles:manage", "users:read", "users:write"],
  isOwner: false,
  onboardingToursSeen: [],
};

const OPS = {
  slug: "ops",
  title: "Operations",
  isSystem: false,
  permissionSlugs: ["users:read"],
  userCount: 1,
};
const GUEST = { slug: "guest", title: "Guest", isSystem: true, permissionSlugs: [], userCount: 0 };
const PERMISSIONS = [{ slug: "users:read" }, { slug: "users:write" }];
const USER = {
  id: "u-1",
  email: "a@x",
  username: "a.ivanova",
  status: "active",
  roleSlugs: ["ops"],
  isOwner: false,
  totpRequired: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let created: typeof OPS | null;
let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const seat = (principal: Partial<typeof PRINCIPAL> = {}) =>
  client.setQueryData(["me"], { ...PRINCIPAL, ...principal });

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seat();
  created = null;
  setCsrfToken("csrf");
  clearNotices();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/auth/roles" && method === "GET")
      return json(created ? [GUEST, OPS, created] : [GUEST, OPS]);
    if (url === "/api/auth/permissions") return json(PERMISSIONS);
    if (url.startsWith("/api/auth/users") && method === "GET") return json([USER]);
    if (method === "POST" && url === "/api/auth/roles") {
      created = { ...OPS, slug: "surveyor", title: "Surveyor", permissionSlugs: [] };
      return json(created);
    }
    if (method === "PUT") return json(OPS);
    if (method === "PATCH") return json({ ...OPS, title: "Field ops" });
    return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

const called = (predicate: (url: string, init?: RequestInit) => boolean) =>
  fetchMock.mock.calls.some(([u, i]) => predicate(String(u), i as RequestInit | undefined));

describe("useRoles", () => {
  it("is loading, then ready with the roles, permissions and people counts", async () => {
    const { result } = renderHook(() => useRoles(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.roles.map((r) => r.slug)).toEqual(["guest", "ops"]);
    expect(result.current.permissions.map((p) => p.slug)).toEqual(["users:read", "users:write"]);
    expect(result.current.users?.map((u) => u.username)).toEqual(["a.ivanova"]);
    expect(result.current.canManage).toBe(true);
    expect([...result.current.grantable]).toEqual(["users:read", "users:write"]);
  });

  it("is unavailable, in the gateway's words, when the roles cannot be read", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/roles") return json({ code: "forbidden", message: "no roles" }, 403);
      return json(PERMISSIONS);
    });
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("no roles");
  });

  // A count nobody asked for is not a count of zero.
  it("never asks for the people list without users:read, and leaves the counts unknown", async () => {
    seat({ permissions: ["roles:read", "roles:manage"] });
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(called((u) => u.startsWith("/api/auth/users"))).toBe(false);
    expect(result.current.users).toBeNull();
  });

  it("seeds a clean draft from the role that was selected", async () => {
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.draft).toBeNull();

    act(() => result.current.select("ops"));
    expect(result.current.selected?.slug).toBe("ops");
    expect(result.current.draft).toEqual({ title: "Operations", granted: ["users:read"] });
    expect(result.current.dirty).toBe(false);

    act(() => result.current.select(null));
    expect(result.current.draft).toBeNull();
  });

  // Switching cards to compare two sets is normal; losing the edits for it is
  // not. Each role keeps its own draft until it is saved or reset.
  it("keeps an unsaved draft while another role is looked at", async () => {
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.select("ops"));
    act(() => result.current.toggle("users:write"));
    act(() => result.current.rename("Field ops"));
    expect(result.current.dirty).toBe(true);

    act(() => result.current.select("guest"));
    expect(result.current.draft).toEqual({ title: "Guest", granted: [] });
    expect(result.current.dirty).toBe(false);

    act(() => result.current.select("ops"));
    expect(result.current.draft).toEqual({
      title: "Field ops",
      granted: ["users:read", "users:write"],
    });
    expect(result.current.dirty).toBe(true);
  });

  it("forgets a draft that was reset, not every draft there is", async () => {
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("guest"));
    act(() => result.current.rename("Visitor"));
    act(() => result.current.select("ops"));
    act(() => result.current.toggle("users:write"));

    act(() => result.current.reset());
    expect(result.current.dirty).toBe(false);
    act(() => result.current.select("guest"));
    expect(result.current.draft?.title).toBe("Visitor");
  });

  it("makes the draft dirty on a toggle and clean again on the second one", async () => {
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("ops"));

    act(() => result.current.toggle("users:write"));
    expect(result.current.draft?.granted).toEqual(["users:read", "users:write"]);
    expect(result.current.dirty).toBe(true);

    act(() => result.current.toggle("users:write"));
    expect(result.current.dirty).toBe(false);
  });

  it("restores the gateway's set on reset", async () => {
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("ops"));
    act(() => result.current.toggle("users:write"));
    act(() => result.current.rename("Field ops"));
    expect(result.current.dirty).toBe(true);

    act(() => result.current.reset());
    expect(result.current.draft).toEqual({ title: "Operations", granted: ["users:read"] });
    expect(result.current.dirty).toBe(false);
  });

  it("saves the permissions and the title in two calls, then says so", async () => {
    const { result } = renderHook(() => ({ roles: useRoles(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.roles.status).toBe("ready"));
    act(() => result.current.roles.select("ops"));
    act(() => result.current.roles.toggle("users:write"));
    act(() => result.current.roles.rename("Field ops"));

    act(() => result.current.roles.save());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Role saved"));

    const put = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "PUT");
    expect(String(put![0])).toBe("/api/auth/roles/ops/permissions");
    expect(JSON.parse(String((put![1] as RequestInit).body))).toEqual({
      permissionSlugs: ["users:read", "users:write"],
    });
    const patch = fetchMock.mock.calls.find(
      ([, i]) => (i as RequestInit | undefined)?.method === "PATCH",
    );
    expect(String(patch![0])).toBe("/api/auth/roles/ops");
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ title: "Field ops" });
  });

  // roleTitles ride along in /api/auth/users, so a rename that only invalidated
  // ["roles"] left the Users screen showing the old title until something else
  // happened to refetch the people.
  it("refreshes the people too, because a role's title is embedded in them", async () => {
    const { result } = renderHook(() => ({ roles: useRoles(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.roles.status).toBe("ready"));
    act(() => result.current.roles.select("ops"));
    act(() => result.current.roles.rename("Field ops"));

    const before = fetchMock.mock.calls.filter(
      ([u, i]) => String(u).startsWith("/api/auth/users") && !(i as RequestInit | undefined)?.method,
    ).length;
    act(() => result.current.roles.save());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Role saved"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([u, i]) =>
            String(u).startsWith("/api/auth/users") && !(i as RequestInit | undefined)?.method,
        ).length,
      ).toBeGreaterThan(before),
    );
  });

  it("sends nothing it did not change", async () => {
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("ops"));
    act(() => result.current.rename("Field ops"));

    act(() => result.current.save());
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(called((_, i) => i?.method === "PUT")).toBe(false);
    expect(called((_, i) => i?.method === "PATCH")).toBe(true);
  });

  // The edits survive a refusal: the draft is the inspector's truth until saved.
  it("names the refusal and keeps the draft when the save is turned down", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/auth/roles" && method === "GET") return json([GUEST, OPS]);
      if (url === "/api/auth/permissions") return json(PERMISSIONS);
      if (url.startsWith("/api/auth/users") && method === "GET") return json([USER]);
      return json({ code: "forbidden", message: "You can't grant users:write" }, 403);
    });
    const { result } = renderHook(() => ({ roles: useRoles(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.roles.status).toBe("ready"));
    act(() => result.current.roles.select("ops"));
    act(() => result.current.roles.toggle("users:write"));
    act(() => result.current.roles.save());

    await waitFor(() => expect(result.current.notices[0]?.tone).toBe("error"));
    expect(result.current.notices[0].message).toBe("You can't grant users:write");
    expect(result.current.roles.dirty).toBe(true);
    expect(result.current.roles.draft?.granted).toEqual(["users:read", "users:write"]);
  });

  it("stays busy while the save is in flight, so the inspector can lock its buttons", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "PUT") return new Promise<Response>((resolve) => (finish = resolve));
      if (url === "/api/auth/roles" && method === "GET") return json([GUEST, OPS]);
      if (url === "/api/auth/permissions") return json(PERMISSIONS);
      return json([USER]);
    });
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("ops"));
    act(() => result.current.toggle("users:write"));

    act(() => result.current.save());
    await waitFor(() => expect(result.current.saving).toBe(true));
    await act(async () => finish(json(OPS)));
    await waitFor(() => expect(result.current.saving).toBe(false));
  });

  it("creates a role, closes the dialog and opens the new one", async () => {
    const { result } = renderHook(() => ({ roles: useRoles(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.roles.status).toBe("ready"));
    act(() => result.current.roles.setCreating(true));
    expect(result.current.roles.creating).toBe(true);

    act(() => result.current.roles.create({ title: "Surveyor", permissionSlugs: [] }));
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Role created"));
    expect(result.current.roles.creating).toBe(false);
    expect(result.current.roles.draft).toEqual({ title: "Surveyor", granted: [] });
    const post = fetchMock.mock.calls.find(
      ([u, i]) => u === "/api/auth/roles" && (i as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      title: "Surveyor",
      permissionSlugs: [],
    });
  });

  it("locks Create while the role is being posted", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST") return new Promise<Response>((resolve) => (finish = resolve));
      if (url === "/api/auth/roles") return json([GUEST, OPS]);
      if (url === "/api/auth/permissions") return json(PERMISSIONS);
      return json([USER]);
    });
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.create({ title: "Surveyor", permissionSlugs: [] }));
    await waitFor(() => expect(result.current.creatingBusy).toBe(true));
    await act(async () => finish(json({ ...OPS, slug: "surveyor", title: "Surveyor" })));
    await waitFor(() => expect(result.current.creatingBusy).toBe(false));
  });

  it("holds a filter for the screen to narrow the list with", async () => {
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.setQuery("kind:custom"));
    expect(result.current.query).toBe("kind:custom");
  });

  // Nothing went out, so nothing may claim to have been saved.
  // The screen already holds the answer; a refetch that trips must not replace
  // it with an outage page.
  it("stays ready when a refetch fails on top of roles it already has", async () => {
    const { result, rerender } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    fetchMock.mockImplementation(async () => json({ code: "internal", message: "boom" }, 500));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["roles"] });
    });
    // The refetch really did fail — the cache holds the error beside the data,
    // and the hook is re-rendered so it reads that state rather than a stale one.
    await waitFor(() => expect(client.getQueryState(["roles"])?.status).toBe("error"));
    rerender();
    expect(result.current.status).toBe("ready");
    expect(result.current.roles.map((r) => r.slug)).toEqual(["guest", "ops"]);
    expect(result.current.error).toBeNull();
  });

  it("has nothing to save while nothing is selected, and says nothing either", async () => {
    const { result } = renderHook(() => ({ roles: useRoles(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.roles.status).toBe("ready"));
    act(() => result.current.roles.save());
    act(() => result.current.roles.reset());
    act(() => result.current.roles.toggle("users:write"));
    act(() => result.current.roles.rename("x"));
    await waitFor(() => expect(result.current.roles.saving).toBe(false));
    expect(called((_, i) => i?.method === "PUT" || i?.method === "PATCH")).toBe(false);
    expect(result.current.roles.draft).toBeNull();
    expect(result.current.notices).toEqual([]);
  });

  it("waits for the people list it did ask for rather than reporting no holders", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/auth/users")) return new Promise<Response>(() => {});
      if (url === "/api/auth/permissions") return json(PERMISSIONS);
      return json([GUEST, OPS]);
    });
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.roles.length).toBe(2));
    expect(result.current.status).toBe("loading");
  });

  it("is unavailable when the people list it asked for cannot be read", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/auth/users")) return json({ code: "forbidden", message: "no people" }, 403);
      if (url === "/api/auth/permissions") return json(PERMISSIONS);
      return json([GUEST, OPS]);
    });
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("no people");
  });
});
