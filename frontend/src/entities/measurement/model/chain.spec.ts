import { describe, expect, it } from "vitest";
import {
  CLOSE_TOLERANCE,
  shouldCloseAt,
  appendPoint,
  closeChain,
  chainSegments,
  encodeSegmentId,
  decodeSegmentId,
  removeSegment,
  type Chain,
} from "./chain";

const p = (x: number, y: number, z: number) => ({ x, y, z });
const chain = (points: ReturnType<typeof p>[], closed = false): Chain => ({
  id: 1,
  points,
  closed,
  sync: "local",
});
const saved = (points: ReturnType<typeof p>[], closed = false): Chain => ({
  ...chain(points, closed),
  serverId: 42,
  sync: "saved",
});

describe("shouldCloseAt", () => {
  it("is false when already closed", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)], true);
    expect(shouldCloseAt(c, p(0, 0, 0))).toBe(false);
  });

  it("is false with fewer than 3 points", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0)]);
    expect(shouldCloseAt(c, p(0, 0, 0))).toBe(false);
  });

  it("is true within tolerance of the start", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
    expect(shouldCloseAt(c, p(CLOSE_TOLERANCE - 0.01, 0, 0))).toBe(true);
  });

  it("boundary is inclusive (<=)", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
    expect(shouldCloseAt(c, p(CLOSE_TOLERANCE, 0, 0))).toBe(true);
  });

  it("is false just beyond tolerance", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
    expect(shouldCloseAt(c, p(CLOSE_TOLERANCE + 0.01, 0, 0))).toBe(false);
  });
});

describe("appendPoint", () => {
  it("adds the point and leaves the original untouched", () => {
    const c = chain([p(0, 0, 0)]);
    const next = appendPoint(c, p(1, 2, 3));
    expect(next.points).toEqual([p(0, 0, 0), p(1, 2, 3)]);
    expect(c.points.length).toBe(1); // immutability
  });
});

describe("closeChain", () => {
  it("closes an open chain of 3+ points", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
    expect(closeChain(c).closed).toBe(true);
  });

  it("is a no-op below 3 points", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0)]);
    expect(closeChain(c)).toBe(c);
  });

  it("is a no-op when already closed", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)], true);
    expect(closeChain(c)).toBe(c);
  });
});

describe("chainSegments", () => {
  it("yields N-1 segments for an open chain of N points", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]);
    const segs = chainSegments(c);
    expect(segs.length).toBe(2);
    expect(segs[0]).toEqual({ id: encodeSegmentId(1, 0), a: p(0, 0, 0), b: p(1, 0, 0) });
    expect(segs[1]).toEqual({ id: encodeSegmentId(1, 1), a: p(1, 0, 0), b: p(2, 0, 0) });
  });

  it("yields N segments for a closed chain, the last looping to point 0", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)], true);
    const segs = chainSegments(c);
    expect(segs.length).toBe(3);
    expect(segs[2]).toEqual({ id: encodeSegmentId(1, 2), a: p(2, 0, 0), b: p(0, 0, 0) });
  });
});

describe("segment id pack/unpack", () => {
  it("round-trips", () => {
    for (const [chainId, idx] of [
      [0, 0],
      [5, 3],
      [2, 0xffff],
      [1000, 7],
    ]) {
      expect(decodeSegmentId(encodeSegmentId(chainId, idx))).toEqual({
        chainId,
        segmentIndex: idx,
      });
    }
  });
});

describe("removeSegment", () => {
  it("opens up a closed chain, rotated so the gap sits at the end", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0), p(3, 0, 0)], true);
    const out = removeSegment(c, 1, [10, 11]);
    expect(out.length).toBe(1);
    // segment 1 is B→C; new start is C, new end is B → [C, D, A, B]
    expect(out[0]).toEqual({
      id: 10,
      closed: false,
      sync: "local",
      points: [p(2, 0, 0), p(3, 0, 0), p(0, 0, 0), p(1, 0, 0)],
    });
  });

  it("leaves the chain intact on an out-of-range index", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)], true);
    expect(removeSegment(c, 5, [10, 11])).toEqual([c]);
    expect(removeSegment(c, -1, [10, 11])).toEqual([c]);
  });

  it("splits an open chain into two chains around the gap", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0), p(3, 0, 0)]);
    const out = removeSegment(c, 1, [10, 11]);
    expect(out).toEqual([
      { id: 10, closed: false, sync: "local", points: [p(0, 0, 0), p(1, 0, 0)] },
      { id: 11, closed: false, sync: "local", points: [p(2, 0, 0), p(3, 0, 0)] },
    ]);
  });

  it("collapses the 1-point side when dropping the first segment", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]);
    const out = removeSegment(c, 0, [10, 11]);
    // left side [A] has no segment → dropped; only the right side survives, on nextIds[1]
    expect(out).toEqual([{ id: 11, closed: false, sync: "local", points: [p(1, 0, 0), p(2, 0, 0)] }]);
  });

  it("is a no-op at or past the last open segment index", () => {
    const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]);
    expect(removeSegment(c, 2, [10, 11])).toEqual([c]); // segments are 0,1 only
  });

  it("a saved chain's left part keeps the server id, the right part is new and local", () => {
    const out = removeSegment(saved([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0), p(3, 0, 0)]), 1, [10, 11]);
    expect(out.map(({ id, serverId, sync }) => ({ id, serverId, sync }))).toEqual([
      { id: 10, serverId: 42, sync: "saved" },
      { id: 11, serverId: undefined, sync: "local" },
    ]);
  });

  it("a saved closed chain opens up under the same server id", () => {
    const out = removeSegment(saved([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)], true), 0, [10, 11]);
    expect(out).toEqual([
      { id: 10, serverId: 42, sync: "saved", closed: false, points: [p(1, 0, 0), p(2, 0, 0), p(0, 0, 0)] },
    ]);
  });

  it("a saved chain that loses its left part hands its server id to the right part", () => {
    const out = removeSegment(saved([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]), 0, [10, 11]);
    expect(out).toEqual([
      { id: 11, serverId: 42, sync: "saved", closed: false, points: [p(1, 0, 0), p(2, 0, 0)] },
    ]);
  });

  it("a saved chain losing its last segment keeps the server id on the left part", () => {
    const out = removeSegment(saved([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]), 1, [10, 11]);
    expect(out).toEqual([
      { id: 10, serverId: 42, sync: "saved", closed: false, points: [p(0, 0, 0), p(1, 0, 0)] },
    ]);
  });

  it("a saved two-point chain cut in its only segment leaves nothing", () => {
    expect(removeSegment(saved([p(0, 0, 0), p(1, 0, 0)]), 0, [10, 11])).toEqual([]);
  });

  it("a left part of a chain whose save is still pending or failed is local", () => {
    const pending: Chain = { ...chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]), sync: "failed" };
    expect(removeSegment(pending, 1, [10, 11])[0]).toEqual({
      id: 10,
      sync: "local",
      closed: false,
      points: [p(0, 0, 0), p(1, 0, 0)],
    });
  });
});
