import { describe, expect, it } from "vitest";
import { GLYPHS, ICON_NAMES } from "./glyphs";

describe("the glyph registry", () => {
  it("lists every glyph exactly once", () => {
    expect(ICON_NAMES).toHaveLength(Object.keys(GLYPHS).length);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it("carries every name the app draws", () => {
    expect([...ICON_NAMES].sort()).toEqual([
      "arrow-right", "arrow-up", "calendar", "check", "chevron-left", "chevron-right", "chevron-up",
      "close", "cube", "documents", "download", "eye", "eye-off", "file", "grid", "grip", "help",
      "info", "kebab", "list", "lock", "magnet", "maximize", "minimize", "minus", "moon", "panorama",
      "passkey", "pencil", "plus", "refresh", "reset", "ruler", "search", "sun", "trash", "upload",
      "warning",
    ]);
  });

  it("gives every glyph a body and nothing else — grid and stroke are the component's", () => {
    for (const name of ICON_NAMES) {
      expect(Object.keys(GLYPHS[name])).toEqual(["body"]);
      expect(GLYPHS[name].body).toBeTruthy();
    }
  });
});
