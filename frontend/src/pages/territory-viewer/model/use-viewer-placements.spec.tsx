import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { deletePlacementGroup, IDENTITY_TRANSFORM } from "@/entities/placement";
import type { SceneBundle, SceneViewModel } from "@/entities/scene";
import { useViewerPlacements } from "./use-viewer-placements";

vi.mock("@/entities/placement", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deletePlacementGroup: vi.fn(async () => undefined),
}));

const placement = (id: number, groupId: number | null) => ({
  id, territorySlug: "t", modelSlug: "tank", label: "", updatedAt: "", visiblePanoramaIds: [], hidden: false, groupId, chain: [], ...IDENTITY_TRANSFORM,
});
const vm = { placements: [placement(1, 4), placement(2, null)], metadata: { dims: { x: 40, y: 2, z: 1 } } } as unknown as SceneViewModel;
const bundle = { modelOptions: [], placementGroups: [{ id: 4, title: "East yard" }] } as unknown as SceneBundle;

describe("useViewerPlacements", () => {
  it("seeds the editor and the groups from one bundle", () => {
    const { result } = renderHook(() => useViewerPlacements({ slug: "t", bundle, vm, panoramaIds: [], onChanged: vi.fn() }));
    expect(result.current.editor.placements.map((p) => p.id)).toEqual([1, 2]);
    expect(result.current.groups.list).toEqual([{ id: 4, title: "East yard" }]);
  });

  // G-4: the group goes, its placements drop back to No group — in the same list.
  it("ungroups a deleted group's placements in the editor", async () => {
    const { result } = renderHook(() => useViewerPlacements({ slug: "t", bundle, vm, panoramaIds: [], onChanged: vi.fn() }));
    await act(() => result.current.groups.remove(4));
    expect(deletePlacementGroup).toHaveBeenCalledWith("t", 4);
    expect(result.current.editor.placements.map((p) => p.groupId)).toEqual([null, null]);
  });
});
