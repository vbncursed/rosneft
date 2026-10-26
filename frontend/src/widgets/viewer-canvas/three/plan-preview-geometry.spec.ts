import { describe, expect, it } from "vitest";
import type { PreviewOutline } from "@/features/zone-editor";
import { footprintsGeometry, loopGeometry, segmentsGeometry } from "./plan-preview-geometry";

const square = (index: number, x: number): PreviewOutline => ({
  index,
  corners: [
    { x, y: 1, z: 0 },
    { x: x + 1, y: 1, z: 0 },
    { x: x + 1, y: 1, z: 1 },
    { x, y: 1, z: 1 },
  ],
});
const TWO = [square(4, 0), square(9, 5)];

describe("plan preview geometry", () => {
  it("joins each outline's corners into a closed ring of four segments", () => {
    const p = segmentsGeometry([square(0, 0)]).getAttribute("position");
    expect(p.count).toBe(8);
    // Last segment runs from the fourth corner back to the first.
    expect([p.getX(6), p.getZ(6), p.getX(7), p.getZ(7)]).toEqual([0, 1, 0, 0]);
  });

  it("merges all outlines into one geometry", () => {
    expect(segmentsGeometry(TWO).getAttribute("position").count).toBe(16);
  });

  it("keeps two triangles per outline in outline order, so a face index names its outline", () => {
    const g = footprintsGeometry(TWO);
    expect(g.getAttribute("position").count).toBe(8);
    expect(Array.from(g.index!.array)).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  });

  it("makes the loop of a single outline from its four corners", () => {
    const g = loopGeometry(TWO[1]);
    expect(g.getAttribute("position").count).toBe(4);
    expect(g.index).toBeNull();
  });

  it("draws nothing for no outlines", () => {
    expect(segmentsGeometry([]).getAttribute("position").count).toBe(0);
    expect(footprintsGeometry([]).index!.count).toBe(0);
  });
});
