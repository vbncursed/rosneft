import { describe, expect, it } from "vitest";
import { lodLabel, totalSize, type Artifact } from "./artifact";

const ZERO = { x: 0, y: 0, z: 0 };
const artifact = (lod: number, size: number): Artifact => ({
  lod,
  size,
  hash: `h${lod}`,
  vertices: 0,
  faces: 0,
  bboxMin: ZERO,
  bboxMax: ZERO,
});

describe("artifacts", () => {
  it("names the LOD range and sums the bytes", () => {
    const artifacts = [artifact(0, 300), artifact(2, 100), artifact(1, 12)];
    expect(lodLabel(artifacts)).toBe("LOD 0-2");
    expect(lodLabel([artifact(0, 1)])).toBe("LOD 0");
    expect(lodLabel([])).toBe("—");
    expect(totalSize(artifacts)).toBe(412);
    expect(totalSize([])).toBe(0);
  });
});
