import { describe, expect, it } from "vitest";
import { groupByModel, type ResolvedPlacement } from "@/entities/placement";
import type { ModelOption } from "@/entities/scene";
import { labelsOf, markerLabels, moveOf } from "./canvas-memo";

describe("markerLabels", () => {
  const OPTIONS: ModelOption[] = [
    { slug: "storage-tank-500", title: "storage-tank-500", chain: [] },
  ];
  const placement = (id: number): ResolvedPlacement => ({
    id,
    territorySlug: "refinery-block-c",
    modelSlug: "storage-tank-500",
    label: "",
    updatedAt: "2026-09-14T10:00:00Z",
    visiblePanoramaIds: [],
    hidden: false,
    groupId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    chain: [],
  });

  it("numbers two instances of one model the way the panel does", () => {
    expect(markerLabels(groupByModel([placement(4), placement(9)], OPTIONS))).toEqual({
      4: "storage-tank-500 #1",
      9: "storage-tank-500 #2",
    });
  });

  it("has nothing to label in an empty scene", () => {
    expect(markerLabels([])).toEqual({});
  });
});

describe("labelsOf and moveOf", () => {
  it("answer the same object for the same inputs, so the canvas keeps its props", () => {
    const groups = groupByModel([], []);
    expect(labelsOf(groups)).toBe(labelsOf(groups));
    const pos = { x: 1, y: 2, z: 3 };
    expect(moveOf(true, 4, pos)).toBe(moveOf(true, 4, pos));
    expect(moveOf(true, 4, pos)).toEqual({ active: true, draggingId: 4, livePos: pos });
  });

  it("build a new move once the drag changes", () => {
    const first = moveOf(false, null, null);
    expect(moveOf(true, null, null)).not.toBe(first);
  });
});
