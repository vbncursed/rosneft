import type { Vec3 } from "@/shared/domain/vec3";

// A GPS fix extracted from a photo's EXIF. Altitude may be absent.
export interface GpsFix {
  lat: number;
  lon: number;
  alt: number | null;
}

// The territory model's source-unit bounding box, as exposed by the
// artifact. It is already in the converter's Y-up frame: x = UTM easting,
// y = elevation, z = -(UTM northing).
export interface SourceBbox {
  min: Vec3;
  max: Vec3;
}

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const E2 = WGS84_F * (2 - WGS84_F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const FALSE_EASTING = 500000;
const FALSE_NORTHING_SOUTH = 10000000;
const DEG = Math.PI / 180;

interface Utm {
  easting: number;
  northing: number;
}

// utmZone returns the 6°-wide UTM zone number for a longitude.
function utmZone(lon: number): number {
  return Math.floor((lon + 180) / 6) + 1;
}

// wgs84ToUtm projects WGS84 lat/lon (degrees) to UTM easting/northing
// (metres) for the given zone using the standard truncated transverse-
// Mercator series — sub-metre accurate at these latitudes.
function wgs84ToUtm(lat: number, lon: number, zone: number): Utm {
  const phi = lat * DEG;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * DEG;
  const n = WGS84_A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
  const t = Math.tan(phi) ** 2;
  const c = EP2 * Math.cos(phi) ** 2;
  const a = (lon * DEG - lon0) * Math.cos(phi);
  const m =
    WGS84_A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) *
        Math.sin(2 * phi) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi));
  const easting =
    FALSE_EASTING +
    K0 *
      n *
      (a +
        ((1 - t + c) * a ** 3) / 6 +
        ((5 - 18 * t + t ** 2 + 72 * c - 58 * EP2) * a ** 5) / 120);
  let northing =
    K0 *
    (m +
      n *
        Math.tan(phi) *
        (a ** 2 / 2 +
          ((5 - t + 9 * c + 4 * c ** 2) * a ** 4) / 24 +
          ((61 - 58 * t + t ** 2 + 600 * c - 330 * EP2) * a ** 6) / 720));
  if (lat < 0) northing += FALSE_NORTHING_SOUTH;
  return { easting, northing };
}

// gpsToScenePosition converts a GPS fix into the territory's normalized
// scene coordinates, or null when the projected point falls outside the
// model footprint (wrong CRS, distant photo, etc.). Mirrors the converter's
// normalize(): center on the bbox midpoint, scale so the largest axis spans
// 2 units. Altitude drives y; when absent, y falls back to the bbox center.
export function gpsToScenePosition(
  fix: GpsFix,
  bbox: SourceBbox,
): Vec3 | null {
  const { easting, northing } = wgs84ToUtm(fix.lat, fix.lon, utmZone(fix.lon));
  const sx = easting;
  const sz = -northing;
  if (sx < bbox.min.x || sx > bbox.max.x || sz < bbox.min.z || sz > bbox.max.z) {
    return null;
  }
  const cx = (bbox.min.x + bbox.max.x) / 2;
  const cy = (bbox.min.y + bbox.max.y) / 2;
  const cz = (bbox.min.z + bbox.max.z) / 2;
  const maxDim = Math.max(
    bbox.max.x - bbox.min.x,
    bbox.max.y - bbox.min.y,
    bbox.max.z - bbox.min.z,
  );
  if (maxDim <= 0) return null;
  const scale = 2 / maxDim;
  const sy = fix.alt ?? cy;
  return { x: (sx - cx) * scale, y: (sy - cy) * scale, z: (sz - cz) * scale };
}
