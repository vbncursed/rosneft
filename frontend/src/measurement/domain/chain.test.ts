// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

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
} from "./chain.ts";

const p = (x: number, y: number, z: number) => ({ x, y, z });
const chain = (points: ReturnType<typeof p>[], closed = false): Chain => ({ id: 1, points, closed });

test("shouldCloseAt: false when already closed", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)], true);
  assert.equal(shouldCloseAt(c, p(0, 0, 0)), false);
});

test("shouldCloseAt: false with fewer than 3 points", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0)]);
  assert.equal(shouldCloseAt(c, p(0, 0, 0)), false);
});

test("shouldCloseAt: true within tolerance of the start", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
  assert.equal(shouldCloseAt(c, p(CLOSE_TOLERANCE - 0.01, 0, 0)), true);
});

test("shouldCloseAt: boundary is inclusive (<=)", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
  assert.equal(shouldCloseAt(c, p(CLOSE_TOLERANCE, 0, 0)), true);
});

test("shouldCloseAt: false just beyond tolerance", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
  assert.equal(shouldCloseAt(c, p(CLOSE_TOLERANCE + 0.01, 0, 0)), false);
});

test("appendPoint adds the point and leaves the original untouched", () => {
  const c = chain([p(0, 0, 0)]);
  const next = appendPoint(c, p(1, 2, 3));
  assert.deepEqual(next.points, [p(0, 0, 0), p(1, 2, 3)]);
  assert.equal(c.points.length, 1); // immutability
});

test("closeChain: closes an open chain of 3+ points", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
  assert.equal(closeChain(c).closed, true);
});

test("closeChain: no-op below 3 points", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0)]);
  assert.equal(closeChain(c), c);
});

test("closeChain: no-op when already closed", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)], true);
  assert.equal(closeChain(c), c);
});

test("chainSegments: open chain of N points yields N-1 segments", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]);
  const segs = chainSegments(c);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs[0], { id: encodeSegmentId(1, 0), a: p(0, 0, 0), b: p(1, 0, 0) });
  assert.deepEqual(segs[1], { id: encodeSegmentId(1, 1), a: p(1, 0, 0), b: p(2, 0, 0) });
});

test("chainSegments: closed chain yields N segments, last looping to point 0", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)], true);
  const segs = chainSegments(c);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs[2], { id: encodeSegmentId(1, 2), a: p(2, 0, 0), b: p(0, 0, 0) });
});

test("encode/decode segment id round-trips", () => {
  for (const [chainId, idx] of [[0, 0], [5, 3], [2, 0xffff], [1000, 7]]) {
    assert.deepEqual(decodeSegmentId(encodeSegmentId(chainId, idx)), {
      chainId,
      segmentIndex: idx,
    });
  }
});

test("removeSegment: closed chain opens up, rotated so the gap sits at the end", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0), p(3, 0, 0)], true);
  const out = removeSegment(c, 1, [10, 11]);
  assert.equal(out.length, 1);
  // segment 1 is B→C; new start is C, new end is B → [C, D, A, B]
  assert.deepEqual(out[0], {
    id: 10,
    closed: false,
    points: [p(2, 0, 0), p(3, 0, 0), p(0, 0, 0), p(1, 0, 0)],
  });
});

test("removeSegment: out-of-range index leaves the chain intact", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)], true);
  assert.deepEqual(removeSegment(c, 5, [10, 11]), [c]);
  assert.deepEqual(removeSegment(c, -1, [10, 11]), [c]);
});

test("removeSegment: open chain splits into two chains around the gap", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0), p(3, 0, 0)]);
  const out = removeSegment(c, 1, [10, 11]);
  assert.deepEqual(out, [
    { id: 10, closed: false, points: [p(0, 0, 0), p(1, 0, 0)] },
    { id: 11, closed: false, points: [p(2, 0, 0), p(3, 0, 0)] },
  ]);
});

test("removeSegment: dropping the first segment collapses the 1-point side", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]);
  const out = removeSegment(c, 0, [10, 11]);
  // left side [A] has no segment → dropped; only the right side survives, on nextIds[1]
  assert.deepEqual(out, [{ id: 11, closed: false, points: [p(1, 0, 0), p(2, 0, 0)] }]);
});

test("removeSegment: index at or past the last open segment is a no-op", () => {
  const c = chain([p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]);
  assert.deepEqual(removeSegment(c, 2, [10, 11]), [c]); // segments are 0,1 only
});
