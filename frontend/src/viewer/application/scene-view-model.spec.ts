import { describe, it, expect } from "vitest";
import { toSceneViewModel } from "@/viewer/application/scene-view-model";
import type { SceneBundle } from "@/territory/domain/scene-bundle";

const base = {
  territory: { slug: "t", title: "T", description: "", externalPanoramaUrl: "", sourceBlobHash: "", createdAt: "", updatedAt: "" },
  placements: [], modelOptions: [], panoramas: [], documents: [],
} as unknown as SceneBundle;

describe("toSceneViewModel", () => {
  it("returns null when no artifact", () => {
    expect(toSceneViewModel({ ...base, artifact: null })).toBeNull();
  });

  it("derives metadata + parentLods from the artifact", () => {
    const vm = toSceneViewModel({
      ...base,
      artifact: { slug: "t", lod: 0, hash: "h", contentType: "model/gltf-binary", size: 1, vertices: 10, faces: 5, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 2, y: 1, z: 4 }, createdAt: "", lods: undefined },
    } as unknown as SceneBundle);
    expect(vm).not.toBeNull();
    expect(vm!.metadata.vertices).toBe(10);
    expect(vm!.metadata.dimensions).toEqual({ x: 2, y: 1, z: 4 });
    expect(vm!.parentLods).toHaveLength(1);
    expect(vm!.parentLods[0].hash).toBe("h");
  });

  it("resolves placement LODs from model options by slug", () => {
    const vm = toSceneViewModel({
      ...base,
      artifact: { slug: "t", lod: 0, hash: "h", contentType: "x", size: 1, vertices: 1, faces: 1, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1, y: 1, z: 1 }, createdAt: "", lods: undefined },
      placements: [{ id: "p1", territorySlug: "t", modelSlug: "m", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, label: "", updatedAt: "", visiblePanoramaIds: [] }],
      modelOptions: [{ slug: "m", title: "M", lods: [{ lod: 0, hash: "mh", size: 1, vertices: 1, faces: 1 }] }],
    } as unknown as SceneBundle);
    expect(vm!.placements[0].lods[0].hash).toBe("mh");
  });
});
