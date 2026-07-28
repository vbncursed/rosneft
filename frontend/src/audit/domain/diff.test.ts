// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { diffRows } from "./diff.ts";

test("a changed field reports both sides", () => {
  const out = diffRows({ title: "Северное поле" }, { title: "Северное поле-2" });

  assert.deepEqual(out, [
    { field: "title", before: "Северное поле", after: "Северное поле-2", kind: "changed" },
  ]);
});

test("unchanged fields are omitted", () => {
  const out = diffRows({ title: "A", slug: "a" }, { title: "B", slug: "a" });

  assert.equal(out.length, 1);
  assert.equal(out[0].field, "title");
});

// Timestamps move on every write and would bury the change the reader came for.
test("created_at and updated_at are ignored", () => {
  const out = diffRows(
    { title: "A", updated_at: "2026-01-01", created_at: "2025-01-01" },
    { title: "A", updated_at: "2026-07-28", created_at: "2025-01-01" },
  );

  assert.deepEqual(out, []);
});

test("an insert reports every field as added", () => {
  const out = diffRows(null, { title: "A", slug: "a" });

  assert.equal(out.length, 2);
  assert.ok(out.every((f) => f.kind === "added"));
  assert.equal(out[0].field, "slug"); // sorted
});

test("a delete reports every field as removed", () => {
  const out = diffRows({ title: "A" }, null);

  assert.deepEqual(out, [{ field: "title", before: "A", after: undefined, kind: "removed" }]);
});

test("a field appearing only in the new row is added", () => {
  const out = diffRows({ title: "A" }, { title: "A", label: "L" });

  assert.deepEqual(out, [{ field: "label", before: undefined, after: "L", kind: "added" }]);
});

test("a field dropped from the new row is removed", () => {
  const out = diffRows({ title: "A", label: "L" }, { title: "A" });

  assert.deepEqual(out, [{ field: "label", before: "L", after: undefined, kind: "removed" }]);
});

// Placement transforms arrive as nested objects; a reference comparison would
// call every one of them changed.
test("structurally equal nested values are not a change", () => {
  const out = diffRows({ position: { x: 1, y: 2 } }, { position: { x: 1, y: 2 } });

  assert.deepEqual(out, []);
});

test("a nested value that really changed is reported", () => {
  const out = diffRows({ position: { x: 1 } }, { position: { x: 9 } });

  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "changed");
});

// A null and an absent value are different states in the journal: the column
// exists and is empty vs. the column is gone.
test("null is distinguished from absent", () => {
  const out = diffRows({ label: null }, { label: "L" });

  assert.deepEqual(out, [{ field: "label", before: null, after: "L", kind: "changed" }]);
});

test("two nulls diff to nothing", () => {
  assert.deepEqual(diffRows(null, null), []);
});

// The no-op guard lives in Postgres, but a client must not crash on an entry
// that somehow carries identical snapshots.
test("identical rows diff to nothing", () => {
  assert.deepEqual(diffRows({ a: 1, b: "x" }, { a: 1, b: "x" }), []);
});
