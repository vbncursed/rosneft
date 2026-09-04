import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useAudit } from "./use-audit";

const { saveBlob } = vi.hoisted(() => ({ saveBlob: vi.fn() }));
vi.mock("@/shared/lib/download", () => ({ saveBlob }));

const PRINCIPAL = {
  id: "me",
  email: "me@x",
  username: "me",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: ["auditor"],
  roleTitles: { auditor: "Auditor" },
  permissions: ["audit:read"],
  isOwner: false,
  onboardingToursSeen: [],
};

const dto = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  at: "2026-09-01T09:14:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "c-1",
  companyLogin: "cotest",
  action: "territory.update",
  entity: "territory",
  entityId: "t-1",
  entityLabel: "refinery",
  territorySlug: "",
  oldRow: JSON.stringify({ title: "Old" }),
  newRow: JSON.stringify({ title: "New" }),
  result: "ok",
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
let csvStatus = 200;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const urls = () => fetchMock.mock.calls.map(([u]) => u as string);
const journalCalls = () => urls().filter((u) => u.startsWith("/api/audit?") && u.includes("limit=50"));
const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  setCsrfToken("csrf");
  clearNotices();
  saveBlob.mockReset();
  writeText.mockReset();
  writeText.mockImplementation(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  csvStatus = 200;
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/audit/actors") return json([{ id: "u-1", login: "a.ivanova" }]);
    if (url.startsWith("/api/audit.csv"))
      return csvStatus === 200
        ? new Response("at,actor\n", { status: 200, headers: { "Content-Type": "text/csv" } })
        : json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
    if (url.includes("limit=200")) return json({ entries: [dto(1)], nextCursor: 0 });
    if (url.includes("cursor=5")) return json({ entries: [dto(3)], nextCursor: 0 });
    return json({ entries: [dto(1), dto(2)], nextCursor: 5, refs: { "role_id:1": "Editor" } });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

describe("useAudit", () => {
  it("is loading, then ready with the flattened journal, merged refs, actors and the window", async () => {
    const { result } = renderHook(() => useAudit(), { wrapper });
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.entries.map((e) => e.id)).toEqual([1, 2]);
    expect(result.current.refs).toEqual({ "role_id:1": "Editor" });
    expect(result.current.actors).toHaveLength(1);
    expect(result.current.window?.entries).toHaveLength(1);
    expect(result.current.window?.capped).toBe(false);
    expect(result.current.live).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("loads older pages through nextCursor and stops following once it has", async () => {
    const { result } = renderHook(() => useAudit(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.loadOlder).toBeDefined();

    act(() => result.current.loadOlder?.());
    await waitFor(() => expect(result.current.entries.map((e) => e.id)).toEqual([1, 2, 3]));
    expect(result.current.loadOlder).toBeUndefined();
    expect(result.current.live).toBe(false);
    expect(result.current.loadingOlder).toBe(false);
  });

  it("resolves an actor login into the filter and refuses an unknown one without a request", async () => {
    const { result } = renderHook(() => useAudit(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.setQuery("actor:a.ivanova"));
    await waitFor(() => expect(journalCalls().some((u) => u.includes("actor=u-1"))).toBe(true));
    expect(result.current.filters).toEqual({ actor: "u-1" });

    const before = journalCalls().length;
    act(() => result.current.setQuery("actor:ghost"));
    await waitFor(() => expect(result.current.unknownActor).toBe("ghost"));
    expect(result.current.filters).toEqual({});
    expect(journalCalls()).toHaveLength(before);
    expect(result.current.status).toBe("ready");
  });

  it("sends a picked range as from/to and lets a typed token win", async () => {
    const { result } = renderHook(() => useAudit(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.setRange({ from: "2026-09-01", to: "" }));
    await waitFor(() =>
      expect(journalCalls().at(-1)).toContain("from=2026-09-01T00%3A00%3A00Z"),
    );
    expect(journalCalls().at(-1)).not.toContain("to=");

    act(() => result.current.setQuery("to:2026-09-02"));
    await waitFor(() => expect(journalCalls().at(-1)).toContain("to=2026-09-02T23%3A59%3A59Z"));
    expect(journalCalls().at(-1)).toContain("from=2026-09-01T00%3A00%3A00Z");

    act(() => result.current.setQuery("from:2026-08-20 to:2026-09-02"));
    await waitFor(() => expect(journalCalls().at(-1)).toContain("from=2026-08-20T00%3A00%3A00Z"));
  });

  it("selects an entry and exposes it", async () => {
    const { result } = renderHook(() => useAudit(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.selected).toBeNull();

    act(() => result.current.select(2));
    expect(result.current.selected?.id).toBe(2);

    act(() => result.current.select(null));
    expect(result.current.selected).toBeNull();
  });

  it("exports the current filters as CSV and toasts on refusal", async () => {
    const { result } = renderHook(() => ({ s: useAudit(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.setQuery("entity:territory"));

    act(() => result.current.s.exportCsv());
    await waitFor(() => expect(saveBlob).toHaveBeenCalledOnce());
    expect(urls().some((u) => u === "/api/audit.csv?entity=territory")).toBe(true);
    expect(saveBlob.mock.calls[0][1]).toBe("audit.csv");
    expect(result.current.s.exporting).toBe(false);

    csvStatus = 403;
    act(() => result.current.s.exportCsv());
    await waitFor(() =>
      expect(result.current.notices[0]?.message).toBe("You don't have permission to do this"),
    );
    expect(result.current.notices[0]?.tone).toBe("error");
    expect(saveBlob).toHaveBeenCalledOnce();
  });

  it("copies the selected entry as JSON", async () => {
    const { result } = renderHook(() => ({ s: useAudit(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));

    act(() => result.current.s.copyJson());
    expect(writeText).not.toHaveBeenCalled();

    act(() => result.current.s.select(1));
    act(() => result.current.s.copyJson());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Copied"));
    expect(JSON.parse(writeText.mock.calls[0][0])).toMatchObject({ id: 1 });

    clearNotices();
    writeText.mockRejectedValueOnce(new Error("denied"));
    act(() => result.current.s.copyJson());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Could not copy"));
  });

  it("is unavailable when the journal is refused", async () => {
    fetchMock.mockImplementation(async () =>
      json({ code: "forbidden", message: "You don't have permission to do this" }, 403),
    );
    const { result } = renderHook(() => useAudit(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("You don't have permission to do this");
  });

  it("stays ready when a follow refetch fails on top of a loaded page", async () => {
    const { result } = renderHook(() => useAudit(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    fetchMock.mockImplementation(async () => json({ code: "internal", message: "boom" }, 500));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["audit"] });
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.entries.map((e) => e.id)).toEqual([1, 2]);
  });
});
