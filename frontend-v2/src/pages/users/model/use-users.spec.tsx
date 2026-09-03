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
  it("freezes only after confirmation, then reports and refetches", async () => {
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
    // The list was invalidated: a second GET went out.
    await waitFor(() => expect(listCalls()).toBe(2));
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
});
