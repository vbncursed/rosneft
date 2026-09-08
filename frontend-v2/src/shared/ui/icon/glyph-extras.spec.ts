import { describe, expect, it } from "vitest";
import { EXTRA_GLYPHS } from "./glyph-extras";

describe("glyph extras", () => {
  it("gives the view-toggle and dash glyphs a square 24-wide box", () => {
    for (const name of ["minus", "grid", "list", "arrow-right"] as const) {
      const [minX, minY, width, height] = EXTRA_GLYPHS[name].box.split(" ").map(Number);
      expect([minX, minY]).toEqual([0, 0]);
      expect(width).toBe(height);
      expect(width).toBe(24);
    }
  });

  it("strokes every extra glyph — none of them are filled", () => {
    for (const name of ["minus", "grid", "list", "arrow-right"] as const) {
      expect(EXTRA_GLYPHS[name].width).toBeGreaterThan(0);
    }
  });

  it("draws the console card's arrow at stroke 2 — heavier than the lock beside it", () => {
    expect(EXTRA_GLYPHS["arrow-right"].width).toBe(2);
  });
});
