import { describe, expect, it } from "vitest";
import { GLYPHS, ICON_NAMES } from "./glyphs";

describe("the glyph registry", () => {
  it("lists every glyph exactly once", () => {
    expect(ICON_NAMES).toHaveLength(Object.keys(GLYPHS).length);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it("carries the glyphs the design system draws", () => {
    expect([...ICON_NAMES].sort()).toEqual([
      "calendar",
      "cube",
      "eye",
      "eye-off",
      "kebab",
      "magnet",
      "pencil",
      "ruler",
      "search",
      "trash",
      "warning",
    ]);
  });

  it("gives every glyph a square viewBox anchored at the origin", () => {
    for (const name of ICON_NAMES) {
      const [minX, minY, width, height] = GLYPHS[name].box.split(" ").map(Number);
      expect([minX, minY]).toEqual([0, 0]);
      expect(width).toBe(height);
    }
  });

  it("gives every glyph body content", () => {
    for (const name of ICON_NAMES) {
      expect(GLYPHS[name].body).toBeTruthy();
    }
  });

  it("marks exactly the filled glyphs with a zero stroke width", () => {
    const filled = ICON_NAMES.filter((n) => GLYPHS[n].width === 0);
    expect(filled).toEqual(["kebab"]);
    for (const name of ICON_NAMES.filter((n) => n !== "kebab")) {
      expect(GLYPHS[name].width).toBeGreaterThan(0);
    }
  });
});
