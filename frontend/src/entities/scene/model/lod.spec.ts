import { describe, expect, it } from "vitest";
import { orderByPreferred, pickCoarsest, pickLod, selectProgressive } from "./lod";

const chain = [
  { lod: 0, hash: "a", size: 30 },
  { lod: 1, hash: "b", size: 20 },
  { lod: 2, hash: "c", size: 10 },
];

describe("lod chain", () => {
  it("orders by closeness to the preferred level, ties toward quality", () => {
    expect(orderByPreferred(chain, 1).map((a) => a.lod)).toEqual([1, 0, 2]);
  });

  it("picks the requested level or the closest one", () => {
    expect(pickLod(chain, 2)?.hash).toBe("c");
    expect(pickLod(chain, 5)?.hash).toBe("c");
    expect(pickLod([], 0)).toBeNull();
  });

  it("names the coarsest level", () => {
    expect(pickCoarsest(chain)?.lod).toBe(2);
    expect(pickCoarsest([])).toBeNull();
  });

  it("shows the coarsest and warms the target until ready", () => {
    expect(selectProgressive(chain, 0, false)).toEqual({ show: chain[2], warm: chain[0] });
    expect(selectProgressive(chain, 0, true)).toEqual({ show: chain[0], warm: null });
    expect(selectProgressive(chain, 2, false)).toEqual({ show: chain[2], warm: null });
    expect(selectProgressive([chain[0]], 0, false)).toEqual({ show: chain[0], warm: null });
  });
});
