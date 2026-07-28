// Run with: yarn test:spa  (vitest — resolves the `@/` alias the module uses).
import { test, vi } from "vitest";
import assert from "node:assert/strict";

import { exifScenePosition } from "./exif-scene-position";
import type { SourceBbox } from "@/panorama/domain/geo-anchor";

// Centred on the zone-31 central meridian at the equator, where the UTM
// projection is exactly (500000, 0) — see geo-anchor.test.ts.
const BBOX: SourceBbox = {
  min: { x: 499900, y: -50, z: -100 },
  max: { x: 500100, y: 50, z: 100 },
};

// A File stand-in whose slice() records what the caller asked for.
function file(bytes: Uint8Array) {
  const sliced: [number, number][] = [];
  const f = {
    slice: (start: number, end: number) => {
      sliced.push([start, end]);
      return { arrayBuffer: async () => bytes.buffer.slice(start, end) };
    },
  } as unknown as File;
  return { f, sliced };
}

vi.mock("@/panorama/domain/exif-gps", () => ({
  readExifGps: (bytes: Uint8Array) =>
    bytes.length && bytes[0] === 0xff ? { lat: 0, lon: 3, alt: 25 } : null,
}));

const WITH_GPS = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
const NO_GPS = Uint8Array.from([0x00, 0x00, 0x00, 0x00]);

test("maps a GPS fix inside the footprint to a scene position", async () => {
  const { f } = file(WITH_GPS);
  const res = await exifScenePosition(f, BBOX);
  assert.deepEqual(res.position, { x: 0, y: 0.25, z: -0 });
});

test("reports no-gps when the photo carries no fix", async () => {
  const { f } = file(NO_GPS);
  assert.deepEqual(await exifScenePosition(f, BBOX), { position: null, reason: "no-gps" });
});

test("reports no-gps when the territory has no bbox to anchor against", async () => {
  const { f } = file(WITH_GPS);
  assert.deepEqual(await exifScenePosition(f, null), { position: null, reason: "no-gps" });
});

test("reports outside when the fix falls beyond the model footprint", async () => {
  const far: SourceBbox = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
  const { f } = file(WITH_GPS);
  assert.deepEqual(await exifScenePosition(f, far), { position: null, reason: "outside" });
});

test("reads only the first 256 KB — EXIF lives near the head of the file", async () => {
  const { f, sliced } = file(WITH_GPS);
  await exifScenePosition(f, BBOX);
  assert.deepEqual(sliced, [[0, 256 * 1024]]);
});

test("does not touch the file at all when there is no bbox", async () => {
  const { f, sliced } = file(WITH_GPS);
  await exifScenePosition(f, null);
  assert.deepEqual(sliced, [], "a multi-MB read before the cheap null check is wasted work");
});
