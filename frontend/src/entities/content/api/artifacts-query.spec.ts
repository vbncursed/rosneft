import { describe, expect, it, vi } from "vitest";

vi.mock("./artifacts-gateway", () => ({ listArtifacts: vi.fn(async () => [{ lod: 0, size: 1 }]) }));
const { artifactsQuery } = await import("./artifacts-query");
const { listArtifacts } = await import("./artifacts-gateway");

describe("artifactsQuery", () => {
  it("keys on kind and slug and delegates", async () => {
    const q = artifactsQuery("model", "m-1");
    expect(q.queryKey).toEqual(["artifacts", "model", "m-1"]);
    const run = q.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual([{ lod: 0, size: 1 }]);
    expect(listArtifacts).toHaveBeenCalledWith("model", "m-1");
  });
});
