import { describe, expect, it } from "vitest";
import { toZone } from "./to-zone";

const P = { x: 0, y: 0, z: 0 };

describe("toZone", () => {
  it("maps every field and its tags", () => {
    const dto = {
      id: 3,
      title: "N2",
      corners: [P, P, P, P] as [typeof P, typeof P, typeof P, typeof P],
      tags: [{ slug: "tanks", title: "Tanks" }],
      drawingWidthM: 7.5,
      drawingHeightM: null,
      createdAt: "c",
      updatedAt: "u",
    };
    expect(toZone(dto)).toEqual(dto);
  });
});
