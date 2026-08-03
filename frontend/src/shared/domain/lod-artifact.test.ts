// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  orderByPreferred,
  pickLod,
  pickCoarsest,
  selectProgressive,
  type LodArtifact,
} from "./lod-artifact.ts";

const lod = (n: number): LodArtifact => ({ lod: n, hash: `h${n}`, size: 100 - n });
const CHAIN = [lod(0), lod(1), lod(2)];

test("orderByPreferred puts the exact match first", () => {
  assert.deepEqual(orderByPreferred(CHAIN, 1).map((a) => a.lod), [1, 0, 2]);
});

test("orderByPreferred breaks ties toward higher quality", () => {
  // preferred=1 is equidistant from 0 and 2; the lower lod number wins.
  assert.deepEqual(orderByPreferred([lod(2), lod(0)], 1).map((a) => a.lod), [0, 2]);
});

test("orderByPreferred falls back to the nearest when the exact LOD is absent", () => {
  assert.deepEqual(orderByPreferred([lod(0), lod(2)], 3).map((a) => a.lod), [2, 0]);
});

test("orderByPreferred does not mutate the caller's chain", () => {
  const chain = [lod(2), lod(0), lod(1)];
  orderByPreferred(chain, 0);
  assert.deepEqual(chain.map((a) => a.lod), [2, 0, 1]);
});

test("pickLod defaults to LOD0 — the main scene asset never gets simplified", () => {
  assert.equal(pickLod(CHAIN)?.lod, 0);
});

test("pickLod returns the closest entry when the request is missing", () => {
  assert.equal(pickLod([lod(0), lod(2)], 1)?.lod, 0);
  assert.equal(pickLod([lod(1), lod(2)], 0)?.lod, 1);
});

test("pickLod returns null for an empty chain — asset not converted yet", () => {
  assert.equal(pickLod([], 0), null);
});

test("pickCoarsest returns the highest lod number", () => {
  assert.equal(pickCoarsest(CHAIN)?.lod, 2);
});

test("pickCoarsest on an empty chain is null", () => {
  assert.equal(pickCoarsest([]), null);
});

test("before ready, show the coarsest and warm the target", () => {
  const sel = selectProgressive(CHAIN, 0, false);
  assert.equal(sel.show?.lod, 2);
  assert.equal(sel.warm?.lod, 0);
});

test("once ready, show the target and warm nothing", () => {
  const sel = selectProgressive(CHAIN, 0, true);
  assert.equal(sel.show?.lod, 0);
  assert.equal(sel.warm, null);
});

test("a single-entry chain never warms — there is nothing to upgrade to", () => {
  const sel = selectProgressive([lod(0)], 0, false);
  assert.equal(sel.show?.lod, 0);
  assert.equal(sel.warm, null);
});

test("an empty chain selects nothing", () => {
  const sel = selectProgressive([], 0, false);
  assert.equal(sel.show, null);
  assert.equal(sel.warm, null);
});

test("a target that is itself the coarsest never warms", () => {
  const sel = selectProgressive(CHAIN, 2, false);
  assert.equal(sel.show?.lod, 2);
  assert.equal(sel.warm, null);
});
