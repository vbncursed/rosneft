import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSignOut } from "./use-sign-out";

const { logout, navigate, calls } = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    logout: vi.fn(async () => {
      calls.push("logout");
    }),
    navigate: vi.fn(async () => {
      calls.push("navigate");
    }),
  };
});
vi.mock("@/entities/user", () => ({ logout }));
// A stand-in for the router context: the hook is rendered on its own.
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

function setup() {
  const client = new QueryClient();
  client.setQueryData(["me"], { username: "previous" });
  const clear = client.clear.bind(client);
  vi.spyOn(client, "clear").mockImplementation(() => {
    calls.push("clear");
    clear();
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useSignOut(), { wrapper }) };
}

beforeEach(() => {
  calls.length = 0;
  logout.mockClear();
  navigate.mockClear();
});

describe("useSignOut", () => {
  // Clearing first left the still-mounted shell's `me` observer with no data:
  // it refetched, the gateway answered 401, and client.ts hard-reloaded to
  // /login?next=%2Flogin. Leave the page first; nothing observes the cache then.
  it("logs out, then goes to /login, then drops every cached query", async () => {
    const { client, result } = setup();
    await act(() => result.current.signOut());

    expect(calls).toEqual(["logout", "navigate", "clear"]);
    expect(navigate).toHaveBeenCalledWith({ to: "/login" });
    expect(client.getQueryData(["me"])).toBeUndefined();
  });

  it("is pending from the first call on", async () => {
    let finish = () => {};
    logout.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    const { result } = setup();
    expect(result.current.pending).toBe(false);

    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.signOut();
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      finish();
      await done;
    });
  });

  it("runs once however many times it is invoked", async () => {
    let finish = () => {};
    logout.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    const { result } = setup();

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.signOut();
      void result.current.signOut();
    });
    await act(async () => {
      finish();
      await first;
    });
    await act(() => result.current.signOut());

    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
  });
});
