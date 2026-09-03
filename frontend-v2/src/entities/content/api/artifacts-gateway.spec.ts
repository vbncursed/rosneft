import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listArtifacts } from "./artifacts-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve(json([{ slug: "t", lod: 0, hash: "h", contentType: "model/gltf-binary", size: 300 }])),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("artifacts gateway", () => {
  it("asks the owner's route and keeps only lod and size", async () => {
    await expect(listArtifacts("territory", "t 1")).resolves.toEqual([{ lod: 0, size: 300 }]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/territories/t%201/artifacts");
    await listArtifacts("model", "m");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/models/m/artifacts");
  });
});
