// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { isRange } from "./panel.ts";

test("isRange: accepts the four known ranges and rejects anything else", () => {
  assert.equal(isRange("6h"), true);
  assert.equal(isRange("7d"), true);
  assert.equal(isRange("99y"), false);
  assert.equal(isRange(""), false);
});
