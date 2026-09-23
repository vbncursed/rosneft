import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { useHome } from "./use-home";

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
  permissions: ["territory:write"],
  isOwner: false,
  onboardingToursSeen: [],
};

// t5 is the newest; t3 carries no date at all, so it sorts last and never
// makes the four shown cards.
const TERRITORIES = [1, 2, 3, 4, 5].map((n) => ({
  slug: `t${n}`,
  title: `T${n}`,
  sourceBlobHash: String(n).repeat(64),
  placementCount: 0,
  lods: n === 5 ? [{ lod: 0, hash: "h", size: 1024 }] : [],
  ...(n === 3 ? {} : { updatedAt: `2026-09-0${n}T00:00:00Z` }),
}));
const MODEL = { slug: "m", title: "M", sourceBlobHash: "m".repeat(64), usageCount: 0 };
const ENTRIES = [1, 2, 3, 4, 5, 6].map((id) => ({
  id,
  at: "2026-09-08T10:00:00Z",
  actorId: "me",
  action: "territory.update",
  entity: "territory",
  result: "ok",
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
let JOBS: unknown[] = [];

/** The default routing, named so an override can fall through to it. */
const ROUTER = async (url: string): Promise<Response> => {
  if (url === "/api/territories") return json(TERRITORIES);
  if (url === "/api/models") return json([MODEL]);
  if (url === "/api/jobs") return json(JOBS);
  if (url.startsWith("/api/audit/mine")) return json({ entries: ENTRIES, nextCursor: 0 });
  return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  setCsrfToken("csrf");
  JOBS = [];
  fetchMock = vi.fn(ROUTER);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useHome", () => {
  it("is loading until territories, models and jobs answered, then ready", async () => {
    const { result } = renderHook(() => useHome(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.territories.cards.map((c) => c.slug)).toEqual(["t5", "t4", "t2", "t1"]);
    expect(result.current.territories.total).toBe(5);
    expect(result.current.territories.meta).toBe("showing 4 of 5");
    expect(result.current.territories.cards[0].status).toBe("ready");
    expect(result.current.territories.cards[0].chips).toEqual([]);
    // The LODs ride on the list: no card asks for its own.
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/artifacts"))).toBe(false);
  });

  it("slices the feed to four rows and names the signed-in reader", async () => {
    const { result } = renderHook(() => useHome(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(result.current.activityLoading).toBe(false));
    expect(result.current.activity).toHaveLength(4);
    expect(result.current.viewer).toEqual({ username: "me", roleTitle: "Editor" });
    expect(result.current.meta).toBe("5 territories · 1 model · nothing converting");
  });

  it("reads a 403 on the feed as null, not as an empty history, and stays ready", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/audit/mine")
        ? json({ code: "forbidden", message: "no" }, 403)
        : ROUTER(url),
    );
    const { result } = renderHook(() => useHome(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(result.current.activityLoading).toBe(false));
    expect(result.current.activity).toBeNull();
  });

  it("folds the jobs into cards, the meta line and the territory status", async () => {
    JOBS = [
      { id: "j1", kind: "territory", slug: "t5", status: "running", progress: 0.58, stage: "lod-1" },
      { id: "j2", kind: "model", slug: "m", status: "failed", errorMessage: "" },
    ];
    const { result } = renderHook(() => useHome(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.jobs.map((j) => [j.status, j.slug, j.title])).toEqual([
      ["converting", "t5", "T5"],
      ["failed", "m", "M"],
    ]);
    expect(result.current.jobsMeta).toBe("2 jobs · updates by itself");
    expect(result.current.meta).toBe("5 territories · 1 model · 1 converting · 1 failed");
    expect(result.current.territories.cards[0].status).toBe("converting");
    expect(result.current.models.cards[0].trailing.label).toBe("unavailable");
  });

  it("is the viewer-empty page with nothing assigned and no upload right", async () => {
    client.setQueryData(["me"], { ...PRINCIPAL, permissions: ["territory:read"] });
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/territories" ? json([]) : ROUTER(url),
    );
    const { result } = renderHook(() => useHome(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.territories.viewerEmpty).toBe(true);
    expect(result.current.territories.meta).toBe("assigned to you");
    expect(result.current.models.shown).toBe(false);
    expect(result.current.meta).toBe("0 territories assigned · read-only access");
  });

  it("is viewer-empty for a territory writer who may not create one", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/territories" ? json([]) : ROUTER(url),
    );
    const { result } = renderHook(() => useHome(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.territories.viewerEmpty).toBe(true);
  });

  it("is not viewer-empty for Root, who may create a territory", async () => {
    client.setQueryData(["me"], { ...PRINCIPAL, permissions: [], isOwner: true });
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/territories" ? json([]) : ROUTER(url),
    );
    const { result } = renderHook(() => useHome(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.territories.viewerEmpty).toBe(false);
  });

  it("is unavailable only when a core list never answered", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/models" ? json({ code: "internal", message: "down" }, 500) : ROUTER(url),
    );
    const { result } = renderHook(() => useHome(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("down");
  });

  it("re-reads the territory list once a shown territory's job leaves the live set", async () => {
    JOBS = [
      { id: "j1", kind: "territory", slug: "t5", status: "running", progress: 0.5, stage: "parsing" },
    ];
    let listCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/territories") {
        listCalls += 1;
        return json(listCalls === 1 ? TERRITORIES.map((t) => ({ ...t, lods: [] })) : TERRITORIES);
      }
      return ROUTER(url);
    });
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useHome(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.territories.cards[0]).toMatchObject({ slug: "t5", status: "converting" });
    expect(listCalls).toBe(1);

    JOBS = [];
    await act(async () => {
      await client.refetchQueries({ queryKey: ["jobs"] });
    });
    await waitFor(() => expect(listCalls).toBe(2));
    await waitFor(() =>
      expect(result.current.territories.cards[0]).toMatchObject({ slug: "t5", status: "ready" }),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["artifacts", "territory", "t5"] });
  });
});
