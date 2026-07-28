// Run with: yarn test:spa  (vitest — assetUrl reads import.meta.env, which the
// node runner does not provide).
import { test } from "vitest";
import assert from "node:assert/strict";

import { pickLodUrl, lodUrl } from "./lod-url";
import type { LodArtifact } from "@/shared/domain/lod-artifact";

const BASE = "http://localhost:8080/api/assets";
const lod = (n: number, hash = `h${n}`): LodArtifact => ({ lod: n, hash, size: 1 });

test("lodUrl points at the gateway's asset endpoint", () => {
  assert.equal(lodUrl(lod(0, "deadbeef")), `${BASE}/deadbeef`);
});

test("lodUrl percent-encodes the hash — it lands in a path segment", () => {
  assert.equal(lodUrl(lod(0, "a/b?c")), `${BASE}/a%2Fb%3Fc`);
});

test("pickLodUrl defaults to LOD0 — the main scene asset is never simplified", () => {
  assert.equal(pickLodUrl([lod(0), lod(1), lod(2)]), `${BASE}/h0`);
});

test("pickLodUrl resolves the requested level", () => {
  assert.equal(pickLodUrl([lod(0), lod(1), lod(2)], 2), `${BASE}/h2`);
});

test("pickLodUrl falls back to the nearest available level", () => {
  assert.equal(pickLodUrl([lod(0), lod(2)], 1), `${BASE}/h0`);
});

test("pickLodUrl returns null for an empty chain — asset not converted yet", () => {
  assert.equal(pickLodUrl([]), null);
});
