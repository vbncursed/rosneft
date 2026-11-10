import { describe, expect, it } from "vitest";
import { matchImages } from "./orb-registration";

describe("matchImages", () => {
  it("finds a reflected image and returns points in original texture coordinates", () => {
    const width = 128,
      height = 128,
      data = new Uint8Array(width * height),
      flipped = new Uint8Array(width * height);
    let seed = 29;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = seed >>> 24;
    }
    for (let y = 0; y < height; y++) flipped.set(data.subarray(y * width, (y + 1) * width), (height - 1 - y) * width);
    const matches = matchImages({ data, width, height }, { data: flipped, width, height });
    expect(matches.length).toBeGreaterThanOrEqual(12);
    for (const m of matches) {
      expect(Math.abs(m.source.x - m.target.x)).toBeLessThan(3);
      expect(Math.abs(m.source.y - (height - 1 - m.target.y))).toBeLessThan(3);
    }
  });
  it("returns no proposal for blank pictures", () => {
    const image = { data: new Uint8Array(128 * 128), width: 128, height: 128 };
    expect(matchImages(image, image)).toEqual([]);
  });
});
