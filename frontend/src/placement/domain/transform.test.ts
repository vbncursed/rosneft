// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { radToDeg, degToRad, roundAxis } from "./transform.ts";

test("radToDeg maps the quarter turns the form offers", () => {
  assert.equal(radToDeg(0), 0);
  assert.equal(radToDeg(Math.PI / 2), 90);
  assert.equal(radToDeg(Math.PI), 180);
  assert.equal(radToDeg(-Math.PI), -180);
});

test("degToRad is the inverse of radToDeg", () => {
  for (const deg of [0, 45, 90, 180, 270, -90, 12.5]) {
    assert.ok(Math.abs(radToDeg(degToRad(deg)) - deg) < 1e-9, `${deg}° did not round-trip`);
  }
});

test("roundAxis trims to 4 decimals", () => {
  assert.equal(roundAxis(1.234567), 1.2346);
  assert.equal(roundAxis(-1.234549), -1.2345);
  assert.equal(roundAxis(2), 2);
});

test("roundAxis returns a number, never the string toFixed produces", () => {
  assert.equal(typeof roundAxis(0.1 + 0.2), "number");
  // 0.30000000000000004 is exactly the float noise a drag writes back.
  assert.equal(roundAxis(0.1 + 0.2), 0.3);
});

test("roundAxis keeps sub-millimetre placement at converter scale", () => {
  // Scene units are normalised to max-axis = 2, so 1e-4 is well under a mm
  // on any real territory — the value must survive rounding.
  assert.equal(roundAxis(0.0001), 0.0001);
  assert.equal(roundAxis(0.00004), 0);
});
