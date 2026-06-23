// Minimal EXIF GPS reader for JPEG panoramas. Parses just enough of the
// APP1 / TIFF / GPS-IFD structure to recover latitude, longitude and
// altitude. Returns null for non-JPEG input, missing EXIF, or missing GPS.
import type { GpsFix } from "@/panorama/domain/geo-anchor";

const SOI = 0xffd8;
const APP1 = 0xffe1;

interface Reader {
  view: DataView;
  le: boolean; // little-endian TIFF
  tiff: number; // absolute byte offset of the TIFF header
}

// findExifTiff locates the TIFF header inside the first APP1 "Exif\0\0"
// segment and returns its absolute byte offset, or -1.
function findExifTiff(view: DataView): number {
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return -1;
  let off = 2;
  while (off + 4 <= view.byteLength) {
    const marker = view.getUint16(off);
    const size = view.getUint16(off + 2);
    if (
      marker === APP1 &&
      off + 10 <= view.byteLength &&
      view.getUint32(off + 4) === 0x45786966 && // "Exif"
      view.getUint16(off + 8) === 0x0000
    ) {
      return off + 10;
    }
    if (size < 2) return -1;
    off += 2 + size;
  }
  return -1;
}

function u16(r: Reader, off: number): number {
  return r.view.getUint16(off, r.le);
}
function u32(r: Reader, off: number): number {
  return r.view.getUint32(off, r.le);
}

// rationals reads `count` EXIF RATIONALs for the entry at `entry`. The
// 12-byte entry's value field holds an offset (relative to the TIFF header)
// because GPS coordinates exceed 4 bytes (3 rationals = 24 bytes).
function rationals(r: Reader, entry: number, count: number): number[] {
  const ptr = r.tiff + u32(r, entry + 8);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const num = u32(r, ptr + i * 8);
    const den = u32(r, ptr + i * 8 + 4);
    out.push(den === 0 ? 0 : num / den);
  }
  return out;
}

// findEntry returns the byte offset of the IFD entry whose tag matches, or
// -1. An IFD is a 2-byte count followed by 12-byte entries.
function findEntry(r: Reader, ifd: number, tag: number): number {
  const n = u16(r, ifd);
  for (let i = 0; i < n; i++) {
    const entry = ifd + 2 + i * 12;
    if (u16(r, entry) === tag) return entry;
  }
  return -1;
}

function dms(values: number[]): number {
  const [d = 0, m = 0, s = 0] = values;
  return d + m / 60 + s / 3600;
}

export function readExifGps(bytes: Uint8Array): GpsFix | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tiff = findExifTiff(view);
  if (tiff < 0 || tiff + 8 > view.byteLength) return null;
  const bom = view.getUint16(tiff);
  const le = bom === 0x4949;
  if (!le && bom !== 0x4d4d) return null;
  const r: Reader = { view, le, tiff };
  const ifd0 = tiff + u32(r, tiff + 4);
  const gpsPtr = findEntry(r, ifd0, 0x8825);
  if (gpsPtr < 0) return null;
  const gps = tiff + u32(r, gpsPtr + 8);
  const latE = findEntry(r, gps, 0x0002);
  const lonE = findEntry(r, gps, 0x0004);
  const latRef = findEntry(r, gps, 0x0001);
  const lonRef = findEntry(r, gps, 0x0003);
  if (latE < 0 || lonE < 0 || latRef < 0 || lonRef < 0) return null;
  let lat = dms(rationals(r, latE, 3));
  let lon = dms(rationals(r, lonE, 3));
  if (String.fromCharCode(view.getUint8(latRef + 8)) === "S") lat = -lat;
  if (String.fromCharCode(view.getUint8(lonRef + 8)) === "W") lon = -lon;
  let alt: number | null = null;
  const altE = findEntry(r, gps, 0x0006);
  if (altE >= 0) {
    alt = rationals(r, altE, 1)[0] ?? null;
    const altRef = findEntry(r, gps, 0x0005);
    if (alt !== null && altRef >= 0 && view.getUint8(altRef + 8) === 1) {
      alt = -alt;
    }
  }
  return { lat, lon, alt };
}
