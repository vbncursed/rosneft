import { describe, expect, it } from "vitest";
import type { Zone } from "./zone";

describe("Zone", () => {
  it("allows an unknown drawing size", () => {
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
    expect(zone.drawingWidthM).toBeNull();
  });
});
