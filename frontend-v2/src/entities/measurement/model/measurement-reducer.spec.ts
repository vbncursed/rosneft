// Run with: yarn test:coverage  (vitest). The logic here is pure, but the
// module imports through the `@/` alias, which only vitest resolves.
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  measurementReducer as reduce,
  initialMeasurementState,
  type MeasurementState,
} from "./measurement-reducer";
import { CLOSE_TOLERANCE } from "./chain";

const p = (x: number, y = 0, z = 0) => ({ x, y, z });
const click = (s: MeasurementState, pt = p(0)) => reduce(s, { type: "click", point: pt });

// A three-point open chain, active, with the id counter at 2.
function triangle(): MeasurementState {
  return [p(0), p(1), p(0.5, 1)].reduce((s, pt) => click(s, pt), initialMeasurementState);
}

test("the first click opens a chain and takes the next id", () => {
  const s = click(initialMeasurementState, p(1, 2, 3));
  assert.equal(s.chains.length, 1);
  assert.deepEqual(s.chains[0], { id: 1, points: [p(1, 2, 3)], closed: false, sync: "local" });
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
  const drawing = click(click(on, p(0)), p(1));
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
  const s = reduce(triangle(), { type: "clear", keepSaved: false });
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

// --- finishing a chain drops it when it has fewer than two points ---

const onePoint = () => ({ ...click(initialMeasurementState, p(0)), measureMode: true });

for (const action of [
  { type: "closeActive" },
  { type: "cancelChain" },
  { type: "toggle" },
  { type: "exit" },
] as const) {
  test(`${action.type} drops an active chain of one point — it has no segment to keep`, () => {
    const s = reduce(onePoint(), action);
    assert.equal(s.activeChainId, null);
    assert.deepEqual(s.chains, []);
  });
}

test("finishing keeps an active chain of two points and every other chain", () => {
  const two = click(click(initialMeasurementState, p(0)), p(1));
  const finished = reduce(two, { type: "cancelChain" });
  const withStray = reduce(click(finished, p(5)), { type: "exit" });
  assert.deepEqual(withStray.chains.map((c) => c.id), [1]);
});

test("toggling measure mode on does not finish anything", () => {
  const s = { ...onePoint(), measureMode: false };
  assert.equal(reduce(s, { type: "toggle" }).chains.length, 1);
});

// --- where a chain stands with the server ---

const pt3 = [p(0), p(1), p(2)];
const seeded = reduce(initialMeasurementState, {
  type: "seed",
  chains: [
    { serverId: 7, points: pt3, closed: false },
    { serverId: 8, points: pt3, closed: true },
  ],
});

test("seed hands the stored chains local ids and marks them saved", () => {
  assert.deepEqual(seeded.chains, [
    { id: 1, serverId: 7, points: pt3, closed: false, sync: "saved" },
    { id: 2, serverId: 8, points: pt3, closed: true, sync: "saved" },
  ]);
  assert.equal(seeded.nextId, 3);
});

test("seed replaces stored chains and keeps local ones and the active chain", () => {
  const drawing = click(click(seeded, p(9)), p(8));
  const s = reduce(drawing, { type: "seed", chains: [{ serverId: 8, points: pt3, closed: true }] });
  assert.deepEqual(s.chains.map((c) => [c.id, c.serverId ?? null]), [[3, null], [4, 8]]);
  assert.equal(s.activeChainId, 3);
  assert.equal(s.nextId, 5);
});

test("saving, saved and failed move one chain along", () => {
  const local = reduce(click(click(initialMeasurementState, p(0)), p(1)), { type: "cancelChain" });
  const saving = reduce(local, { type: "saving", id: 1 });
  assert.equal(saving.chains[0].sync, "saving");
  const saved = reduce(saving, { type: "saved", id: 1, serverId: 55 });
  assert.deepEqual([saved.chains[0].sync, saved.chains[0].serverId], ["saved", 55]);
  assert.equal(saved.chains[0].points, local.chains[0].points, "the points are not copied");
  assert.equal(reduce(saving, { type: "failed", id: 1 }).chains[0].sync, "failed");
});

test("a sync action for a chain that is gone returns the same state object", () => {
  for (const action of [
    { type: "saving", id: 99 },
    { type: "saved", id: 99, serverId: 1 },
    { type: "failed", id: 99 },
  ] as const) {
    assert.equal(reduce(seeded, action), seeded, action.type);
  }
});

test("restore puts a chain back after a failed delete, once", () => {
  const removed = reduce(seeded, { type: "removeChain", chainId: 1 });
  const back = reduce(removed, { type: "restore", chain: seeded.chains[0] });
  assert.deepEqual(back.chains.map((c) => c.id).sort(), [1, 2]);
  assert.equal(reduce(back, { type: "restore", chain: seeded.chains[0] }), back);
});

test("a cut of a saved chain keeps its server id on the left part only", () => {
  const four = reduce(initialMeasurementState, {
    type: "seed",
    chains: [{ serverId: 7, points: [p(0), p(1), p(2), p(3)], closed: false }],
  });
  const s = reduce(four, { type: "removeSegment", chainId: 1, segmentIndex: 1 });
  assert.deepEqual(s.chains.map((c) => [c.serverId ?? null, c.sync]), [[7, "saved"], [null, "local"]]);
});

test("removeSegment of an active one-point chain finishes it, and it goes", () => {
  const s = reduce(onePoint(), { type: "removeSegment", chainId: 1, segmentIndex: 0 });
  assert.equal(s.activeChainId, null);
  assert.deepEqual(s.chains, []);
});

test("clear with keepSaved drops only the chains the server does not hold", () => {
  const drawing = click(click(seeded, p(9)), p(8));
  const s = reduce(drawing, { type: "clear", keepSaved: true });
  assert.deepEqual(s.chains, seeded.chains);
  assert.equal(s.activeChainId, null);
});

test("clear without keepSaved drops saved chains too", () => {
  const s = reduce(seeded, { type: "clear", keepSaved: false });
  assert.deepEqual(s.chains, []);
});

test("seed keeps a saved chain whose last write failed, over the server's copy of it", () => {
  const failed = reduce(seeded, { type: "failed", id: 1 });
  const s = reduce(failed, {
    type: "seed",
    chains: [
      { serverId: 7, points: [p(5), p(6)], closed: false },
      { serverId: 9, points: pt3, closed: false },
    ],
  });
  assert.deepEqual(s.chains.map((c) => [c.id, c.serverId, c.sync]), [
    [1, 7, "failed"],
    [3, 9, "saved"],
  ]);
  assert.equal(s.chains[0].points, pt3, "the unsaved edit stays on screen");
});
