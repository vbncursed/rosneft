// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { fade, scaleFade, slideRight, slideUp, listStagger, listItem } from "./variants.ts";
import { quick, smooth, spring } from "./transitions.ts";

test("every variant defines hidden and visible states", () => {
  for (const v of [fade, scaleFade, slideRight, slideUp, listStagger, listItem]) {
    assert.ok("hidden" in v, "missing hidden");
    assert.ok("visible" in v, "missing visible");
  }
});

test("listStagger drives its children", () => {
  const visible = listStagger.visible as { transition?: { staggerChildren?: number } };
  assert.ok((visible.transition?.staggerChildren ?? 0) > 0);
});

test("transitions carry a positive duration or a spring type", () => {
  assert.equal(quick.duration, 0.15);
  assert.equal(smooth.duration, 0.25);
  assert.equal((spring as { type?: string }).type, "spring");
});
