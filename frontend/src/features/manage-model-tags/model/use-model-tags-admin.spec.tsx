import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useModelTagsAdmin } from "./use-model-tags-admin";

const TAGS = [
  { slug: "camps", title: "Camps" },
  { slug: "ungrouped", title: "Ungrouped" },
];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: Mock<(url: string, init?: RequestInit) => Promise<Response>>;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== "GET");

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn((url, init) => {
    if (init?.method === "POST") return Promise.resolve(json({ slug: "pads", title: "Pads" }, 201));
    if (init?.method === "PATCH") return Promise.resolve(json({ slug: "camps", title: "Camp sites" }));
    return Promise.resolve(json(url === "/api/model-tags" ? TAGS : []));
  });
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

// Keys a write must leave stale: the tag list, the model lists and every scene bundle.
const seed = () => {
  for (const key of [
    ["model-tags"],
    ["models"],
    ["model", "m-1"],
    ["scene", "t-1"],
    ["scene", "t-2"],
    ["territories"],
  ]) {
    client.setQueryData(key, []);
  }
};
// The tag list is on screen, so it re-reads at once instead of staying marked.
const tagListReads = () =>
  fetchMock.mock.calls.filter(([url, init]) => url === "/api/model-tags" && !init?.method).length;
const stale = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;

describe("useModelTagsAdmin", () => {
  it("lists the tags once loaded", async () => {
    const { result } = renderHook(() => useModelTagsAdmin(), { wrapper });
    expect(result.current.tags).toBeUndefined();
    await waitFor(() => expect(result.current.tags).toEqual(TAGS));
  });

  it("creates a tag, invalidates the tag list, model lists and every scene, and toasts", async () => {
    const { result } = renderHook(() => useModelTagsAdmin(), { wrapper });
    await waitFor(() => expect(result.current.tags).toBeDefined());
    seed();
    let outcome: string | null = "unset";
    await act(async () => {
      outcome = await result.current.create({ slug: "pads", title: " Pads " });
    });
    expect(outcome).toBeNull();
    expect(JSON.parse(writes()[0][1]!.body as string)).toEqual({ slug: "pads", title: "Pads" });
    for (const key of [["models"], ["model", "m-1"], ["scene", "t-1"], ["scene", "t-2"]]) {
      expect(stale(key), key.join("/")).toBe(true);
    }
    expect(stale(["territories"])).toBe(false);
    expect(tagListReads()).toBe(2);
    const { result: notices } = renderHook(() => useNotices());
    expect(notices.current.map((n) => n.message)).toContain("Tag added");
  });

  it("renames a tag and invalidates the same keys", async () => {
    const { result } = renderHook(() => useModelTagsAdmin(), { wrapper });
    await waitFor(() => expect(result.current.tags).toBeDefined());
    seed();
    let outcome: string | null = "unset";
    await act(async () => {
      outcome = await result.current.rename("camps", " Camp sites ");
    });
    expect(outcome).toBeNull();
    expect(writes()[0][0]).toBe("/api/model-tags/camps");
    expect(JSON.parse(writes()[0][1]!.body as string)).toEqual({ title: "Camp sites" });
    expect(stale(["scene", "t-2"])).toBe(true);
    expect(tagListReads()).toBe(2);
  });

  it("returns the server's refusal and invalidates nothing", async () => {
    const { result } = renderHook(() => useModelTagsAdmin(), { wrapper });
    await waitFor(() => expect(result.current.tags).toBeDefined());
    seed();
    fetchMock.mockResolvedValueOnce(
      json(
        { code: "invalid_input", message: "invalid input: a model tag with this slug or title already exists" },
        400,
      ),
    );
    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.create({ slug: "camps", title: "Camps" });
    });
    expect(outcome).toBe("invalid input: a model tag with this slug or title already exists");
    expect(stale(["scene", "t-1"])).toBe(false);
    expect(tagListReads()).toBe(1);
  });
});
