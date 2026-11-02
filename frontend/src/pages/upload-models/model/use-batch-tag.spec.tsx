import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBatchTag } from "./use-batch-tag";

const TAGS = [{ slug: "tanks", title: "Tanks" }];

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

afterEach(() => vi.unstubAllGlobals());

describe("useBatchTag", () => {
  it("hands over the list and starts with no tag chosen", () => {
    const { client, wrapper } = setup();
    client.setQueryData(["model-tags"], TAGS);
    const { result } = renderHook(() => useBatchTag(), { wrapper });
    expect(result.current).toMatchObject({ tags: TAGS, tagSlug: null, tagsError: null });
  });

  it("remembers the pick", () => {
    const { client, wrapper } = setup();
    client.setQueryData(["model-tags"], TAGS);
    const { result } = renderHook(() => useBatchTag(), { wrapper });
    act(() => result.current.onTag("tanks"));
    expect(result.current.tagSlug).toBe("tanks");
  });

  it("reports a list that never loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 500 }))),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useBatchTag(), { wrapper });
    await waitFor(() => expect(result.current.tagsError).toBe("Tags could not be loaded. Try again."));
    expect(result.current.tags).toBeUndefined();
  });
});
