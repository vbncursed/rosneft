import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleSummaryQuery } from "./console-summary";

afterEach(() => vi.unstubAllGlobals());

describe("consoleSummaryQuery", () => {
  it("keys the summary once and never trusts it past the render that asked — the gateway says no-store", () => {
    expect(consoleSummaryQuery.queryKey).toEqual(["console-summary"]);
    expect(consoleSummaryQuery.staleTime).toBe(0);
  });

  it("reads GET /api/console/summary", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ access: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const run = consoleSummaryQuery.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual({ access: 3 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/console/summary");
  });
});
