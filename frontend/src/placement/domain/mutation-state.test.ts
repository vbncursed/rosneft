// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { idle, creating, mutating, isCreating, isMutatingId } from "./mutation-state.ts";

test("isCreating is true only in the creating state", () => {
  assert.equal(isCreating(creating), true);
  assert.equal(isCreating(idle), false);
  assert.equal(isCreating(mutating(5)), false);
});

test("isMutatingId matches on both kind and id", () => {
  assert.equal(isMutatingId(mutating(5), 5), true);
  assert.equal(isMutatingId(mutating(5), 6), false); // wrong id
  assert.equal(isMutatingId(creating, 5), false); // wrong kind
  assert.equal(isMutatingId(idle, 5), false);
});
