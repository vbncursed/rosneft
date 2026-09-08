import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const user = (id: string, status = "active") => ({
  id,
  username: id,
  email: "",
  status,
  totpRequired: false,
  roleSlugs: [],
  roleTitles: {},
  isOwner: false,
});
const alertSeries = (instance: string) => ({
  label: "ConversionFailures",
  points: [],
  labels: {
    alertname: "ConversionFailures",
    alertstate: "firing",
    service: "mesh-worker",
    severity: "warning",
    instance,
  },
});
const event = (id: number) => ({
  id,
  at: new Date().toISOString(),
  actorId: "a",
  action: "x",
  entity: "y",
  result: "ok",
});

let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/auth/users"))
      return json([user("a"), user("b", "frozen"), user("c", "deleted")]);
    if (url === "/api/auth/roles")
      return json([
        { slug: "r1", title: "R1", isSystem: true, permissionSlugs: [] },
        { slug: "r2", title: "R2", isSystem: false, permissionSlugs: [] },
      ]);
    if (url === "/api/auth/permissions") return json([{ slug: "a:b" }, { slug: "c:d" }, { slug: "e:f" }]);
    if (url === "/api/territories")
      return json([
        { slug: "t1", title: "T1", sourceBlobHash: "x" },
        { slug: "t2", title: "T2", sourceBlobHash: "x" },
      ]);
    if (url === "/api/models") return json([{ slug: "m", title: "M", sourceBlobHash: "x" }]);
    if (url === "/api/territories/t1/admins") return json({ userIds: ["a", "b"] });
    if (url === "/api/territories/t2/admins") return json({ userIds: null });
    if (url.startsWith("/api/audit?")) return json({ entries: [event(1)], nextCursor: 0 });
    if (url.startsWith("/api/metrics/query?panel=alerts"))
      return json([alertSeries("i1"), alertSeries("i2")]);
    return json({ code: "not_found", message: "no" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useConsoleCounters", () => {
  it("counts every open card off its own query", async () => {
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
  });

  it("asks nothing for a locked card and answers its static line", async () => {
    const locked = ITEMS.map((i) =>
      i.key === "users" || i.key === "metrics" ? { ...i, disabled: true } : i,
    );
    const { result } = renderHook(() => useConsoleCounters(locked), { wrapper });
    await waitFor(() => expect(result.current.roles.kind).toBe("count"));
    expect(result.current.users).toEqual({ kind: "static", text: "people and roles" });
    expect(result.current.metrics).toEqual({
      kind: "static",
      text: "conversion health and alerts",
    });
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/auth/users"))).toBe(false);
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/metrics"))).toBe(false);
  });

  it("is static while loading and unavailable when an open query never answered", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/auth/users") ? json({ code: "internal", message: "down" }, 500) : json([]),
    );
    const { result } = renderHook(() => useConsoleCounters(ITEMS.slice(0, 1)), { wrapper });
    expect(result.current.users).toEqual({ kind: "static", text: "people and roles" });
    await waitFor(() =>
      expect(result.current.users).toEqual({ kind: "unavailable", text: "count unavailable" }),
    );
  });

  it("caps the audit count at the window limit", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/audit?")
        ? json({ entries: Array.from({ length: 200 }, (_, i) => event(i)), nextCursor: 0 })
        : json([]),
    );
    const { result } = renderHook(() => useConsoleCounters(ITEMS.filter((i) => i.key === "audit")), {
      wrapper,
    });
    await waitFor(() => expect(result.current.audit.text).toBe("200+ events · 24h"));
  });

  it("reads no grants at all, not an unavailable count, when there are no territories", async () => {
    fetchMock.mockImplementation(async () => json([]));
    const { result } = renderHook(
      () => useConsoleCounters(ITEMS.filter((i) => i.key === "access")),
      { wrapper },
    );
    await waitFor(() => expect(result.current.access).toEqual({ kind: "count", text: "0 grants" }));
  });
});
