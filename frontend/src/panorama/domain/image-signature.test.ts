// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { isEquirectImageSignature } from "./image-signature.ts";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test("accepts JPEG (FF D8 FF), whatever the fourth byte is", () => {
  assert.equal(isEquirectImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(isEquirectImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])), true);
});

test("accepts the full 8-byte PNG signature", () => {
  assert.equal(isEquirectImageSignature(Uint8Array.from(PNG)), true);
});

test("rejects a ZIP renamed to .jpg — the case the sniff exists for", () => {
  assert.equal(isEquirectImageSignature(Uint8Array.from([0x50, 0x4b, 0x03, 0x04])), false);
});

test("rejects a truncated PNG signature", () => {
  assert.equal(isEquirectImageSignature(Uint8Array.from(PNG.slice(0, 7))), false);
});

test("rejects a truncated JPEG marker and an empty buffer", () => {
  assert.equal(isEquirectImageSignature(Uint8Array.from([0xff, 0xd8])), false);
  assert.equal(isEquirectImageSignature(new Uint8Array()), false);
});

test("rejects GIF, which decodes as an image but is not an equirect source", () => {
  assert.equal(isEquirectImageSignature(Uint8Array.from([0x47, 0x49, 0x46, 0x38])), false);
});
