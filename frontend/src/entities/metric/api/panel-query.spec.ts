import { describe, expect, it, vi } from "vitest";

vi.mock("./metrics-gateway", () => ({ fetchPanel: vi.fn(async () => [{ label: "a", points: [], labels: {} }]) }));
const { panelQuery } = await import("./panel-query");

describe("panelQuery", () => {
  it("keys by panel and range, polls every 30s in a visible tab, never trusts staleness", () => {
    const q = panelQuery("alerts", "15m");
    expect(q.queryKey).toEqual(["metrics", "alerts", "15m"]);
    expect(q.refetchInterval).toBe(30_000);
    expect(q.refetchIntervalInBackground).toBe(false);
    expect(q.staleTime).toBe(0);
  });

  it("delegates to the gateway", async () => {
    const run = panelQuery("red-rate", "1h").queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual([{ label: "a", points: [], labels: {} }]);
  });
});
