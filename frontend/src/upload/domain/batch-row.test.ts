// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveTitle } from "./batch-row.ts";

test("strips the .zip extension and keeps casing and word breaks", () => {
  assert.equal(deriveTitle("MyBuilding-v2.zip"), "MyBuilding-v2");
});

test("strips .ZIP regardless of case", () => {
  assert.equal(deriveTitle("Tower.ZIP"), "Tower");
  assert.equal(deriveTitle("Tower.Zip"), "Tower");
});

test("only strips a trailing .zip, not one mid-name", () => {
  assert.equal(deriveTitle("archive.zip.backup"), "archive.zip.backup");
  assert.equal(deriveTitle("v1.zip.zip"), "v1.zip");
});

test("leaves a non-zip extension alone", () => {
  assert.equal(deriveTitle("scan.glb"), "scan.glb");
});

test("trims surrounding whitespace", () => {
  assert.equal(deriveTitle("  spaced.zip  "), "spaced");
});

test("survives a name that is nothing but the extension", () => {
  assert.equal(deriveTitle(".zip"), "");
});
