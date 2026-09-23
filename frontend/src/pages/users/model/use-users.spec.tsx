import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useUsers } from "./use-users";

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
  permissions: ["users:read", "users:write"],
  isOwner: false,
  onboardingToursSeen: [],
};
const USER = {
  id: "u-1",
  email: "a@x",
  username: "a.ivanova",
  status: "active",
  roleSlugs: ["guest"],
  permissions: [],
  isOwner: false,
  totpRequired: false,
};
const ROLE = { slug: "guest", title: "Guest", isSystem: true, permissionSlugs: ["territory:read"] };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const LIST = "/api/auth/users?includeDeleted=true";

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  setCsrfToken("csrf");
  clearNotices();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/auth/users") && (init?.method ?? "GET") === "GET") return json([USER]);
    if (url === "/api/auth/roles") return json([ROLE]);
    if (url.endsWith("/freeze")) return json({ ...USER, status: "frozen" });
    if (url.endsWith("/unfreeze")) return json(USER);
    if (url.endsWith("/2fa/require")) return json({ ...USER, totpRequired: true });
    if (url.endsWith("/2fa/unrequire")) return json(USER);
    if (url.endsWith("/restore")) return json(USER);
    if (init?.method === "POST" && url === "/api/auth/users")
      return json({ ...USER, id: "u-2", username: "new.person" });
    if (init?.method === "PATCH") return json({ ...USER, roleSlugs: ["guest", "admin"] });
    return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

const listCalls = () =>
  fetchMock.mock.calls.filter(([u, i]) => u === LIST && !(i as RequestInit | undefined)?.method)
    .length;

