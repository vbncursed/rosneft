// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { readExifGps } from "./exif-gps.ts";

type Rational = [number, number];
interface Fixture {
  le?: boolean;
  lat?: Rational[];
  latRef?: string;
  lon?: Rational[];
  lonRef?: string;
  alt?: Rational;
  altRef?: number;
}

const dms = (d: number, m: number, s: number): Rational[] => [
  [d, 1],
  [m, 1],
  [Math.round(s * 100), 100],
];

// Builds a minimal but structurally real JPEG: SOI, one APP1 "Exif\0\0"
// segment, a TIFF header whose IFD0 holds only the GPS-IFD pointer, and a GPS
// IFD whose RATIONAL values live in a data block past the entries.
function jpegWithGps(f: Fixture): Uint8Array {
  const le = f.le ?? true;
  const blocks: Rational[][] = [];
  const entries: { tag: number; type: number; count: number; inline?: number; block?: number }[] = [];

  if (f.latRef !== undefined) entries.push({ tag: 0x0001, type: 2, count: 2, inline: f.latRef.charCodeAt(0) });
  if (f.lat) { entries.push({ tag: 0x0002, type: 5, count: 3, block: blocks.length }); blocks.push(f.lat); }
  if (f.lonRef !== undefined) entries.push({ tag: 0x0003, type: 2, count: 2, inline: f.lonRef.charCodeAt(0) });
  if (f.lon) { entries.push({ tag: 0x0004, type: 5, count: 3, block: blocks.length }); blocks.push(f.lon); }
  if (f.altRef !== undefined) entries.push({ tag: 0x0005, type: 1, count: 1, inline: f.altRef });
  if (f.alt) { entries.push({ tag: 0x0006, type: 5, count: 1, block: blocks.length }); blocks.push([f.alt]); }

  const GPS_IFD = 26;
  const dataStart = GPS_IFD + 2 + entries.length * 12 + 4;
  const blockAt: number[] = [];
  let cursor = dataStart;
  for (const b of blocks) { blockAt.push(cursor); cursor += b.length * 8; }

  const tiff = new DataView(new ArrayBuffer(cursor));
  tiff.setUint16(0, le ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 42, le);
  tiff.setUint32(4, 8, le);
  tiff.setUint16(8, 1, le); // IFD0: one entry
  tiff.setUint16(10, 0x8825, le); // GPS IFD pointer
  tiff.setUint16(12, 4, le);
  tiff.setUint32(14, 1, le);
  tiff.setUint32(18, GPS_IFD, le);
  tiff.setUint32(22, 0, le); // no IFD1

  tiff.setUint16(GPS_IFD, entries.length, le);
  entries.forEach((e, i) => {
    const at = GPS_IFD + 2 + i * 12;
    tiff.setUint16(at, e.tag, le);
    tiff.setUint16(at + 2, e.type, le);
    tiff.setUint32(at + 4, e.count, le);
    // RATIONALs exceed 4 bytes so their value field holds an offset; ASCII and
    // BYTE values are inline, and EXIF packs them from the first byte of the
    // field regardless of endianness — which is how the parser reads them.
    if (e.block !== undefined) tiff.setUint32(at + 8, blockAt[e.block], le);
    else tiff.setUint8(at + 8, e.inline ?? 0);
  });
  blocks.forEach((b, i) => {
    b.forEach(([num, den], j) => {
      tiff.setUint32(blockAt[i] + j * 8, num, le);
      tiff.setUint32(blockAt[i] + j * 8 + 4, den, le);
    });
  });

  const tiffBytes = new Uint8Array(tiff.buffer);
  const out = new Uint8Array(12 + tiffBytes.length);
  const head = new DataView(out.buffer);
  head.setUint16(0, 0xffd8); // SOI
  head.setUint16(2, 0xffe1); // APP1
  head.setUint16(4, 8 + tiffBytes.length);
  out.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6); // "Exif\0\0"
  out.set(tiffBytes, 12);
  return out;
}

const MOSCOW: Fixture = {
  lat: dms(55, 45, 21), latRef: "N",
  lon: dms(37, 37, 4), lonRef: "E",
};

test("reads latitude and longitude as decimal degrees", () => {
  const fix = readExifGps(jpegWithGps(MOSCOW));
  assert.ok(fix !== null);
  assert.ok(Math.abs(fix.lat - (55 + 45 / 60 + 21 / 3600)) < 1e-9);
  assert.ok(Math.abs(fix.lon - (37 + 37 / 60 + 4 / 3600)) < 1e-9);
});

test("S and W reference letters negate the coordinate", () => {
  const fix = readExifGps(jpegWithGps({ ...MOSCOW, latRef: "S", lonRef: "W" }));
  assert.ok(fix !== null && fix.lat < 0 && fix.lon < 0);
});

test("parses big-endian (MM) TIFF as well as little-endian", () => {
  const be = readExifGps(jpegWithGps({ ...MOSCOW, le: false }));
  const leFix = readExifGps(jpegWithGps(MOSCOW));
  assert.ok(be !== null && leFix !== null);
  assert.ok(Math.abs(be.lat - leFix.lat) < 1e-9);
  assert.ok(Math.abs(be.lon - leFix.lon) < 1e-9);
});

test("altitude is absent when the GPS IFD carries no altitude tag", () => {
  assert.equal(readExifGps(jpegWithGps(MOSCOW))?.alt, null);
});

test("altitude reference 1 means below sea level", () => {
  assert.equal(readExifGps(jpegWithGps({ ...MOSCOW, alt: [120, 1], altRef: 0 }))?.alt, 120);
  assert.equal(readExifGps(jpegWithGps({ ...MOSCOW, alt: [120, 1], altRef: 1 }))?.alt, -120);
});

test("a zero denominator reads as 0 instead of Infinity or NaN", () => {
  const fix = readExifGps(jpegWithGps({ ...MOSCOW, lat: [[55, 1], [45, 0], [0, 1]] }));
  assert.ok(fix !== null && Number.isFinite(fix.lat));
  assert.equal(fix.lat, 55);
});

test("returns null for input that is not a JPEG", () => {
  assert.equal(readExifGps(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(readExifGps(new Uint8Array()), null);
});

test("returns null for a JPEG with no EXIF segment", () => {
  // SOI followed by a well-formed but non-APP1 segment.
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00]);
  assert.equal(readExifGps(bytes), null);
});

test("returns null when the GPS IFD is present but empty", () => {
  assert.equal(readExifGps(jpegWithGps({})), null);
});

test("returns null when the GPS IFD lacks a coordinate or its reference", () => {
  assert.equal(readExifGps(jpegWithGps({ lat: dms(55, 45, 21), latRef: "N" })), null);
  assert.equal(readExifGps(jpegWithGps({ ...MOSCOW, latRef: undefined })), null);
});

test("does not loop forever on a segment claiming zero length", () => {
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x00, 0xff, 0xe1]);
  assert.equal(readExifGps(bytes), null);
});
