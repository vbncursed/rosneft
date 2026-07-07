import { test } from "node:test";
import assert from "node:assert/strict";
import type { Object3D } from "three";
import { isDescendant } from "./is-descendant.ts";

// Minimal stubs — isDescendant only reads `.parent` and object identity.
const node = (parent: Object3D | null = null) =>
  ({ parent }) as unknown as Object3D;

test("a node is its own subtree root", () => {
  const root = node();
  assert.equal(isDescendant(root, root), true);
});

test("a nested child is a descendant", () => {
  const root = node();
  const grandchild = node(node(root));
  assert.equal(isDescendant(grandchild, root), true);
});

test("an unrelated node is not a descendant", () => {
  const root = node();
  assert.equal(isDescendant(node(node()), root), false);
});

test("null node (ray missed the subtree) is not a descendant", () => {
  assert.equal(isDescendant(null, node()), false);
});
