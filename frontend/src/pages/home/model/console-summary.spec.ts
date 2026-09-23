import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleSummaryQuery } from "./console-summary";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Moscow: getTimezoneOffset() answers -180, the gateway wants minutes east.
const inMoscow = () => vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-180);

describe("consoleSummaryQuery", () => {
  it("keys the summary on the reader's zone and never trusts it past the render that asked — the gateway says no-store", () => {
    inMoscow();
    expect(consoleSummaryQuery().queryKey).toEqual(["console-summary", 180]);
    expect(consoleSummaryQuery().staleTime).toBe(0);
  });

  it("reads GET /api/console/summary with the zone in minutes east of UTC", async () => {
    inMoscow();
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ access: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const run = consoleSummaryQuery().queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual({ access: 3 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/console/summary?tzOffset=180");
  });

  // Unary minus gives a UTC reader -0, which keys apart from 0.
  it("sends 0 for a reader on UTC", () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(0);
    expect(consoleSummaryQuery().queryKey).toEqual(["console-summary", 0]);
  });
});
