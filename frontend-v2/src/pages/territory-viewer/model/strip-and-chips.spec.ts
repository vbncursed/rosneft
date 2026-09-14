import { describe, expect, it } from "vitest";
import type { SceneMetadata } from "@/entities/scene";
import { loadingChip, modeChip, stripItems } from "./strip-and-chips";

const METADATA: SceneMetadata = {
  dims: { x: 36, y: 24, z: 8.5 },
  units: "metres",
  vertices: 1_284_210,
  faces: 612_480,
  uploadedAt: "2026-09-04T09:00:00Z",
};

const NOTHING = { segments: 0, total: "0.00 m" };

describe("modeChip", () => {
  it("tells an orbiting pointer what a drag does", () => {
    expect(modeChip({ mode: "orbit", measure: NOTHING })).toEqual({ text: "orbit · drag to rotate" });
  });

  it("tells a placing pointer where the click lands", () => {
    expect(modeChip({ mode: "place", measure: NOTHING })).toEqual({
      text: "place objects · click the ground",
    });
  });

  it("reads plain measure before anything has been drawn", () => {
    expect(modeChip({ mode: "measure", measure: NOTHING })).toEqual({ text: "measure" });
  });

  it("counts one segment in the singular", () => {
    expect(modeChip({ mode: "measure", measure: { segments: 1, total: "12.40 m" } }).text).toBe(
      "measure · 1 segment · 12.40 m total",
    );
  });

  it("counts two segments in the plural", () => {
    expect(modeChip({ mode: "measure", measure: { segments: 2, total: "20.55 m" } }).text).toBe(
      "measure · 2 segments · 20.55 m total",
    );
  });
});

describe("stripItems", () => {
  it("prints the dimensions, the counts and the level on screen", () => {
    expect(stripItems({ metadata: METADATA, shown: 1, target: 1, failed: false })).toEqual({
      items: ["36.0 × 24.0 × 8.5 m", "1 284 210 vertices", "612 480 faces", "LOD 1 active"],
      tone: "neutral",
      accentLast: false,
    });
  });

  it("names both levels and accents the last span while the target downloads", () => {
    expect(stripItems({ metadata: METADATA, shown: 2, target: 0, failed: false })).toEqual({
      items: [
        "36.0 × 24.0 × 8.5 m",
        "1 284 210 vertices",
        "612 480 faces",
        "LOD 2 active · LOD 0 loading",
      ],
      tone: "neutral",
      accentLast: true,
    });
  });

  it("leaves the level out entirely before anything is on screen", () => {
    expect(stripItems({ metadata: METADATA, shown: null, target: 0, failed: false })).toEqual({
      items: ["36.0 × 24.0 × 8.5 m", "1 284 210 vertices", "612 480 faces"],
      tone: "neutral",
      accentLast: false,
    });
  });

  it("states the absence rather than showing a spinner when the mesh failed", () => {
    expect(stripItems({ metadata: METADATA, shown: null, target: 1, failed: true })).toEqual({
      items: [
        "no geometry loaded",
        "dimensions unavailable",
        "vertices —",
        "faces —",
        "LOD 1 requested",
      ],
      tone: "bad",
      accentLast: false,
    });
  });

  it("prints an em-dash for a requested level nobody named", () => {
    expect(stripItems({ metadata: METADATA, shown: null, target: null, failed: true }).items[4]).toBe(
      "LOD — requested",
    );
  });
});

describe("loadingChip", () => {
  it("says which level is shown, which is coming and how far it has got", () => {
    expect(loadingChip({ shown: 2, target: 0, percent: 62, text: "6.1 / 9.8 MB" })).toBe(
      "coarse LOD 2 shown · LOD 0 62% · 6.1 / 9.8 MB",
    );
  });
});
