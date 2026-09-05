import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useTerritoryCatalog } from "./use-territory-catalog";

const PRINCIPAL = {
  id: "me",
  email: "me@x",
  username: "me",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: ["editor"],
  roleTitles: { editor: "Editor" },
  permissions: ["territory:write", "territory:delete"],
  isOwner: false,
  onboardingToursSeen: [],
};
const T1 = { slug: "t-1", title: "T 1", sourceBlobHash: "a".repeat(64), placementCount: 3 };
const T2 = { slug: "t-2", title: "T 2", sourceBlobHash: "b".repeat(64), placementCount: 0 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
let JOBS: unknown[] = [];
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  setCsrfToken("csrf");
  clearNotices();
  JOBS = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/territories" && method === "GET") return json([T1, T2]);
    if (url === "/api/jobs" && method === "GET") return json(JOBS);
    if (url === "/api/territories/t-1/artifacts")
      return json([{ slug: "t-1", lod: 0, hash: "h", contentType: "x", size: 1024 }]);
    if (url === "/api/territories/t-2/artifacts") return json([]);
    if (url === "/api/territories/t-1" && method === "DELETE")
      return new Response(null, { status: 204 });
    if (url === "/api/territories/t-2" && method === "DELETE")
      return json({ code: "invalid_input", message: "Territory has dependent placements." }, 400);
    return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

describe("useTerritoryCatalog", () => {
  it("is loading until every artifacts query answered, then ready with cards", async () => {
    const { result } = renderHook(() => useTerritoryCatalog(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.cards?.map((c) => [c.slug, c.status])).toEqual([
      ["t-1", "ready"],
      ["t-2", "pending"],
    ]);
  });

  it("knows the viewer's grants", async () => {
    const { result } = renderHook(() => useTerritoryCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.canUpload).toBe(true);
    expect(result.current.canDelete).toBe(true);
    expect(result.current.canReplace).toBe(true);
  });

  it("starts on the all tab with an empty query", async () => {
    const { result } = renderHook(() => useTerritoryCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.tab).toBe("all");
    expect(result.current.query).toBe("");
    act(() => result.current.setTab("ready"));
    expect(result.current.tab).toBe("ready");
    act(() => result.current.setQuery("state:ready"));
    expect(result.current.query).toBe("state:ready");
  });

  it("deletes only after confirm, toasts, invalidates the list and clears pending", async () => {
    const { result } = renderHook(() => ({ s: useTerritoryCatalog(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.ask("t-1"));
    expect(result.current.s.pending?.slug).toBe("t-1");
    expect(
      fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "DELETE"),
    ).toBe(false);
    act(() => result.current.s.confirm());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Territory deleted"));
    expect(result.current.s.pending).toBeNull();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([u, i]) => u === "/api/territories" && !(i as RequestInit | undefined)?.method,
        ).length,
      ).toBe(2),
    );
  });

  it("reports the gateway's refusal and keeps the card", async () => {
    const { result } = renderHook(() => ({ s: useTerritoryCatalog(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.ask("t-2"));
    act(() => result.current.s.confirm());
    await waitFor(() =>
      expect(result.current.notices[0]?.message).toBe("Territory has dependent placements."),
    );
    expect(result.current.notices[0]?.tone).toBe("error");
    expect(result.current.s.pending).toBeNull();
    expect(result.current.s.cards?.some((c) => c.slug === "t-2")).toBe(true);
  });

  it("is unavailable when the list is refused, with the gateway's sentence", async () => {
    fetchMock.mockImplementation(async () =>
      json({ code: "forbidden", message: "You don't have permission to do this" }, 403),
    );
    const { result } = renderHook(() => useTerritoryCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("You don't have permission to do this");
  });

  it("folds the live job into the row", async () => {
    JOBS = [
      { id: "j1", kind: "territory", slug: "t-1", status: "running", progress: 0.4, stage: "parsing" },
    ];
    const { result } = renderHook(() => useTerritoryCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.cards?.[0]).toMatchObject({ slug: "t-1", status: "converting" });
  });

  it("is unavailable when the jobs list is refused", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/jobs" ? json({ code: "internal", message: "mesh is down" }, 500) : json([]),
    );
    const { result } = renderHook(() => useTerritoryCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("mesh is down");
  });

  it("stays ready when a refetch fails on top of rows it already has", async () => {
    const { result } = renderHook(() => useTerritoryCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    fetchMock.mockImplementation(async () => json({ code: "internal", message: "boom" }, 500));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["territories"] });
    });
    expect(result.current.status).toBe("ready");
  });
});
