import { describe, expect, it } from "vitest";
import { isCalibrated, type Panorama } from "./panorama";

const panorama = (overrides: Partial<Panorama> = {}): Panorama => ({
  id: 1,
  territorySlug: "t",
  slug: "control-room",
  title: "Control room",
  sourceBlobHash: "h",
  position: { x: 0, y: 0, z: 0 },
  yawOffset: 0,
  defaultYaw: 0,
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
