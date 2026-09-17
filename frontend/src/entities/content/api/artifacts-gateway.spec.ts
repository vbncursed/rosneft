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
  it("asks the owner's route and maps every field the pages read", async () => {
    fetchMock.mockResolvedValueOnce(
      json([{ slug: "t", lod: 0, hash: "h", contentType: "model/gltf-binary", size: 300, vertices: 12, faces: 4,
              bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1, y: 2, z: 3 } }]),
    );
    await expect(listArtifacts("territory", "t 1")).resolves.toEqual([
      { lod: 0, hash: "h", size: 300, vertices: 12, faces: 4, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1, y: 2, z: 3 } },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/territories/t%201/artifacts");
  });

  it("defaults a missing vertex/face count and a missing bbox", async () => {
    await expect(listArtifacts("model", "m")).resolves.toEqual([
      { lod: 0, hash: "h", size: 300, vertices: 0, faces: 0, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 0, y: 0, z: 0 } },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/models/m/artifacts");
  });
});
