import { describe, expect, it } from "vitest";
import { matchDescriptors } from "./orb-match";

describe("matchDescriptors", () => {
  it("returns unique reliable nearest neighbours", () => {
    const a = new Uint32Array([
      0, 0, 0, 0, 0, 0, 0, 0, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff,
      0xffffffff,
    ]);
    const b = new Uint32Array([
      0, 0, 0, 0, 0, 0, 0, 1, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff,
      0xfffffffe,
    ]);
    expect(matchDescriptors(a, b)).toEqual([
      { query: 0, target: 0 },
      { query: 1, target: 1 },
    ]);
  });
  it("rejects ambiguous neighbours", () => {
    expect(matchDescriptors(new Uint32Array(8), new Uint32Array(16))).toEqual([]);
  });
});
