import { describe, expect, it } from "vitest";
import type { SceneMetadata } from "@/entities/scene";
import type { ViewerView } from "@/features/viewer-mode";
import { loadingChip, modeChip, stripItems } from "./strip-and-chips";

const SCENE: ViewerView = { kind: "scene" };
const INSIDE: ViewerView = { kind: "panorama", id: 7 };

const METADATA: SceneMetadata = {
  dims: { x: 36, y: 24, z: 8.5 },
  units: "metres",
  vertices: 1_284_210,
  faces: 612_480,
  uploadedAt: "2026-09-04T09:00:00Z",
};

const NOTHING = { segments: 0, total: "0.00 m" };

const chip = (over: Partial<Parameters<typeof modeChip>[0]> = {}) =>
  modeChip({
    mode: "orbit",
    measure: NOTHING,
    view: SCENE,
    move: false,
    calibrating: null,
    ...over,
  });

describe("modeChip", () => {
  it("tells an orbiting pointer what a drag does", () => {
    expect(chip()).toEqual({ text: "orbit · drag to rotate" });
  });

  it("tells a placing pointer where the click lands", () => {
    expect(chip({ mode: "place" })).toEqual({
      text: "place objects · click the ground",
    });
  });

  it("reads plain measure before anything has been drawn", () => {
    expect(chip({ mode: "measure" })).toEqual({ text: "measure" });
  });

  it("counts one segment in the singular", () => {
    expect(chip({ mode: "measure", measure: { segments: 1, total: "12.40 m" } }).text).toBe(
      "measure · 1 segment · 12.40 m total",
    );
  });

  it("counts two segments in the plural", () => {
    expect(chip({ mode: "measure", measure: { segments: 2, total: "20.55 m" } }).text).toBe(
      "measure · 2 segments · 20.55 m total",
    );
  });

  it("says what a drag does inside a panorama, and which key leaves it", () => {
    expect(chip({ view: INSIDE })).toEqual({
      text: "panorama · drag to look around",
      kbd: "P",
    });
  });

  it("names the panorama being calibrated — there is only ever one", () => {
    expect(chip({ calibrating: "Control room" })).toEqual({ text: "calibrating · Control room" });
  });

  it("says what move mode moves, and which key leaves it", () => {
    expect(chip({ move: true })).toEqual({ text: "move points · drag a marker", kbd: "V" });
  });

  it("looks around rather than calibrating once the camera is inside the sphere", () => {
    // The chip answers "what does the pointer do", and inside the sphere a
    // drag looks around whatever the anchor card is doing on the panel.
    expect(chip({ view: INSIDE, calibrating: "Control room" }).text).toBe(
      "panorama · drag to look around",
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
