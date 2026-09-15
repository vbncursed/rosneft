import { describe, expect, it } from "vitest";
import { documentsCount, insideFooter } from "./copy";

describe("documentsCount", () => {
  it("prints the mock's count line", () => {
    expect(documentsCount(2)).toBe("PDF overlays · 2");
    expect(documentsCount(0)).toBe("PDF overlays · 0");
  });
});

describe("insideFooter", () => {
  it("spells the mock's two, and agrees the verbs", () => {
    expect(insideFooter(2)).toBe(
      "Two placements fall inside this panorama and are marked on the photo.",
    );
  });

  it("puts a single placement in the singular", () => {
    expect(insideFooter(1)).toBe(
      "One placement falls inside this panorama and is marked on the photo.",
    );
  });

  it("spells up to nine and digits the rest", () => {
    expect(insideFooter(0)).toBe(
      "0 placements fall inside this panorama and are marked on the photo.",
    );
    expect(insideFooter(9)).toBe(
      "Nine placements fall inside this panorama and are marked on the photo.",
    );
    expect(insideFooter(10)).toBe(
      "10 placements fall inside this panorama and are marked on the photo.",
    );
  });
});
