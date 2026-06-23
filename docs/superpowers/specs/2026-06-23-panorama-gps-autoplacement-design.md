# Panorama GPS auto-placement — design

**Date:** 2026-06-23
**Status:** approved (design), pending implementation plan

## Problem

When an operator uploads a 360° panorama, its scene anchor (`position`)
defaults to the territory origin `(0,0,0)` and must be placed by hand.
The capture photos carry GPS EXIF (latitude, longitude, altitude), and the
territory's 3D model is georeferenced, so the anchor can be derived
automatically.

## Key finding: the model is georeferenced

The territory artifact's source bounding box (`bboxMin`/`bboxMax`, already
exposed by `GET /api/territories/{slug}/scene`) is in real-world **UTM
zone 38N (WGS84)** metres, after the converter's Z-up→Y-up swap:

- `x` = UTM easting
- `y` = elevation
- `z` = −(UTM northing)

Verified against `operation-center`: both demo photos project (UTM 38N)
to coordinates inside the model footprint, ~6.3 m apart, matching the GPS
delta.

```
operation-center footprint (source units, Y-up frame):
  bboxMin = { x: 417185.156, y: 360.763, z: -4061339 }
  bboxMax = { x: 417496.781, y: 430.414, z: -4061025 }
IMG_1 GPS 36.69177833, 44.07436117, 511.1 → UTM E417308.02 N4061080.36
IMG_2 GPS 36.69172167, 44.07436117, 510.6 → UTM E417307.96 N4061074.08
```

## The transform (source → scene)

The converter (`mesh-service/internal/converter/normalize.go`) bakes
center + uniform scale into every vertex:

```
center = (bboxMin + bboxMax) / 2          (per axis)
maxDim = max(dx, dy, dz)
scale  = 2 / maxDim
scene  = (source - center) * scale
```

So, for a GPS fix `(lat, lon, alt)`:

1. `zone   = floor((lon + 180) / 6) + 1`            (38 for this data)
2. `(E, N) = wgs84ToUtm(lat, lon, zone)`            (WGS84 forward TM)
3. `source = { x: E, y: alt, z: -N }`
4. in-footprint check: `bboxMin.x ≤ E ≤ bboxMax.x` **and**
   `bboxMin.z ≤ -N ≤ bboxMax.z` (horizontal only)
5. `scene  = (source - center) * (2 / maxDim)`

### Decisions

- **Altitude:** use GPS altitude for `y` (per user). Note the GPS altitude
  datum differs from the model (~115 m here), so the sphere sits above the
  terrain; acceptable because the panorama is a skybox (camera at sphere
  center) and `y` is fine-tuned manually if needed.
- **CRS:** derive the UTM zone from the photo's own longitude and **validate**
  by the footprint check. No CRS is stored per territory. If the projected
  point falls outside the footprint (wrong zone, non-UTM model, or a photo
  from elsewhere), auto-placement is skipped and the panorama is created at
  the origin for manual placement.
- **Trigger:** automatic on browser upload; manual editing (`position`
  fields, "Set from camera", yaw) is unchanged.

### Verification oracle

`IMG_1` must map to scene `≈ (-0.210, 0.736, 0.647)`; `IMG_2` to the same
`x`, slightly smaller `z` (computed from the real data above).

## Architecture (Approach A — frontend only)

No backend, OpenAPI, or DTO changes. Reuses the existing
`createPanorama` + `updatePanorama` gateway calls.

### New pure modules — `panorama/domain/`

- **`exif-gps.ts`** — `readExifGps(bytes: Uint8Array): GpsFix | null`.
  Parses a JPEG's EXIF APP1 → TIFF header (endianness) → IFD0 → GPS IFD
  (tag `0x8825`), reading `GPSLatitude(Ref)`, `GPSLongitude(Ref)`,
  `GPSAltitude(Ref)`. Returns `null` for non-JPEG, missing EXIF, or
  missing GPS. `GpsFix = { lat: number; lon: number; alt: number | null }`.
- **`geo-anchor.ts`** — `gpsToScenePosition(fix: GpsFix, bbox: SourceBbox):
  Vec3 | null`. Contains the WGS84→UTM forward projection (zone from
  longitude) and the source→scene normalize transform with the in-footprint
  guard. `SourceBbox = { min: Vec3; max: Vec3 }`. Returns `null` when the
  point is outside the footprint. Altitude missing → `y` uses bbox-center
  height (the model midpoint) rather than failing.

### Modified files

- **`app/territories/[slug]/panoramas/new/page.tsx`** — replace
  `getTerritory(slug)` with `getSceneBundle(slug)`; pass
  `sourceBbox = artifact?.bboxMin && artifact?.bboxMax ? { min, max } : null`
  and `territoryTitle` to the form. `null` bbox (unconverted territory)
  disables auto-placement gracefully.
- **`panorama/presentation/components/panorama-upload-form.tsx`** — accept a
  `sourceBbox: SourceBbox | null` prop. In `onSubmit`, after `upload(file)`:
  read EXIF from `file.slice(0, 256 * 1024)` (head only, not the whole
  40 MB), compute `position` via `gpsToScenePosition`, `createPanorama`,
  then if `position` is non-null `updatePanorama(slug, created.id, { title,
  position, yawOffset: 0 })`. Toast outcomes (see below).

## Data flow

```
new/page.tsx (RSC)
  → getSceneBundle(slug) → sourceBbox
  → PanoramaUploadForm(sourceBbox)
      → upload(file) → blob.hash
      → readExifGps(file head) → GpsFix | null
      → gpsToScenePosition(fix, sourceBbox) → Vec3 | null
      → createPanorama(title, hash)
      → if position: updatePanorama(id, { title, position, yawOffset: 0 })
      → redirect to viewer
```

## Error handling / UX

| Case | Result | Toast |
| --- | --- | --- |
| JPEG, GPS inside footprint | position set | ✅ "Panorama placed from GPS" |
| No GPS / PNG / no EXIF | created at origin | ℹ️ "Uploaded — set its position manually" |
| GPS outside footprint, or `sourceBbox` null | created at origin | ℹ️ "Photo location doesn't match this territory — set position manually" |
| `updatePanorama` fails | created at origin | ❌ error toast; manual fallback |

Upload never fails because of GPS: extraction/projection errors are caught
and treated as "no position".

### Backend PUT note (to verify in implementation)

`updatePanorama` is a full PUT. The body must include `title` (and
`yawOffset: 0`) alongside `position` so the update does not clobber the
title with an empty string. Confirm `update_panorama` field semantics
during implementation.

## Testing

The frontend has no test runner. Verify the two pure modules with a
one-off Node/tsx script against the oracle above (`IMG_1 →
≈(-0.210, 0.736, 0.647)`), plus `yarn lint` and `yarn build`. The two
existing `IMG 1` / `IMG 2` panoramas (currently at origin) are re-uploaded
by the operator to pick up auto-placement.

## Out of scope

- Server-side EXIF reading / backfill of already-stored panoramas without
  re-upload (Approach B).
- Storing an explicit CRS/EPSG per territory.
- Vertical-datum calibration offset.
- File-size cap: every new/changed file stays under the 200-line limit;
  split `exif-gps.ts` if it approaches the cap.
