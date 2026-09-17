import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useModelLibrary } from "./use-model-library";

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
  permissions: ["model:write", "model:delete"],
  isOwner: false,
  onboardingToursSeen: [],
};
const M1 = { slug: "m-1", title: "M 1", sourceBlobHash: "a".repeat(64), usageCount: 6 };
const M2 = { slug: "m-2", title: "M 2", sourceBlobHash: "b".repeat(64), usageCount: 0 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
let JOBS: unknown[] = [];
let M1_ARTIFACTS: unknown[] = [{ slug: "m-1", lod: 0, hash: "h", contentType: "x", size: 1024 }];
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  setCsrfToken("csrf");
  clearNotices();
  JOBS = [];
  M1_ARTIFACTS = [{ slug: "m-1", lod: 0, hash: "h", contentType: "x", size: 1024 }];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/models" && method === "GET") return json([M1, M2]);
    if (url === "/api/jobs" && method === "GET") return json(JOBS);
    if (url === "/api/models/m-1/artifacts") return json(M1_ARTIFACTS);
    if (url === "/api/models/m-2/artifacts") return json([]);
    if (url === "/api/models/m-1" && method === "DELETE") return new Response(null, { status: 204 });
    if (url === "/api/models/m-2" && method === "DELETE")
      return json({ code: "invalid_input", message: "Model is still placed." }, 400);
    return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

describe("useModelLibrary", () => {
  it("is loading until every artifacts query answered, then ready with cards", async () => {
    const { result } = renderHook(() => useModelLibrary(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.cards?.map((c) => [c.slug, c.status])).toEqual([
      ["m-1", "ready"],
      ["m-2", "pending"],
    ]);
  });

  it("knows the viewer's grants", async () => {
    const { result } = renderHook(() => useModelLibrary(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.canUpload).toBe(true);
    expect(result.current.canDelete).toBe(true);
  });

  it("starts on the all tab with an empty query", async () => {
    const { result } = renderHook(() => useModelLibrary(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.tab).toBe("all");
    expect(result.current.query).toBe("");
    act(() => result.current.setTab("inUse"));
    expect(result.current.tab).toBe("inUse");
    act(() => result.current.setQuery("used:0"));
    expect(result.current.query).toBe("used:0");
  });

  it("deletes only after confirm, toasts, invalidates the list and clears pending", async () => {
    const { result } = renderHook(() => ({ s: useModelLibrary(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.ask("m-1"));
    expect(result.current.s.pending?.slug).toBe("m-1");
    expect(
      fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "DELETE"),
    ).toBe(false);
    act(() => result.current.s.confirm());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Model deleted"));
    expect(result.current.s.pending).toBeNull();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([u, i]) => u === "/api/models" && !(i as RequestInit | undefined)?.method,
        ).length,
      ).toBe(2),
    );
  });

  it("reports the gateway's refusal and keeps the card", async () => {
    const { result } = renderHook(() => ({ s: useModelLibrary(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.ask("m-2"));
    act(() => result.current.s.confirm());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Model is still placed."));
    expect(result.current.notices[0]?.tone).toBe("error");
    expect(result.current.s.pending).toBeNull();
    expect(result.current.s.cards?.some((c) => c.slug === "m-2")).toBe(true);
  });

  it("is unavailable when the list is refused, with the gateway's sentence", async () => {
    fetchMock.mockImplementation(async () =>
      json({ code: "forbidden", message: "You don't have permission to do this" }, 403),
    );
    const { result } = renderHook(() => useModelLibrary(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("You don't have permission to do this");
  });

  it("folds the live job into the row", async () => {
    JOBS = [{ id: "j1", kind: "model", slug: "m-1", status: "running", progress: 0.4, stage: "encoding" }];
    const { result } = renderHook(() => useModelLibrary(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.cards?.[0]).toMatchObject({ slug: "m-1", status: "converting" });
  });

  it("stays ready when a refetch fails on top of rows it already has", async () => {
    const { result } = renderHook(() => useModelLibrary(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    fetchMock.mockImplementation(async () => json({ code: "internal", message: "boom" }, 500));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["models"] });
    });
    expect(result.current.status).toBe("ready");
  });

  it("re-reads a row's artifacts once its job leaves the live set, so the card catches up to ready", async () => {
    // Nothing usable yet while the worker is still running.
    M1_ARTIFACTS = [];
    JOBS = [{ id: "j1", kind: "model", slug: "m-1", status: "running", progress: 0.4, stage: "encoding" }];
    const { result } = renderHook(() => useModelLibrary(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.cards?.[0]).toMatchObject({ slug: "m-1", status: "converting" });

    // The worker finishes and the gateway now serves the LOD0 artifact, but
    // the client's cached artifacts query for m-1 is still the stale empty
    // array — nothing refetches it on its own.
    M1_ARTIFACTS = [{ slug: "m-1", lod: 0, hash: "h", contentType: "x", size: 1024 }];
    JOBS = [];
    await act(async () => {
      await client.refetchQueries({ queryKey: ["jobs"] });
    });
    await waitFor(() =>
      expect(result.current.cards?.[0]).toMatchObject({ slug: "m-1", status: "ready" }),
    );
  });
});
