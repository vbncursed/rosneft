import { describe, expect, it } from "vitest";
import { ALL_PHASES_SHOWN, isCalibrated, isPanoramaShown, PANORAMA_PHASES, type Panorama } from "./panorama";

const panorama = (overrides: Partial<Panorama> = {}): Panorama => ({
  id: 1,
  territorySlug: "t",
  slug: "control-room",
  title: "Control room",
  sourceBlobHash: "h",
  position: { x: 0, y: 0, z: 0 },
  yawOffset: 0,
  defaultYaw: 0,
  thumbnailBlobHash: null,
  phase: "prior",
  hidden: false,
  updatedAt: "",
  ...overrides,
});

describe("isCalibrated", () => {
  it("is false at the origin with yaw 0", () => {
    expect(isCalibrated(panorama())).toBe(false);
  });

  it("is true when any position axis has moved", () => {
    expect(isCalibrated(panorama({ position: { x: 1, y: 0, z: 0 } }))).toBe(true);
    expect(isCalibrated(panorama({ position: { x: 0, y: 1, z: 0 } }))).toBe(true);
    expect(isCalibrated(panorama({ position: { x: 0, y: 0, z: 1 } }))).toBe(true);
  });

  it("is true when the yaw offset has moved", () => {
    expect(isCalibrated(panorama({ yawOffset: 0.5 }))).toBe(true);
  });
});

describe("PANORAMA_PHASES", () => {
  it("lists the three job phases in list order, with the words the list prints", () => {
    expect(PANORAMA_PHASES).toEqual([
      { phase: "prior", label: "Prior job" },
      { phase: "current", label: "Current job" },
      { phase: "post", label: "Post job" },
    ]);
  });
});

describe("isPanoramaShown", () => {
  // D5: shown only when neither the capture nor its phase is hidden.
  it.each([
    [false, false, true],
    [true, false, false],
    [false, true, false],
    [true, true, false],
  ])("capture hidden %s, its phase hidden %s → shown %s", (hidden, phaseOff, shown) => {
    expect(isPanoramaShown(panorama({ hidden, phase: "current" }), { ...ALL_PHASES_SHOWN, current: phaseOff })).toBe(
      shown,
    );
  });

  it("reads only its own phase's flag", () => {
    expect(isPanoramaShown(panorama({ phase: "prior" }), { prior: false, current: true, post: true })).toBe(true);
  });
});
