import { afterEach, describe, expect, it, vi } from "vitest";
import { modelTagsQuery } from "./model-tags-query";

afterEach(() => vi.unstubAllGlobals());

describe("modelTagsQuery", () => {
  it("keys the list and maps the gateway's answer, keeping its order", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            { slug: "tanks", title: "Tanks" },
            { slug: "ungrouped", title: "Ungrouped" },
          ]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const query = modelTagsQuery();
    expect(query.queryKey).toEqual(["model-tags"]);
    const run = query.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual([
      { slug: "tanks", title: "Tanks" },
      { slug: "ungrouped", title: "Ungrouped" },
    ]);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/model-tags");
  });
});
