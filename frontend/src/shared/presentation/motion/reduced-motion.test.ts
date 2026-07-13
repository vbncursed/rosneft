// Run with: yarn test
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveVariants } from "./reduced-motion.ts";
import { slideRight } from "./variants.ts";

test("passes variants through untouched when motion is allowed", () => {
  assert.equal(resolveVariants(slideRight, false), slideRight);
});

test("collapses to an opacity-only crossfade when reduced", () => {
  const r = resolveVariants(slideRight, true) as {
    hidden: Record<string, unknown>;
    visible: Record<string, unknown>;
  };
  assert.deepEqual(r.hidden, { opacity: 0 });
  assert.deepEqual(r.visible, { opacity: 1 });
});
