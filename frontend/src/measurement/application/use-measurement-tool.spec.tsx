// Run with: yarn test:spa  (vitest + jsdom).
//
// The transitions themselves are covered in measurement-reducer.spec.ts; this
// suite covers what the hook adds on top — the derived close marker and the
// stability of the dispatchers.
import { test, afterEach } from "vitest";
import assert from "node:assert/strict";

import { renderHook, act } from "@/test-support/render-hook";
import { useMeasurementTool } from "./use-measurement-tool";
import { CLOSE_TOLERANCE } from "@/measurement/domain/chain";

const p = (x: number, y = 0, z = 0) => ({ x, y, z });

const mounted: (() => void)[] = [];
function tool() {
  const h = renderHook(() => useMeasurementTool());
  mounted.push(h.unmount);
  return h;
}
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

test("starts out of measure mode with nothing drawn", () => {
  const { result } = tool();
  assert.equal(result.current.measureMode, false);
  assert.deepEqual(result.current.chains, []);
  assert.equal(result.current.activeChainId, null);
  assert.equal(result.current.activeChainStart, null);
});

test("clicking starts a chain and makes it active", () => {
  const { result } = tool();
  act(() => result.current.click(p(1)));
  assert.equal(result.current.chains.length, 1);
  assert.equal(result.current.activeChainId, 1);
});

test("the close marker stays hidden until a second point exists", () => {
  // With one point there is nothing to close into, so showing the marker would
  // invite a click that only appends.
  const { result } = tool();
  act(() => result.current.click(p(0)));
  assert.equal(result.current.activeChainStart, null);
  act(() => result.current.click(p(1)));
  assert.deepEqual(result.current.activeChainStart, p(0));
});

test("the close marker sits on the chain's first point, not its tip", () => {
  const { result } = tool();
  act(() => result.current.click(p(5, 5, 5)));
  act(() => result.current.click(p(1)));
  act(() => result.current.click(p(2)));
  assert.deepEqual(result.current.activeChainStart, p(5, 5, 5));
});

test("closing a chain clears the marker", () => {
  const { result } = tool();
  for (const pt of [p(0), p(1), p(0.5, 1)]) act(() => result.current.click(pt));
  act(() => result.current.click(p(CLOSE_TOLERANCE / 2)));
  assert.equal(result.current.activeChainId, null);
  assert.equal(result.current.activeChainStart, null);
  assert.equal(result.current.chains[0].closed, true);
});

test("cancelling a chain keeps the points but drops the marker", () => {
  const { result } = tool();
  act(() => result.current.click(p(0)));
  act(() => result.current.click(p(1)));
  act(() => result.current.cancelChain());
  assert.equal(result.current.activeChainStart, null);
  assert.equal(result.current.chains[0].points.length, 2);
});

test("toggle flips measure mode, exit always leaves it", () => {
  const { result } = tool();
  act(() => result.current.toggle());
  assert.equal(result.current.measureMode, true);
  act(() => result.current.exit());
  assert.equal(result.current.measureMode, false);
});

test("clear wipes the chains", () => {
  const { result } = tool();
  act(() => result.current.click(p(0)));
  act(() => result.current.clear());
  assert.deepEqual(result.current.chains, []);
});

test("removeChain drops the named chain", () => {
  const { result } = tool();
  act(() => result.current.click(p(0)));
  act(() => result.current.removeChain(1));
  assert.deepEqual(result.current.chains, []);
});

test("removeSegment splits a chain in place", () => {
  const { result } = tool();
  for (const pt of [p(0), p(1), p(2), p(3)]) act(() => result.current.click(pt));
  act(() => result.current.removeSegment(1, 1));
  assert.equal(result.current.chains.length, 2);
});

test("every dispatcher keeps a stable identity across renders", () => {
  // They are handed to memoized three.js children; a fresh identity per render
  // would re-render the whole measurement layer on every state change.
  const h = tool();
  const before = { ...h.result.current };
  act(() => h.result.current.click(p(0)));
  h.rerender();
  for (const key of ["click", "closeActive", "cancelChain", "toggle", "exit", "clear", "removeChain", "removeSegment"] as const) {
    assert.equal(h.result.current[key], before[key], `${key} changed identity`);
  }
});

test("the close marker is recomputed only when the active chain changes", () => {
  const h = tool();
  act(() => h.result.current.click(p(0)));
  act(() => h.result.current.click(p(1)));
  const marker = h.result.current.activeChainStart;
  h.rerender();
  assert.equal(h.result.current.activeChainStart, marker, "memo returned a new object");
});
