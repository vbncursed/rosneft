import { describe, expect, it, vi } from "vitest";

vi.mock("./models-gateway", () => ({ listModels: vi.fn(async () => [{ slug: "m" }]) }));
const { modelsQuery } = await import("./models-query");

describe("modelsQuery", () => {
  it("keys the list and delegates to the gateway", async () => {
    expect(modelsQuery.queryKey).toEqual(["models"]);
    const run = modelsQuery.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual([{ slug: "m" }]);
  });
});
