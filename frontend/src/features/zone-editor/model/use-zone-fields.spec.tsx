import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { MAX_ZONE_TAGS, useZoneFields } from "./use-zone-fields";

const TAGS = [
  { slug: "a", title: "A" },
  { slug: "b", title: "B" },
  { slug: "c", title: "C" },
  { slug: "d", title: "D" },
  { slug: "e", title: "E" },
  { slug: "f", title: "F" },
  { slug: "ungrouped", title: "Ungrouped" },
];

const fields = (initial = { title: "Row", tagSlugs: ["a"] }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["model-tags"], TAGS);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useZoneFields(initial), { wrapper });
};

describe("useZoneFields", () => {
  it("starts from the given values and never offers ungrouped", () => {
    const { result } = fields();
    expect(result.current.title).toBe("Row");
    expect(result.current.selected).toEqual(["a"]);
    expect(result.current.tags?.map((t) => t.slug)).not.toContain("ungrouped");
  });

  it("stops adding at the limit but still lets one go", () => {
    const { result } = fields({ title: "Row", tagSlugs: [] });
    for (const t of TAGS.slice(0, 6)) act(() => result.current.toggleTag(t.slug));
    expect(result.current.selected).toHaveLength(MAX_ZONE_TAGS);
    expect(result.current.atLimit).toBe(true);
    act(() => result.current.toggleTag("a"));
    expect(result.current.atLimit).toBe(false);
  });

  it("clears the error when the title changes, and reset restores the initial values", () => {
    const { result } = fields();
    act(() => result.current.setError("taken"));
    act(() => result.current.setTitle("  New "));
    expect(result.current.error).toBeNull();
    expect(result.current.trimmed).toBe("New");
    act(() => result.current.toggleTag("b"));
    act(() => result.current.reset());
    expect(result.current.title).toBe("Row");
    expect(result.current.selected).toEqual(["a"]);
  });
});
