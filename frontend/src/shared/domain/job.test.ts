// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { isTerminal } from "./job.ts";

test("succeeded and failed are terminal — the SSE stream closes on both", () => {
  assert.equal(isTerminal("succeeded"), true);
  assert.equal(isTerminal("failed"), true);
});

test("pending and running are not terminal — keep the stream open", () => {
  assert.equal(isTerminal("pending"), false);
  assert.equal(isTerminal("running"), false);
});
