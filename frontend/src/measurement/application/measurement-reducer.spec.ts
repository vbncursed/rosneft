// Run with: yarn test:spa  (vitest). The logic here is pure, but the module
// imports through the `@/` alias, which only vitest resolves — `node --test`
// has no alias map.
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  measurementReducer as reduce,
  initialMeasurementState,
  type MeasurementState,
} from "./measurement-reducer.ts";
import { CLOSE_TOLERANCE } from "@/measurement/domain/chain";

const p = (x: number, y = 0, z = 0) => ({ x, y, z });
const click = (s: MeasurementState, pt = p(0)) => reduce(s, { type: "click", point: pt });

// A three-point open chain, active, with the id counter at 2.
function triangle(): MeasurementState {
  return [p(0), p(1), p(0.5, 1)].reduce((s, pt) => click(s, pt), initialMeasurementState);
}

test("the first click opens a chain and takes the next id", () => {
  const s = click(initialMeasurementState, p(1, 2, 3));
  assert.equal(s.chains.length, 1);
  assert.deepEqual(s.chains[0], { id: 1, points: [p(1, 2, 3)], closed: false });
  assert.equal(s.activeChainId, 1);
  assert.equal(s.nextId, 2);
});

test("later clicks extend the active chain without allocating ids", () => {
  const s = click(click(initialMeasurementState, p(0)), p(1));
  assert.equal(s.chains.length, 1);
  assert.equal(s.chains[0].points.length, 2);
  assert.equal(s.nextId, 2);
});

test("clicking the start point of a 3-point chain closes it and clears the active id", () => {
  const s = click(triangle(), p(CLOSE_TOLERANCE / 2));
  assert.equal(s.chains[0].closed, true);
  assert.equal(s.chains[0].points.length, 3, "the closing click must not be appended");
  assert.equal(s.activeChainId, null);
});

test("a near-start click outside the tolerance appends instead of closing", () => {
  const s = click(triangle(), p(CLOSE_TOLERANCE * 2));
  assert.equal(s.chains[0].closed, false);
  assert.equal(s.chains[0].points.length, 4);
  assert.equal(s.activeChainId, 1);
});

test("clicking the start of a 2-point chain appends — a line cannot close", () => {
  const two = click(click(initialMeasurementState, p(0)), p(1));
  const s = click(two, p(0));
  assert.equal(s.chains[0].closed, false);
  assert.equal(s.chains[0].points.length, 3, "the click must not be swallowed");
  assert.equal(s.activeChainId, 1);
});

test("closeActive closes the chain, and is a no-op with nothing active", () => {
  const closed = reduce(triangle(), { type: "closeActive" });
  assert.equal(closed.chains[0].closed, true);
  assert.equal(closed.activeChainId, null);
  assert.equal(reduce(closed, { type: "closeActive" }), closed, "must return the same object");
});

test("cancelChain drops the active id but keeps the points drawn so far", () => {
  const s = reduce(triangle(), { type: "cancelChain" });
  assert.equal(s.activeChainId, null);
  assert.equal(s.chains[0].points.length, 3);
  assert.equal(reduce(s, { type: "cancelChain" }), s, "must return the same object");
});

test("toggle turns measure mode on and off, dropping the active chain on the way out", () => {
  const on = reduce(initialMeasurementState, { type: "toggle" });
  assert.equal(on.measureMode, true);
  const drawing = click(on, p(0));
  const off = reduce(drawing, { type: "toggle" });
  assert.equal(off.measureMode, false);
  assert.equal(off.activeChainId, null);
  assert.equal(off.chains.length, 1, "finished work survives leaving measure mode");
});

test("exit leaves measure mode regardless of the current mode", () => {
  const s = reduce(triangle(), { type: "exit" });
  assert.equal(s.measureMode, false);
  assert.equal(s.activeChainId, null);
});

test("clear wipes the chains but keeps the id counter monotonic", () => {
  const s = reduce(triangle(), { type: "clear" });
  assert.deepEqual(s.chains, []);
  assert.equal(s.activeChainId, null);
  assert.equal(s.nextId, 2, "ids must not be reused after a clear");
});

test("removeChain drops only the named chain and unsets it if active", () => {
  const first = reduce(triangle(), { type: "closeActive" });
  const second = click(first, p(9));
  const s = reduce(second, { type: "removeChain", chainId: 2 });
  assert.deepEqual(s.chains.map((c) => c.id), [1]);
  assert.equal(s.activeChainId, null);
});

test("removeChain on an unknown id changes nothing observable", () => {
  const s = reduce(triangle(), { type: "removeChain", chainId: 99 });
  assert.deepEqual(s.chains.map((c) => c.id), [1]);
  assert.equal(s.activeChainId, 1);
});

test("removeSegment splits an open chain into two, each with its own id", () => {
  const four = [p(0), p(1), p(2), p(3)].reduce((s, pt) => click(s, pt), initialMeasurementState);
  const s = reduce(four, { type: "removeSegment", chainId: 1, segmentIndex: 1 });
  assert.equal(s.chains.length, 2);
  assert.equal(new Set(s.chains.map((c) => c.id)).size, 2);
  assert.deepEqual(s.chains[0].points, [p(0), p(1)]);
  assert.deepEqual(s.chains[1].points, [p(2), p(3)]);
  assert.equal(s.activeChainId, null);
});

test("removeSegment drops a side that would be left with a single point", () => {
  const s = reduce(triangle(), { type: "removeSegment", chainId: 1, segmentIndex: 0 });
  assert.equal(s.chains.length, 1);
  assert.deepEqual(s.chains[0].points, [p(1), p(0.5, 1)]);
});

test("removeSegment on an unknown chain returns the same state object", () => {
  const s = triangle();
  assert.equal(reduce(s, { type: "removeSegment", chainId: 99, segmentIndex: 0 }), s);
});

test("a split never hands a new chain an id the counter will reissue", () => {
  // removeSegment is handed two ids and may use either, both, or only the
  // second one. Retiring only as many as it returned lets the next chain
  // collide with a chain that is still on screen.
  const s = reduce(triangle(), { type: "removeSegment", chainId: 1, segmentIndex: 0 });
  const next = click({ ...s, activeChainId: null }, p(7));
  const ids = next.chains.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate chain id in ${JSON.stringify(ids)}`);
});

test("an unknown action returns the same state object", () => {
  const s = triangle();
  // @ts-expect-error — exercising the default branch a bad dispatch would hit.
  assert.equal(reduce(s, { type: "nope" }), s);
});
