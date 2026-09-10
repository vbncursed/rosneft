import { describe, expect, it } from "vitest";
import { lodProgress, viewerError } from "./lod-progress";

describe("lodProgress", () => {
  it("rounds the percent and prints megabytes to one decimal", () => {
    expect(lodProgress(6_400_000, 10_300_000)).toEqual({ percent: 62, text: "6.1 / 9.8 MB" });
  });

  it("clamps at 100 and survives an unknown total", () => {
    expect(lodProgress(20, 10).percent).toBe(100);
    expect(lodProgress(5, 0)).toEqual({ percent: 0, text: "0.0 MB" });
  });
});

const chain = [
  { lod: 0, hash: "a", size: 1 },
  { lod: 1, hash: "b", size: 1 },
  { lod: 2, hash: "c", size: 1 },
];

describe("viewerError", () => {
  it("is null without a failure", () => {
    expect(viewerError(null, chain, chain[1], "refinery-block-c")).toBeNull();
  });

  it("names the failed level, the status, the file and a coarser level to fall back to", () => {
    expect(viewerError({ hash: "b", status: 502 }, chain, chain[1], "refinery-block-c")).toEqual({
      lod: 1,
      status: 502,
      file: "refinery-block-c-lod1.glb",
      coarser: chain[2],
    });
  });

  it("offers no coarser level when the failed one is the coarsest", () => {
    expect(viewerError({ hash: "c", status: null }, chain, chain[2], "t")?.coarser).toBeNull();
  });
});
