import { describe, expect, it } from "vitest";
import {
  anchorCounter,
  defaultLook,
  deletePanoramaTitle,
  documentsCount,
  insideFooter,
  measurementsCount,
  nudgeLabel,
  opacityPercent,
} from "./copy";
import { degToRad } from "./degrees";

describe("documentsCount", () => {
  it("prints the mock's count line", () => {
    expect(documentsCount(2)).toBe("PDF overlays · 2");
    expect(documentsCount(0)).toBe("PDF overlays · 0");
  });
});

describe("measurementsCount", () => {
  it("counts the saved chains in the documents line's shape", () => {
    expect(measurementsCount(2)).toBe("saved chains · 2");
    expect(measurementsCount(0)).toBe("saved chains · 0");
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

  it("says none rather than counting to zero", () => {
    // The common state right after an upload: older placements are not in the
    // new capture's allowlist yet.
    expect(insideFooter(0)).toBe("No placements fall inside this panorama.");
  });

  it("spells up to nine and digits the rest", () => {
    expect(insideFooter(9)).toBe(
      "Nine placements fall inside this panorama and are marked on the photo.",
    );
    expect(insideFooter(10)).toBe(
      "10 placements fall inside this panorama and are marked on the photo.",
    );
  });
});

describe("anchorCounter", () => {
  it("says which panorama of how many is open", () => {
    expect(anchorCounter(1, 2)).toBe("1 of 2");
  });
});

describe("defaultLook", () => {
  it("prints the mock's default look", () => {
    expect(defaultLook(degToRad(137.5))).toBe("Default look: 137.5°");
  });
});

describe("deletePanoramaTitle", () => {
  it("names the panorama it is about to delete", () => {
    expect(deletePanoramaTitle("Control room, north door")).toBe(
      "Delete panorama Control room, north door?",
    );
  });
});

describe("nudgeLabel", () => {
  it("names the axis and what pressing it does", () => {
    expect(nudgeLabel("x", false)).toBe("Decrease X");
    expect(nudgeLabel("z", true)).toBe("Increase Z");
  });
});

describe("opacityPercent", () => {
  it("prints the mock's spaced percent", () => {
    expect(opacityPercent(0.65)).toBe("65 %");
    expect(opacityPercent(1)).toBe("100 %");
  });
});
