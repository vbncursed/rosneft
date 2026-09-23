import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleNavItem } from "@/widgets/console-nav";
import { useConsoleCounters } from "./use-console-counters";

const ITEMS: ConsoleNavItem[] = [
  { key: "users", label: "Users", href: "/console/users" },
  { key: "roles", label: "Roles & Permissions", href: "/console/roles" },
  { key: "content", label: "Content", href: "/console/content" },
  { key: "access", label: "Territory access", href: "/console/access" },
  { key: "audit", label: "Audit journal", href: "/console/audit" },
  { key: "metrics", label: "Metrics", href: "/console/metrics" },
];
const SUMMARY = {
  users: { total: 2, frozen: 1 },
  roles: { roles: 2, permissions: 3 },
  content: { territories: 2, models: 1 },
  access: 2,
  audit24h: 1,
  alerts: 1,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const urls = () => fetchMock.mock.calls.map(([u]) => String(u));

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn(async (url: string) =>
    url === "/api/console/summary" ? json(SUMMARY) : json({ code: "not_found", message: "no" }, 404),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useConsoleCounters", () => {
  it("counts every open card off one summary call", async () => {
    const { result } = renderHook(() => useConsoleCounters(ITEMS), { wrapper });
    await waitFor(() =>
      expect(Object.values(result.current).every((h) => h.kind === "count")).toBe(true),
    );
    expect(result.current.users.text).toBe("2 users · 1 frozen");
    expect(result.current.roles.text).toBe("2 roles · 3 permissions");
    expect(result.current.content.text).toBe("2 territories · 1 model");
    expect(result.current.access.text).toBe("2 grants");
    expect(result.current.audit.text).toBe("1 event · 24h");
    expect(result.current.metrics.text).toBe("1 alert firing");
    expect(urls()).toEqual(["/api/console/summary"]);
  });

  it("answers a locked card's static line whatever the summary holds", async () => {
    const locked = ITEMS.map((i) =>
      i.key === "users" || i.key === "metrics" ? { ...i, disabled: true } : i,
    );
    const { result } = renderHook(() => useConsoleCounters(locked), { wrapper });
    await waitFor(() => expect(result.current.roles.kind).toBe("count"));
    expect(result.current.users).toEqual({ kind: "static", text: "people and roles" });
    expect(result.current.metrics).toEqual({ kind: "static", text: "conversion health and alerts" });
  });

  it("asks nothing when every card is locked", async () => {
    const { result } = renderHook(
      () => useConsoleCounters(ITEMS.map((i) => ({ ...i, disabled: true }))),
      { wrapper },
    );
    // A query fires its fetch after mount; asserting synchronously would pass
    // even with the gate gone. Let the effects and a macrotask run first.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(result.current.users).toEqual({ kind: "static", text: "people and roles" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is static while loading and unavailable when the summary never answered", async () => {
    fetchMock.mockImplementation(async () => json({ code: "internal", message: "down" }, 500));
    const { result } = renderHook(() => useConsoleCounters(ITEMS.slice(0, 1)), { wrapper });
    expect(result.current.users).toEqual({ kind: "static", text: "people and roles" });
    await waitFor(() =>
      expect(result.current.users).toEqual({ kind: "unavailable", text: "count unavailable" }),
    );
  });

  // A source that failed is null for its card only; a card the gateway left
  // out is one it would not answer for. Neither is a zero.
  it("reads a nulled or missing card as count unavailable and counts the rest", async () => {
    fetchMock.mockImplementation(async () => json({ ...SUMMARY, users: null, alerts: undefined }));
    const { result } = renderHook(() => useConsoleCounters(ITEMS), { wrapper });
    await waitFor(() => expect(result.current.roles.kind).toBe("count"));
    expect(result.current.users).toEqual({ kind: "unavailable", text: "count unavailable" });
    expect(result.current.metrics).toEqual({ kind: "unavailable", text: "count unavailable" });
  });

  it("reads zero grants as a count, not as not-yet", async () => {
    fetchMock.mockImplementation(async () => json({ access: 0 }));
    const { result } = renderHook(
      () => useConsoleCounters(ITEMS.filter((i) => i.key === "access")),
      { wrapper },
    );
    await waitFor(() => expect(result.current.access).toEqual({ kind: "count", text: "0 grants" }));
  });
});
