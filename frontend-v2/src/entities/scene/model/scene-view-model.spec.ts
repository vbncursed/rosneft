import { describe, expect, it } from "vitest";
import type { SceneBundle } from "../api/scene-gateway";
import { sceneReady, toSceneViewModel } from "./scene-view-model";

const territory = {
  slug: "t",
  title: "Refinery Block C",
  sourceBlobHash: "s",
  placementCount: 1,
  createdAt: "2026-09-04T10:00:00Z",
};
const chain = [
  { lod: 0, hash: "a", size: 30, vertices: 1_284_210, faces: 612_480 },
  { lod: 2, hash: "c", size: 10 },
];
const artifact = {
  lod: 0,
  hash: "a",
  size: 30,
  vertices: 1_284_210,
  faces: 612_480,
  bboxMin: { x: 0, y: 0, z: 0 },
  bboxMax: { x: 36, y: 8.5, z: 24 },
  chain,
};
const placement = {
  id: 7,
  territorySlug: "t",
  modelSlug: "tank",
  label: "",
  updatedAt: "",
  visiblePanoramaIds: [],
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};
const panorama = {
  id: 9,
  territorySlug: "t",
  slug: "north",
  title: "North yard",
  sourceBlobHash: "p",
  position: { x: 0, y: 0, z: 0 },
  yawOffset: 0,
  defaultYaw: 0,
  updatedAt: "",
};
const document = { id: 8, territorySlug: "t", title: "Plot plan.pdf", sourceBlobHash: "d", createdAt: "" };
const bundle: SceneBundle = {
  territory,
  artifact,
  placements: [placement],
  modelOptions: [{ slug: "tank", title: "storage-tank-500", chain: [{ lod: 0, hash: "m0", size: 5 }] }],
  panoramas: [panorama],
  documents: [document],
};

describe("sceneReady", () => {
  it("is true only with a LOD0 in the chain", () => {
    expect(sceneReady(bundle)).toBe(true);
    expect(sceneReady({ ...bundle, artifact: null })).toBe(false);
    expect(sceneReady({ ...bundle, artifact: { ...artifact, chain: [chain[1]] } })).toBe(false);
  });
});

describe("toSceneViewModel", () => {
  it("returns null when nothing is converted", () => {
    expect(toSceneViewModel({ ...bundle, artifact: null })).toBeNull();
  });

  it("carries the chain, the metadata and each placement's model chain", () => {
    const vm = toSceneViewModel(bundle)!;
    expect(vm.parentLods).toBe(chain);
    expect(vm.metadata).toEqual({
      dims: { x: 36, y: 8.5, z: 24 },
      units: "metres",
      vertices: 1_284_210,
      faces: 612_480,
      uploadedAt: "2026-09-04T10:00:00Z",
    });
    expect(vm.placements[0].chain).toEqual([{ lod: 0, hash: "m0", size: 5 }]);
  });

  it("gives a placement of an unconverted model an empty chain", () => {
    const vm = toSceneViewModel({ ...bundle, modelOptions: [] })!;
    expect(vm.placements[0].chain).toEqual([]);
  });

  it("reads the uploaded date as null when the territory has none", () => {
    const vm = toSceneViewModel({ ...bundle, territory: { ...territory, createdAt: undefined } })!;
    expect(vm.metadata.uploadedAt).toBeNull();
  });

  it("passes panoramas and documents through untouched", () => {
    const vm = toSceneViewModel(bundle)!;
    expect(vm.panoramas).toBe(bundle.panoramas);
    expect(vm.documents).toBe(bundle.documents);
  });

  describe("sourceBbox", () => {
    it("carries the LOD0 bbox as min/max", () => {
      const vm = toSceneViewModel(bundle)!;
      expect(vm.sourceBbox).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 36, y: 8.5, z: 24 } });
    });

    it("is null when both ends of the bbox are the zero fallback", () => {
      const zeroed = { ...artifact, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 0, y: 0, z: 0 } };
      const vm = toSceneViewModel({ ...bundle, artifact: zeroed })!;
      expect(vm.sourceBbox).toBeNull();
    });
  });
});
