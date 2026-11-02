import { describe, expect, it } from "vitest";
import { sizeCheck } from "./size-check";
import type { Zone } from "./zone";

describe("Zone", () => {
  it("with an unknown drawing size has nothing to check against", () => {
    const P = { x: 0, y: 0, z: 0 };
    const zone: Zone = {
      id: 1,
      title: "N2",
      corners: [P, P, P, P],
      tags: [],
      drawingWidthM: null,
      drawingHeightM: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(sizeCheck(zone, 1)).toBeNull();
  });
});
