import { describe, expect, it } from "vitest";
import { lodLabel, totalSize } from "./artifact";

describe("artifacts", () => {
  it("names the LOD range and sums the bytes", () => {
    const artifacts = [{ lod: 0, size: 300 }, { lod: 2, size: 100 }, { lod: 1, size: 12 }];
    expect(lodLabel(artifacts)).toBe("LOD 0-2");
    expect(lodLabel([{ lod: 0, size: 1 }])).toBe("LOD 0");
    expect(lodLabel([])).toBe("—");
    expect(totalSize(artifacts)).toBe(412);
    expect(totalSize([])).toBe(0);
  });
});
