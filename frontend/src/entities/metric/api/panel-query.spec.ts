import { describe, expect, it, vi } from "vitest";
import { PANELS } from "../model/panel-catalog";

vi.mock("./metrics-gateway", () => ({ fetchPanels: vi.fn(async () => ({ alerts: [] })) }));
const { panelsQuery } = await import("./panel-query");
const { fetchPanels } = await import("./metrics-gateway");

describe("panelsQuery", () => {
  it("keys by range, polls every 30s in a visible tab, never trusts staleness", () => {
    const q = panelsQuery("15m");
    expect(q.queryKey).toEqual(["metrics", "15m"]);
    expect(q.refetchInterval).toBe(30_000);
    expect(q.refetchIntervalInBackground).toBe(false);
    expect(q.staleTime).toBe(0);
  });

  it("asks the gateway for every panel in the catalog at once", async () => {
    const run = panelsQuery("1h").queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual({ alerts: [] });
    expect(fetchPanels).toHaveBeenCalledWith(Object.keys(PANELS), "1h");
  });
});
