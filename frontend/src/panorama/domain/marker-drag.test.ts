import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE, begin, move, dropTarget } from "./marker-drag.ts";

const p1 = { x: 1, y: 0, z: 0 };
const p2 = { x: 2, y: 0, z: 3 };

test("begin sets draggingId and clears livePos", () => {
  const s = begin(7);
  assert.equal(s.draggingId, 7);
  assert.equal(s.livePos, null);
});

test("move records the last point while grabbed", () => {
  const s = move(move(begin(7), p1), p2);
  assert.deepEqual(s.livePos, p2);
  assert.equal(s.draggingId, 7);
});

test("move without a grab is ignored", () => {
  assert.deepEqual(move(IDLE, p1), IDLE);
});

test("dropTarget returns id+position after a move", () => {
  assert.deepEqual(dropTarget(move(begin(7), p2)), { id: 7, position: p2 });
});

test("dropTarget is null for a grab with no move (plain click)", () => {
  assert.equal(dropTarget(begin(7)), null);
  assert.equal(dropTarget(IDLE), null);
});
