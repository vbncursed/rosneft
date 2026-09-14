import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSceneBundle } from "./scene-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const dto = {
  territory: { slug: "t", title: "T", sourceBlobHash: "s" },
  artifact: {
    slug: "t",
    lod: 0,
    hash: "a",
    contentType: "model/gltf-binary",
    size: 30,
    vertices: 10,
    faces: 4,
    bboxMin: { x: 0, y: 0, z: 0 },
    bboxMax: { x: 2, y: 1, z: 2 },
    artifacts: [
      { lod: 0, hash: "a", size: 30 },
      { lod: 2, hash: "c", size: 10 },
    ],
  },
  placements: [
    {
      id: 1,
      territorySlug: "t",
      modelSlug: "m",
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  ],
  modelOptions: [{ slug: "m", title: "M", artifacts: [] }],
  panoramas: [
    {
      id: 9,
      territorySlug: "t",
      slug: "north",
      title: "North yard",
      sourceBlobHash: "p",
      position: { x: 0, y: 0, z: 0 },
      yawOffset: 0,
      defaultYaw: 0,
    },
  ],
  documents: [{ id: 8, territorySlug: "t", title: "Plot plan.pdf", sourceBlobHash: "d" }],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json(dto)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("getSceneBundle", () => {
  it("maps the bundle, including panoramas and documents through their own mappers", async () => {
    const bundle = await getSceneBundle("t");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/territories/t/scene");
    expect(bundle.artifact?.chain.map((a) => a.lod)).toEqual([0, 2]);
    expect(bundle.artifact?.bboxMax).toEqual({ x: 2, y: 1, z: 2 });
    expect(bundle.placements[0]).toMatchObject({ id: 1, label: "", updatedAt: "", visiblePanoramaIds: [] });
    expect(bundle.modelOptions[0].chain).toEqual([]);
    expect(bundle.panoramas).toEqual([{ ...dto.panoramas[0], updatedAt: "" }]);
    expect(bundle.documents).toEqual([{ ...dto.documents[0], createdAt: "" }]);
  });

  it("defaults panoramas and documents to [] when the DTO omits them", async () => {
    const { panoramas: _p, documents: _d, ...withoutOverlays } = dto;
    fetchMock.mockResolvedValueOnce(json(withoutOverlays));
    const bundle = await getSceneBundle("t");
    expect(bundle.panoramas).toEqual([]);
    expect(bundle.documents).toEqual([]);
  });

  it("falls back to a one-entry chain when /scene carries no artifacts[]", async () => {
    const { artifacts: _a, ...single } = dto.artifact;
    fetchMock.mockResolvedValueOnce(json({ ...dto, artifact: single }));
    const bundle = await getSceneBundle("t");
    expect(bundle.artifact?.chain).toEqual([{ lod: 0, hash: "a", size: 30, vertices: 10, faces: 4 }]);
  });

  it("answers null for an unconverted territory", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...dto, artifact: undefined }));
    expect((await getSceneBundle("t")).artifact).toBeNull();
  });
});
