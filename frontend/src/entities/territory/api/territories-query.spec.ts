import { describe, expect, it, vi } from "vitest";

vi.mock("./territories-gateway", () => ({ listTerritories: vi.fn(async () => [{ slug: "t" }]) }));
const { territoriesQuery } = await import("./territories-query");

describe("territoriesQuery", () => {
  it("keys the list and delegates to the gateway", async () => {
    expect(territoriesQuery.queryKey).toEqual(["territories"]);
    const run = territoriesQuery.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual([{ slug: "t" }]);
  });
});
