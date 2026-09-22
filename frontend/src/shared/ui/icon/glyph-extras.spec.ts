import { describe, expect, it } from "vitest";
import { EXTRA_GLYPHS } from "./glyph-extras";
import { GLYPHS } from "./glyphs";

describe("glyph extras", () => {
  it("are spread into the registry unchanged", () => {
    for (const name of Object.keys(EXTRA_GLYPHS) as (keyof typeof EXTRA_GLYPHS)[]) {
      expect(GLYPHS[name]).toBe(EXTRA_GLYPHS[name]);
    }
  });
});