describe("useUsers", () => {
  it("is loading, then ready with the people and roles", async () => {
    const { result } = renderHook(() => useUsers(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.users?.map((u) => u.username)).toEqual(["a.ivanova"]);
    expect(result.current.roles.map((r) => r.slug)).toEqual(["guest"]);
    expect(result.current.canManage).toBe(true);
  });

  it("keeps loading until the roles arrive — people with no roles yet are not people with no roles", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/roles") return new Promise<Response>(() => {});
      return json([USER]);
    });
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.users).not.toBeNull());
    expect(result.current.status).toBe("loading");
  });

  it("is unavailable when the roles cannot be read, in the gateway's words", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/roles")
        return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
      return json([USER]);
    });
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("You don't have permission to do this");
  });

  it("has no one selected and nothing pending until asked", async () => {
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.selected).toBeNull();
    expect(result.current.pending).toBeNull();
    // Nothing is selected, so there is nothing to ask about.
    act(() => result.current.ask("freeze"));
    expect(result.current.pending).toBeNull();
  });

  // The confirm dialog is the only route to a state change; nothing freezes
  // on a single click.
  it("freezes only after confirmation, then writes the answer into the list without a refetch", async () => {
    const { result } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));

    act(() => result.current.users.select("u-1"));
    act(() => result.current.users.ask("freeze"));
    expect(result.current.users.pending?.kind).toBe("freeze");
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/freeze"))).toBe(false);

    act(() => result.current.users.confirm());
    await waitFor(() => expect(result.current.users.pending).toBeNull());
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/freeze"))).toBe(true);
    expect(result.current.notices[0]?.message).toBe("Account frozen");
    expect(result.current.users.users?.[0].status).toBe("frozen");
    expect(listCalls()).toBe(1);
  });

  it("dismisses the question without acting on it", async () => {
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("u-1"));
    act(() => result.current.ask("delete"));
    act(() => result.current.dismiss());
    expect(result.current.pending).toBeNull();
    expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "DELETE")).toBe(
      false,
    );
  });

  it("names every outcome it can report", async () => {
    const { result } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));
    act(() => result.current.users.select("u-1"));

    for (const [kind, message] of [
      ["unfreeze", "Account unfrozen"],
      ["require-2fa", "2FA now required"],
      ["unrequire-2fa", "2FA no longer required"],
      ["restore", "Account restored"],
    ] as const) {
      act(() => result.current.users.ask(kind));
      act(() => result.current.users.confirm());
      await waitFor(() => expect(result.current.notices[0]?.message).toBe(message));
    }
  });

  it("creates a user, selects them and closes the dialog", async () => {
    const { result } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));
    act(() => result.current.users.setCreating(true));
    expect(result.current.users.creating).toBe(true);

    act(() =>
      result.current.users.create({
        email: "n@x",
        username: "new.person",
        password: "Passw0rd!",
        roleSlugs: [],
      }),
    );
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("User created"));
    expect(result.current.users.creating).toBe(false);
    expect(result.current.users.users?.map((u) => u.id)).toEqual(["u-1", "u-2"]);
    expect(result.current.users.selected?.id).toBe("u-2");
    expect(listCalls()).toBe(1);
  });

  // Whichever field collided, and whoever holds it, the admin reads one line:
  // naming the field would confirm an account they are not allowed to see.
  it("answers any taken email or username with one neutral line", async () => {
    for (const message of ["email already exists", "username already exists"]) {
      clearNotices();
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") return json({ code: "conflict", message }, 409);
        if (url === "/api/auth/roles") return json([ROLE]);
        return json([USER]);
      });
      const { result, unmount } = renderHook(
        () => ({ users: useUsers(), notices: useNotices() }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.users.status).toBe("ready"));
      act(() =>
        result.current.users.create({ email: "a@x", username: "a", password: "Passw0rd!", roleSlugs: [] }),
      );
      await waitFor(() => expect(result.current.notices[0]?.tone).toBe("error"));
      expect(result.current.notices[0].message).toBe("That email or username is unavailable.");
      unmount();
    }
  });

  it("stays busy while the account is being posted, so the dialog can lock its button", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url === "/api/auth/users")
        return new Promise<Response>((resolve) => (finish = resolve));
      if (url === "/api/auth/roles") return json([ROLE]);
      return json([USER]);
    });
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.createBusy).toBe(false);

    act(() =>
      result.current.create({
        email: "n@x",
        username: "new.person",
        password: "Passw0rd!",
        roleSlugs: [],
      }),
    );
    await waitFor(() => expect(result.current.createBusy).toBe(true));

    await act(async () => {
      finish(json({ ...USER, id: "u-2", username: "new.person" }));
    });
    await waitFor(() => expect(result.current.createBusy).toBe(false));
  });

  it("replaces the role set of whoever is open", async () => {
    const { result } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));
    act(() => result.current.users.setAddingRole(true));
    // Nobody is open, so there is nothing to change.
    act(() => result.current.users.setRoles(["guest", "admin"]));
    expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "PATCH")).toBe(
      false,
    );

    act(() => result.current.users.select("u-1"));
    act(() => result.current.users.setRoles(["guest", "admin"]));
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Roles updated"));
    expect(result.current.users.addingRole).toBe(false);
    const patch = fetchMock.mock.calls.find(
      ([, i]) => (i as RequestInit | undefined)?.method === "PATCH",
    );
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({
      roleSlugs: ["guest", "admin"],
    });
    expect(result.current.users.users?.[0].roleSlugs).toEqual(["guest", "admin"]);
    expect(listCalls()).toBe(1);
  });

  // The reader may have just changed their own roles; their nav gates read
  // /api/auth/me, which the client otherwise trusts for a minute.
  it("marks the reader's own grants stale after a role change", async () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));
    act(() => result.current.users.select("u-1"));
    act(() => result.current.users.setRoles(["guest", "admin"]));
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Roles updated"));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["me"] });
  });

  // A delete answers 204: there is no user to write, and what a deleted
  // account looks like is the gateway's to say.
  it("refetches the list after a delete", async () => {
    const base = fetchMock.getMockImplementation() as (u: string, i?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? new Response(null, { status: 204 }) : base(url, init),
    );
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("u-1"));
    act(() => result.current.ask("delete"));
    act(() => result.current.confirm());
    await waitFor(() => expect(listCalls()).toBe(2));
  });

  it("surfaces the gateway's refusal as an error notice", async () => {
    const { result } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));
    act(() => result.current.users.select("u-1"));
    act(() => result.current.users.ask("delete"));
    act(() => result.current.users.confirm());
    await waitFor(() => expect(result.current.notices[0]?.tone).toBe("error"));
    expect(result.current.notices[0].message).toBe("You don't have permission to do this");
  });

  it("is unavailable, not empty, when the list cannot be read", async () => {
    fetchMock.mockImplementation(async () => json({ code: "forbidden", message: "no" }, 403));
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("no");
    expect(result.current.users).toBeNull();
  });

  // The screen already holds the answer; a refetch that trips — the one a
  // delete fires — must not replace it with an outage page.
  it("stays ready when a refetch fails on top of people it already has", async () => {
    const { result, rerender } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    fetchMock.mockImplementation(async () => json({ code: "internal", message: "boom" }, 500));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["users"] });
    });
    // The refetch really did fail — the cache holds the error beside the data,
    // and the hook is re-rendered so it reads that state rather than a stale one.
    await waitFor(() => expect(client.getQueryState(["users"])?.status).toBe("error"));
    rerender();
    expect(result.current.status).toBe("ready");
    expect(result.current.users?.map((u) => u.username)).toEqual(["a.ivanova"]);
    expect(result.current.error).toBeNull();
  });

  // Loading wins over a refusal while anything is still in flight: the screen
  // says what it is doing once, rather than flashing an outage and then a list.
  it("keeps loading while the roles are outstanding, even after the list is refused", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/roles") return new Promise<Response>(() => {});
      return json({ code: "forbidden", message: "no people" }, 403);
    });
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["users"])?.error).not.toBeNull());
    expect(result.current.status).toBe("loading");
  });

  it("resets the open person's password, closes the dialog and says they were signed out", async () => {
    const answer = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "PUT" ? new Response(null, { status: 204 }) : answer(url, init),
    );
    const { result, unmount } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));
    act(() => result.current.users.select("u-1"));
    expect(result.current.users.canResetPassword).toBe(true);
    act(() => result.current.users.setResetting(true));

    act(() => result.current.users.resetPassword("N3w-Passw0rd!"));
    await waitFor(() =>
      expect(result.current.notices[0]?.message).toBe(
        "Password changed. The user was signed out everywhere.",
      ),
    );
    expect(result.current.users.resetting).toBe(false);
    const put = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "PUT");
    expect(put![0]).toBe("/api/auth/users/u-1/password");
    expect(JSON.parse(String((put![1] as RequestInit).body))).toEqual({ password: "N3w-Passw0rd!" });

    // The mutation's variables hold the new password in the clear; once the
    // screen is gone nothing may keep them for the default five minutes.
    unmount();
    const holdsPassword = () =>
      client.getMutationCache().getAll().some((m) => JSON.stringify(m.state.variables ?? null).includes("N3w-Passw0rd!"));
    await waitFor(() => expect(holdsPassword()).toBe(false));
  });

  it("offers the Company Owner role for assignment to Root alone", async () => {
    const answer = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url === "/api/auth/roles"
        ? json([{ ...ROLE, slug: "admin", title: "Company Owner" }, ROLE])
        : answer(url, init),
    );
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.roles.map((r) => r.slug)).toEqual(["admin", "guest"]);
    expect(result.current.assignableRoles.map((r) => r.slug)).toEqual(["guest"]);

    act(() => client.setQueryData(["me"], { ...PRINCIPAL, isOwner: true }));
    await waitFor(() =>
      expect(result.current.assignableRoles.map((r) => r.slug)).toEqual(["admin", "guest"]),
    );
  });
});
