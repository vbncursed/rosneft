import { describe, expect, it } from "vitest";
import { toPlacement } from "./to-placement";

const DTO = {
  id: 7,
  territorySlug: "north",
  modelSlug: "tank",
  position: { x: 1, y: 2, z: 3 },
  rotation: { x: 0, y: 1.57, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  label: "Tank A",
  updatedAt: "t1",
  visiblePanoramaIds: [4, 5],
};

describe("toPlacement", () => {
  it("carries the transform through untouched", () => {
    // Position in scene units, rotation Euler XYZ in radians, per-axis scale —
    // rounding or reordering any of them silently moves the object.
    const p = toPlacement(DTO);
    expect(p).toEqual({ ...DTO });
  });

  it("gives the optional fields renderable defaults", () => {
    const p = toPlacement({ ...DTO, label: undefined, updatedAt: undefined, visiblePanoramaIds: undefined });
    expect(p).toMatchObject({ label: "", updatedAt: "", visiblePanoramaIds: [] });
  });
});
