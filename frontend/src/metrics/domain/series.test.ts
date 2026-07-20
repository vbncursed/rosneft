// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { toRows, formatValue, type Series } from "./series.ts";

const a: Series = { label: "auth", points: [{ t: 10, v: 1 }, { t: 20, v: 2 }] };
const b: Series = { label: "gateway", points: [{ t: 20, v: 5 }, { t: 30, v: 6 }] };

test("toRows: merges series onto a shared, sorted time axis", () => {
  assert.deepEqual(toRows([a, b]), [
    { t: 10, auth: 1 },
    { t: 20, auth: 2, gateway: 5 },
    { t: 30, gateway: 6 },
  ]);
});

test("toRows: empty input yields no rows", () => {
  assert.deepEqual(toRows([]), []);
  assert.deepEqual(toRows([{ label: "x", points: [] }]), []);
});

test("formatValue: renders each unit in a compact, human form", () => {
  assert.equal(formatValue(142.4, "rps"), "142/s");
  assert.equal(formatValue(0.0512, "percent"), "5.1%");
  assert.equal(formatValue(0.0034, "seconds"), "3ms");
  assert.equal(formatValue(2.5, "seconds"), "2.50s");
  assert.equal(formatValue(1610612736, "bytes"), "1.5 GB");
  assert.equal(formatValue(12.25, "mbps"), "12.3 MB/s");
  assert.equal(formatValue(30, "cpm"), "30/min");
  assert.equal(formatValue(7, "count"), "7");
});

test("formatValue: no data reads as a dash, not NaN", () => {
  assert.equal(formatValue(Number.NaN, "rps"), "—");
});
