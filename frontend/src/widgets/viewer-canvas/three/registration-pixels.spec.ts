import { describe, expect, it } from "vitest";
import { grayscaleReadback } from "./registration-pixels";

describe("grayscaleReadback", () => {
  it("converts GPU bottom-up RGBA into top-down grayscale", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    expect(Array.from(grayscaleReadback(rgba, 2, 2))).toEqual([29, 255, 76, 150]);
  });
});
