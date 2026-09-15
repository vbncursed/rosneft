import { describe, expect, it } from "vitest";
import { groupByModel, type ResolvedPlacement } from "@/entities/placement";
import type { ModelOption } from "@/entities/scene";
import { basePageParts } from "../territory-viewer-page.fixture";
import { detailsOf, selectedBlock, visibilityBlock } from "./page-props-selected";

const OPTIONS: ModelOption[] = [
  { slug: "storage-tank-500", title: "storage-tank-500", chain: [] },
];

const parts = () => basePageParts();

describe("detailsOf", () => {
  it("names the territory, its units and its counts, in the mock's order", () => {
    const { slug, vm } = parts();
    expect(detailsOf(slug, vm)).toEqual([
      { label: "slug", value: "refinery-block-c", tone: "accent" },
      { label: "units", value: "metres" },
      { label: "vertices", value: "1 284 210" },
      { label: "faces", value: "612 480" },
      { label: "uploaded", value: "4 Sep 2026", tone: "muted" },
    ]);
  });

  it("drops the mesh's own counts inside a panorama — that mesh is not on screen", () => {
    const { slug, vm } = parts();
    expect(detailsOf(slug, vm, true).map((d) => d.label)).toEqual(["slug", "units", "uploaded"]);
  });
});

describe("selectedBlock", () => {
  const p = parts();
  const groups = groupByModel(p.placements, OPTIONS);
  const first = p.placements[0];

  it("draws nothing while nothing is selected", () => {
    expect(selectedBlock(p, groups, null)).toBeNull();
  });

  it("names the instance the way the list numbers it, not by its own label", () => {
    expect(selectedBlock(p, groups, first)?.name).toBe("storage-tank-500 #1");
  });

  it("carries the live transform, the gizmo and the writer's grant", () => {
    const block = selectedBlock(p, groups, first);
    expect(block).toMatchObject({
      gizmo: "translate",
      snap: false,
      canWrite: true,
      transform: { position: first.position },
    });
  });

  it("draws nothing for a placement whose model is not in the grouped list", () => {
    const orphan: ResolvedPlacement = { ...first, modelSlug: "not-in-the-library" };
    expect(selectedBlock(p, groups, orphan)).toBeNull();
  });
});

describe("visibilityBlock", () => {
  const p = parts();
  const first = p.placements[0];
  const inside = {
    ...p,
    mode: { ...p.mode, view: { kind: "panorama" as const, id: 3 } },
    panoramas: {
      ...p.panoramas,
      list: [
        {
          id: 3,
          territorySlug: "refinery-block-c",
          slug: "control-room",
          title: "Control room",
          sourceBlobHash: "p3",
          position: { x: 1, y: 0, z: 2 },
          yawOffset: 0,
          defaultYaw: 0,
          updatedAt: "2026-09-14T10:00:00Z",
        },
      ],
    },
  };

  it("asks nothing while the territory has no captures to be visible in", () => {
    expect(visibilityBlock(p, first)).toBeNull();
  });

  it("asks nothing while nothing is selected", () => {
    expect(visibilityBlock(inside, null)).toBeNull();
  });

  // Mock state 13 draws the block in the 3D scene, and its own footer says why:
  // "Hidden objects stay in the 3D scene; only the panorama markers are
  // dropped." The question is which captures mark this object, and it is asked
  // where the object is selected — which is the scene.
  it("offers the captures from the 3D view too, where the choice is made", () => {
    const scene = { ...inside, mode: { ...inside.mode, view: { kind: "scene" as const } } };
    expect(visibilityBlock(scene, first)?.panoramas).toEqual([{ id: 3, title: "Control room" }]);
  });

  it("offers every capture, and ticks the ones this placement already shows in", () => {
    expect(visibilityBlock(inside, { ...first, visiblePanoramaIds: [3] })).toMatchObject({
      panoramas: [{ id: 3, title: "Control room" }],
      visiblePanoramaIds: [3],
    });
  });
});
