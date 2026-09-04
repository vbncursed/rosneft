import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useContent } from "./use-content";

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
  permissions: ["territory:write", "territory:delete", "model:write"],
  isOwner: false,
  onboardingToursSeen: [],
};
const TERRITORY = {
  slug: "t-1",
  title: "T 1",
  sourceBlobHash: "a".repeat(64),
  updatedAt: "2026-08-31T00:00:00Z",
};
const MODEL = { slug: "m-1", title: "M 1", sourceBlobHash: "b".repeat(64) };
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
    if (url === "/api/territories" && method === "GET") return json([TERRITORY]);
    if (url === "/api/models" && method === "GET") return json([MODEL]);
    if (url === "/api/jobs" && method === "GET") return json(JOBS);
    if (url === "/api/territories/t-1/artifacts")
      return json([{ slug: "t-1", lod: 0, hash: "h", contentType: "x", size: 1024 }]);
    if (url === "/api/models/m-1/artifacts") return json([]);
    if (url === "/api/territories/t-1" && method === "DELETE")
      return new Response(null, { status: 204 });
    if (url === "/api/models/m-1" && method === "DELETE")
      return json({ code: "invalid_input", message: "Model is placed in 2 territories." }, 400);
    return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

describe("useContent", () => {
  it("is loading until every artifacts query answered, then ready with rows and storage", async () => {
    const { result } = renderHook(() => useContent(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items?.map((i) => [i.slug, i.status, i.size])).toEqual([
      ["t-1", "ready", "1 KB"],
      ["m-1", "pending", "—"],
    ]);
    expect(result.current.storageBytes).toBe(1024);
    expect(result.current.canManage).toBe(true);
  });

  it("knows which kinds the viewer may delete", async () => {
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.canDelete("territory")).toBe(true);
    expect(result.current.canDelete("model")).toBe(false);
  });

  it("selects a row and hands the inspector its artifacts and date", async () => {
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("territory", "t-1"));
    expect(result.current.selected?.slug).toBe("t-1");
    expect(result.current.artifactsOf("territory", "t-1")).toEqual([{ lod: 0, size: 1024 }]);
    expect(result.current.updatedAtOf("territory", "t-1")).toBe("2026-08-31T00:00:00Z");
  });

  it("deletes only after confirm, toasts, refetches the list and clears the selection", async () => {
    const { result } = renderHook(() => ({ s: useContent(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("territory", "t-1"));
    act(() => result.current.s.ask());
    expect(result.current.s.pending?.slug).toBe("t-1");
    expect(
      fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "DELETE"),
    ).toBe(false);
    act(() => result.current.s.confirm());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Territory deleted"));
    expect(result.current.s.selected).toBeNull();
    expect(result.current.s.pending).toBeNull();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([u, i]) => u === "/api/territories" && !(i as RequestInit | undefined)?.method,
        ).length,
      ).toBe(2),
    );
  });

  it("reports the gateway's refusal when a model is still placed", async () => {
    const { result } = renderHook(() => ({ s: useContent(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("model", "m-1"));
    act(() => result.current.s.ask());
    act(() => result.current.s.confirm());
    await waitFor(() =>
      expect(result.current.notices[0]?.message).toBe("Model is placed in 2 territories."),
    );
    expect(result.current.notices[0]?.tone).toBe("error");
  });

  it("is unavailable when the list is refused, with the gateway's sentence", async () => {
    fetchMock.mockImplementation(async () =>
      json({ code: "forbidden", message: "You don't have permission to do this" }, 403),
    );
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("You don't have permission to do this");
  });

  it("folds the live job into the row and exposes it for the inspector", async () => {
    JOBS = [
      { id: "j1", kind: "territory", slug: "t-1", status: "running", progress: 0.4, stage: "parsing" },
    ];
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items?.[0]).toMatchObject({
      slug: "t-1",
      status: "converting",
      progress: 40,
      stage: "parsing",
    });
    expect(result.current.jobOf("territory", "t-1")?.stage).toBe("parsing");
  });

  it("is unavailable when the jobs list is refused", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/jobs" ? json({ code: "internal", message: "mesh is down" }, 500) : json([]),
    );
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("mesh is down");
  });

  it("re-reads a row's artifacts once its job stops being live", async () => {
    JOBS = [{ id: "j1", kind: "territory", slug: "t-1", status: "running" }];
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const before = fetchMock.mock.calls.filter(
      ([u]) => u === "/api/territories/t-1/artifacts",
    ).length;
    JOBS = [];
    await act(async () => {
      await client.refetchQueries({ queryKey: ["jobs"] });
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([u]) => u === "/api/territories/t-1/artifacts").length,
      ).toBe(before + 1),
    );
  });

  it("stays ready when a refetch fails on top of rows it already has", async () => {
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    fetchMock.mockImplementation(async () => json({ code: "internal", message: "boom" }, 500));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["territories"] });
    });
    expect(result.current.status).toBe("ready");
  });
});
