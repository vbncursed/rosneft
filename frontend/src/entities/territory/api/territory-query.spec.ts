import { describe, expect, it, vi } from "vitest";

vi.mock("./territories-gateway", () => ({ getTerritory: vi.fn(async () => ({ slug: "x" })) }));
const { territoryQuery } = await import("./territory-query");
const { getTerritory } = await import("./territories-gateway");

describe("territoryQuery", () => {
  it("keys on the slug and delegates to getTerritory", async () => {
    const q = territoryQuery("x");
    expect(q.queryKey).toEqual(["territory", "x"]);
    const run = q.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual({ slug: "x" });
    expect(getTerritory).toHaveBeenCalledWith("x");
  });
});
