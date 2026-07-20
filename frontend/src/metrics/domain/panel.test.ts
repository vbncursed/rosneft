// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { RANGES, RANGE_SECONDS, isRange, stepSeconds } from "./panel.ts";

test("stepSeconds: never finer than the 15s scrape interval", () => {
  for (const r of RANGES) assert.ok(stepSeconds(r) >= 15, `${r} стал мельче скрейпа`);
});

test("stepSeconds: is a whole number of scrape intervals", () => {
  for (const r of RANGES) assert.equal(stepSeconds(r) % 15, 0, `${r} не кратен 15`);
});

test("stepSeconds: keeps every range near 200 points", () => {
  for (const r of RANGES) {
    const points = RANGE_SECONDS[r] / stepSeconds(r);
    assert.ok(points >= 150 && points <= 250, `${r} даёт ${points} точек`);
  }
});

test("isRange: accepts the four known ranges and rejects anything else", () => {
  assert.equal(isRange("6h"), true);
  assert.equal(isRange("7d"), true);
  assert.equal(isRange("99y"), false);
  assert.equal(isRange(""), false);
});
