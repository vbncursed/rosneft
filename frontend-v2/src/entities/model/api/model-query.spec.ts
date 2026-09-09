import { describe, expect, it, vi } from "vitest";

vi.mock("./models-gateway", () => ({ getModel: vi.fn(async () => ({ slug: "x" })) }));
const { modelQuery } = await import("./model-query");
const { getModel } = await import("./models-gateway");

describe("modelQuery", () => {
  it("keys on the slug and delegates to getModel", async () => {
    const q = modelQuery("x");
    expect(q.queryKey).toEqual(["model", "x"]);
    const run = q.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual({ slug: "x" });
    expect(getModel).toHaveBeenCalledWith("x");
  });
});
