import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useZoneForm } from "./use-zone-form";

const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "pumps", title: "Pumps" },
  { slug: "cranes", title: "Cranes" },
  { slug: "pipes", title: "Pipes" },
  { slug: "tents", title: "Tents" },
  { slug: "cabins", title: "Cabins" },
  { slug: "ungrouped", title: "Ungrouped" },
];

const setup = (seed = true) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) client.setQueryData(["model-tags"], TAGS);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return wrapper;
};

const form = (
  over: { canPlace?: boolean; blocked?: string | null; onCreate?: () => Promise<void>; seed?: boolean } = {},
) => {
  const onCreate = over.onCreate ?? vi.fn(async () => {});
  const hook = renderHook(
    () => ({
      f: useZoneForm({ canPlace: over.canPlace ?? true, blocked: over.blocked ?? null, onCreate }),
      notices: useNotices(),
    }),
    { wrapper: setup(over.seed) },
  );
  return { ...hook, onCreate };
};

afterEach(() => {
  clearNotices();
  vi.unstubAllGlobals();
});

describe("useZoneForm", () => {
  it("refuses to create while the rectangle is blocked, and says why", () => {
    const { result } = form({ blocked: "This rectangle has no area." });
    act(() => result.current.f.setTitle("Tank row"));
    act(() => result.current.f.toggleTag("tanks"));
    expect(result.current.f.canCreate).toBe(false);
    expect(result.current.f.blocked).toBe("This rectangle has no area.");
  });

  it("offers every tag but ungrouped", () => {
    const { result } = form();
    expect(result.current.f.tags?.map((t) => t.slug)).toEqual(TAGS.slice(0, 6).map((t) => t.slug));
  });

  it("cannot create until a rectangle is placed, a title typed and a tag chosen", () => {
    const unplaced = form({ canPlace: false });
    act(() => unplaced.result.current.f.setTitle("Tank row"));
    act(() => unplaced.result.current.f.toggleTag("tanks"));
    expect(unplaced.result.current.f.canCreate).toBe(false);

    const { result } = form();
    expect(result.current.f.canCreate).toBe(false);
    act(() => result.current.f.setTitle("   "));
    act(() => result.current.f.toggleTag("tanks"));
    expect(result.current.f.canCreate).toBe(false);
    act(() => result.current.f.setTitle("Tank row"));
    expect(result.current.f.canCreate).toBe(true);
    act(() => result.current.f.toggleTag("tanks"));
    expect(result.current.f.canCreate).toBe(false);
  });

  it("takes at most five tags and says when the limit is reached", () => {
    const { result } = form();
    for (const t of TAGS.slice(0, 6)) act(() => result.current.f.toggleTag(t.slug));
    expect(result.current.f.selected).toEqual(["tanks", "pumps", "cranes", "pipes", "tents"]);
    expect(result.current.f.atLimit).toBe(true);
    act(() => result.current.f.toggleTag("tanks"));
    expect(result.current.f.atLimit).toBe(false);
  });

  it("sends the trimmed title and the tags, then empties the form", async () => {
    const { result, onCreate } = form();
    act(() => result.current.f.setTitle("  Tank row  "));
    act(() => result.current.f.toggleTag("tanks"));
    await act(() => result.current.f.submit());
    expect(onCreate).toHaveBeenCalledWith({ title: "Tank row", tagSlugs: ["tanks"] });
    expect(result.current.f.title).toBe("");
    expect(result.current.f.selected).toEqual([]);
  });

  it("shows the server's words for a title clash inline and keeps the form", async () => {
    const onCreate = vi.fn().mockRejectedValue(new HttpError(400, null, "a zone titled Tank row already exists"));
    const { result } = form({ onCreate });
    act(() => result.current.f.setTitle("Tank row"));
    act(() => result.current.f.toggleTag("tanks"));
    await act(() => result.current.f.submit());
    expect(result.current.f.error).toBe("a zone titled Tank row already exists");
    expect(result.current.f.title).toBe("Tank row");
    act(() => result.current.f.setTitle("Tank row 2"));
    expect(result.current.f.error).toBeNull();
  });

  it.each([
    [403, "forbidden"],
    [400, "unknown model tag"],
  ])("sends a %i (%s) to a notice, not under the Title field", async (status, message) => {
    const onCreate = vi.fn().mockRejectedValue(new HttpError(status, null, message));
    const { result } = form({ onCreate });
    act(() => result.current.f.setTitle("Tank row"));
    act(() => result.current.f.toggleTag("tanks"));
    await act(() => result.current.f.submit());
    expect(result.current.f.error).toBeNull();
    expect(result.current.notices[0]).toMatchObject({ tone: "error", message });
  });

  it("reports an outage as a notice, not as the title's error", async () => {
    const onCreate = vi.fn().mockRejectedValue(new HttpError(503, null, "internal"));
    const { result } = form({ onCreate });
    act(() => result.current.f.setTitle("Tank row"));
    act(() => result.current.f.toggleTag("tanks"));
    await act(() => result.current.f.submit());
    expect(result.current.f.error).toBeNull();
    expect(result.current.notices[0]).toMatchObject({ tone: "error" });
  });

  it("says so and refuses to create when the tags never loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 500 }))),
    );
    const { result } = form({ seed: false });
    await waitFor(() => expect(result.current.f.tagsError).toBe("Tags could not be loaded. Try again."));
    expect(result.current.f.tags).toBeUndefined();
    act(() => result.current.f.setTitle("Tank row"));
    expect(result.current.f.canCreate).toBe(false);
  });
});
