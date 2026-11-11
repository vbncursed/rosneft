import { describe, expect, it } from "vitest";
import { describeImage } from "./orb-features";

describe("describeImage", () => {
  it("returns no features for a blank image", () => {
    const image = new Uint8Array(128 * 128);
    expect(describeImage(image, 128, 128).points).toHaveLength(0);
  });
  it("detects textured features and produces one descriptor per point", () => {
    const image = new Uint8Array(256 * 256);
    let seed = 3;
    for (let i = 0; i < image.length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      image[i] = seed >>> 24;
    }
    const result = describeImage(image, 256, 256);
    expect(result.points.length).toBeGreaterThan(10);
    expect(result.descriptors.length).toBe(result.points.length * 8);
  });
});
