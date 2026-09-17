import { describe, expect, it } from "vitest";
import { overlaysWidthClass } from "./overlays-width";

describe("overlaysWidthClass", () => {
  it("declares the open panel's width, narrowing at 1280", () => {
    expect(overlaysWidthClass(false)).toBe(
      "[--overlays-w:320px] max-[1281px]:[--overlays-w:300px]",
    );
  });

  it("declares the collapsed rail's width", () => {
    expect(overlaysWidthClass(true)).toBe("[--overlays-w:44px]");
  });
});
