// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { gpsToScenePosition, type SourceBbox } from "./geo-anchor.ts";

// On the central meridian of zone 31 (lon 3°E) at the equator the transverse
// Mercator series collapses to the false easting exactly: easting = 500000,
// northing = 0. Every fixture below is built around that anchor so the
// expected scene coordinates stay analytic.
const ORIGIN = { lat: 0, lon: 3, alt: null };

// 200 m across in x and z, 100 m tall — max axis is 200, so scale = 2/200.
const BBOX: SourceBbox = {
  min: { x: 499900, y: -50, z: -100 },
  max: { x: 500100, y: 50, z: 100 },
};

test("a fix at the bbox centre lands at the scene origin", () => {
  // z is -0: scene z negates the northing, and the northing here is exactly 0.
  assert.deepEqual(gpsToScenePosition(ORIGIN, BBOX), { x: 0, y: 0, z: -0 });
});

test("altitude drives y, scaled by the same 2/maxDim factor", () => {
  // alt 50 m above a bbox centred at y=0 → 50 * (2/200) = 0.5
  assert.equal(gpsToScenePosition({ ...ORIGIN, alt: 50 }, BBOX)?.y, 0.5);
  assert.equal(gpsToScenePosition({ ...ORIGIN, alt: -50 }, BBOX)?.y, -0.5);
});

test("a missing altitude falls back to the bbox centre, not to zero", () => {
  const raised: SourceBbox = {
    min: { x: 499900, y: 100, z: -100 },
    max: { x: 500100, y: 300, z: 100 },
  };
  // Centre y is 200; with alt null the fix sits there, i.e. scene y = 0.
  assert.equal(gpsToScenePosition(ORIGIN, raised)?.y, 0);
});

test("returns null when the projected point falls outside the footprint", () => {
  // Zone 31 easting for lon 3.01°E is ~1.1 km east of the 100 m bbox edge.
  assert.equal(gpsToScenePosition({ lat: 0, lon: 3.01, alt: null }, BBOX), null);
  // Far north of the footprint: northing grows, scene z = -northing shrinks.
  assert.equal(gpsToScenePosition({ lat: 0.01, lon: 3, alt: null }, BBOX), null);
});

test("returns null for a degenerate bbox instead of dividing by zero", () => {
  const flat: SourceBbox = {
    min: { x: 500000, y: 0, z: 0 },
    max: { x: 500000, y: 0, z: 0 },
  };
  assert.equal(gpsToScenePosition(ORIGIN, flat), null);
});

test("scene z is the negated northing — the converter's Y-up frame", () => {
  // A fix just north of the equator has positive northing, so its scene z
  // must be negative.
  const wide: SourceBbox = {
    min: { x: 499000, y: -50, z: -2000 },
    max: { x: 501000, y: 50, z: 2000 },
  };
  const north = gpsToScenePosition({ lat: 0.005, lon: 3, alt: null }, wide);
  assert.ok(north !== null && north.z < 0, "north of the equator should map to negative z");
});

test("scene x grows eastward", () => {
  const wide: SourceBbox = {
    min: { x: 499000, y: -50, z: -2000 },
    max: { x: 501000, y: 50, z: 2000 },
  };
  const east = gpsToScenePosition({ lat: 0, lon: 3.004, alt: null }, wide);
  assert.ok(east !== null && east.x > 0, "east of the meridian should map to positive x");
});

test("the southern hemisphere carries the 10 000 km false northing", () => {
  // Same distance south of the equator, so northing ≈ 10 000 000 − N.
  const south: SourceBbox = {
    min: { x: 499000, y: -50, z: -10_001_000 },
    max: { x: 501000, y: 50, z: -9_999_000 },
  };
  assert.notEqual(gpsToScenePosition({ lat: -0.005, lon: 3, alt: null }, south), null);
});

test("projects a real-world fix into zone 18N at the published easting", () => {
  // Manhattan, 40.7128N 74.0060W → zone 18N, easting ≈ 583 960 m. The box is
  // 20 m wide in x, so only a correct zone and central meridian pass; the
  // northing bound is deliberately loose (±1 km) because it is a coarse
  // meridian-arc cross-check, not a published figure.
  const nyc: SourceBbox = {
    min: { x: 583_950, y: 0, z: -4_508_351 },
    max: { x: 583_970, y: 100, z: -4_506_351 },
  };
  assert.notEqual(gpsToScenePosition({ lat: 40.7128, lon: -74.006, alt: 10 }, nyc), null);
});

test("a western longitude picks a different zone than an eastern one", () => {
  // Same |lon| either side of Greenwich must not project to the same easting:
  // a zone-number sign error would collapse them.
  const wide: SourceBbox = {
    min: { x: -1e9, y: -1e9, z: -1e9 },
    max: { x: 1e9, y: 1e9, z: 1e9 },
  };
  const west = gpsToScenePosition({ lat: 40, lon: -74, alt: 0 }, wide);
  const east = gpsToScenePosition({ lat: 40, lon: 74, alt: 0 }, wide);
  assert.ok(west !== null && east !== null);
  assert.notEqual(west.x, east.x);
});
