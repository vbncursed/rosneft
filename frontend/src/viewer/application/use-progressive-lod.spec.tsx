// Run with: yarn test:spa  (vitest + jsdom).
import { test, afterEach } from "vitest";
import assert from "node:assert/strict";

import { renderHook, act } from "@/test-support/render-hook";
import { useProgressiveLod } from "./use-progressive-lod";
import type { LodArtifact } from "@/shared/domain/lod-artifact";

const lod = (n: number): LodArtifact => ({ lod: n, hash: `h${n}`, size: 100 - n });
const CHAIN = [lod(0), lod(1), lod(2)];

const mounted: (() => void)[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function bind(chain: LodArtifact[], target = 0) {
  const h = renderHook(() => useProgressiveLod(chain, target));
  mounted.push(h.unmount);
  return h;
}

test("starts on the coarsest level and warms the target", () => {
  const { result } = bind(CHAIN);
  assert.match(result.current.url!, /h2$/);
  assert.match(result.current.warmUrl!, /h0$/);
});

test("swaps to the target once the warmer reports it loaded", () => {
  const { result } = bind(CHAIN);
  act(() => result.current.onWarmReady());
  assert.match(result.current.url!, /h0$/);
  assert.equal(result.current.warmUrl, null);
});

test("a chain with only LOD0 warms nothing", () => {
  const { result } = bind([lod(0)]);
  assert.match(result.current.url!, /h0$/);
  assert.equal(result.current.warmUrl, null);
});

test("a failed displayed level drops out of the chain", () => {
  const { result } = bind(CHAIN);
  act(() => result.current.onFailed());
  // h2 is gone; the coarsest remaining is h1.
  assert.match(result.current.url!, /h1$/);
});

test("failing every level leaves nothing to render", () => {
  const { result } = bind(CHAIN);
  act(() => result.current.onFailed());
  act(() => result.current.onFailed());
  act(() => result.current.onFailed());
  assert.equal(result.current.url, null);
});

test("an empty chain renders nothing and warms nothing", () => {
  const { result } = bind([]);
  assert.equal(result.current.url, null);
  assert.equal(result.current.warmUrl, null);
});
