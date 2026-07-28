// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { isPdfSignature } from "./pdf-signature.ts";

const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

test("accepts bytes opening with the %PDF- magic", () => {
  assert.equal(isPdfSignature(PDF), true);
});

test("rejects a ZIP renamed to .pdf — the case the sniff exists for", () => {
  assert.equal(isPdfSignature(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14])), false);
});

test("rejects a prefix shorter than the magic, without reading past the end", () => {
  assert.equal(isPdfSignature(Uint8Array.from([0x25, 0x50, 0x44, 0x46])), false);
  assert.equal(isPdfSignature(new Uint8Array()), false);
});

test("rejects when the magic appears past the first byte", () => {
  assert.equal(isPdfSignature(Uint8Array.from([0x00, 0x25, 0x50, 0x44, 0x46, 0x2d])), false);
});
