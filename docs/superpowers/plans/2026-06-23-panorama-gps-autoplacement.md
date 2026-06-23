# Panorama GPS Auto-Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-set a newly uploaded panorama's scene anchor from its photo's EXIF GPS, using the territory model's UTM georeference.

**Architecture:** Frontend-only. Two pure `panorama/domain` modules (EXIF GPS reader, GPS→scene projection) plus a thin `panorama/application` glue function. The `/panoramas/new` RSC passes the territory artifact's source bbox to the upload form; the form reads EXIF from the file head, computes the scene position, and includes it in the existing `createPanorama` call (backend already accepts `position`).

**Tech Stack:** Next.js 16 / React 19 / TypeScript. No new dependencies. Verification via `node --experimental-strip-types` against the real demo photos (no test runner in the frontend).

## Global Constraints

- File size cap: **200 lines** per file (ESLint `max-lines`, skipBlankLines + skipComments).
- Clean Architecture layers: pure logic in `domain/`, orchestration in `application/`, React in `presentation/`; routes (`app/**`) may import gateways directly.
- Modern TS only; no new npm dependencies (project self-hosts everything).
- All user-facing copy in English (matches existing UI).
- `@/*` → `frontend/src/*`. All commands run from `frontend/`.
- Verification oracle (real data, `operation-center`):
  - bbox source units: `min {x:417185.15625, y:360.7630310058594, z:-4061339}`, `max {x:417496.78125, y:430.4139099121094, z:-4061025}`
  - `IMG_1` GPS `36.69177833, 44.07436117, 511.1` → scene `(-0.2099, 0.7357, 0.6474)`
  - `IMG_2` GPS `36.69172167, 44.07436117, 510.6` → scene `(-0.2102, 0.7326, 0.6874)`

---

## File Structure

- Create `frontend/src/panorama/domain/geo-anchor.ts` — UTM projection + GPS→scene transform with footprint guard. Owns `GpsFix`, `SourceBbox`.
- Create `frontend/src/panorama/domain/exif-gps.ts` — minimal JPEG EXIF GPS reader.
- Create `frontend/src/panorama/application/exif-scene-position.ts` — reads the file head and composes the two domain helpers into a `{position}|{position:null;reason}` result.
- Modify `frontend/src/app/territories/[slug]/panoramas/new/page.tsx` — fetch bbox via `getSceneBundle`, pass `sourceBbox` to the form.
- Modify `frontend/src/panorama/presentation/components/panorama-upload-form.tsx` — accept `sourceBbox`, compute position, pass it to `createPanorama`, message the outcome.
- Throwaway: `frontend/scripts/verify-geo.mts` — node verification harness (created, run, **deleted**; never committed).

---

### Task 1: GPS→scene projection (`geo-anchor.ts`)

**Files:**
- Create: `frontend/src/panorama/domain/geo-anchor.ts`
- Test (throwaway): `frontend/scripts/verify-geo.mts`

**Interfaces:**
- Produces:
  - `interface GpsFix { lat: number; lon: number; alt: number | null }`
  - `interface SourceBbox { min: Vec3; max: Vec3 }`
  - `function gpsToScenePosition(fix: GpsFix, bbox: SourceBbox): Vec3 | null`

- [ ] **Step 1: Write the failing test** — `frontend/scripts/verify-geo.mts`

```ts
import { gpsToScenePosition, type SourceBbox } from "../src/panorama/domain/geo-anchor.ts";

const BBOX: SourceBbox = {
  min: { x: 417185.15625, y: 360.7630310058594, z: -4061339 },
  max: { x: 417496.78125, y: 430.4139099121094, z: -4061025 },
};
const near = (a: number, b: number, t: number) => Math.abs(a - b) <= t;

const p1 = gpsToScenePosition(
  { lat: 36.69177833333333, lon: 44.07436116666667, alt: 511.1 },
  BBOX,
);
const ok =
  !!p1 &&
  near(p1.x, -0.2099, 0.01) &&
  near(p1.y, 0.7357, 0.01) &&
  near(p1.z, 0.6474, 0.01);
console.log("geo-anchor IMG_1 scene:", JSON.stringify(p1), ok ? "PASS" : "FAIL");

// Out-of-footprint point (far away) must return null.
const pOut = gpsToScenePosition({ lat: 0, lon: 0, alt: 0 }, BBOX);
console.log("out-of-footprint:", pOut === null ? "PASS" : "FAIL");

process.exit(ok && pOut === null ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/verify-geo.mts`
Expected: FAIL — cannot find module `../src/panorama/domain/geo-anchor.ts`.

- [ ] **Step 3: Write minimal implementation** — `frontend/src/panorama/domain/geo-anchor.ts`

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/verify-geo.mts`
Expected: `geo-anchor IMG_1 scene: {"x":-0.209...,"y":0.735...,"z":0.647...} PASS` and `out-of-footprint: PASS`, exit 0.

- [ ] **Step 5: Commit** (commit only the module — the verify script stays uncommitted)

```bash
git add src/panorama/domain/geo-anchor.ts
git commit -m "feat(panorama): GPS→scene projection from UTM-georeferenced bbox"
```

---

### Task 2: EXIF GPS reader (`exif-gps.ts`)

**Files:**
- Create: `frontend/src/panorama/domain/exif-gps.ts`
- Test (throwaway): extend `frontend/scripts/verify-geo.mts`

**Interfaces:**
- Consumes: `GpsFix` from `@/panorama/domain/geo-anchor` (type-only import).
- Produces: `function readExifGps(bytes: Uint8Array): GpsFix | null`

- [ ] **Step 1: Write the failing test** — replace `frontend/scripts/verify-geo.mts` with the end-to-end version reading the real photos

```ts
import { readFileSync } from "node:fs";
import { gpsToScenePosition, type SourceBbox } from "../src/panorama/domain/geo-anchor.ts";
import { readExifGps } from "../src/panorama/domain/exif-gps.ts";

const BBOX: SourceBbox = {
  min: { x: 417185.15625, y: 360.7630310058594, z: -4061339 },
  max: { x: 417496.78125, y: 430.4139099121094, z: -4061025 },
};
const near = (a: number, b: number, t: number) => Math.abs(a - b) <= t;

const cases = [
  { file: "../../photos/IMG_1.jpg", lat: 36.691778, lon: 44.074361, alt: 511.1, scene: { x: -0.2099, y: 0.7357, z: 0.6474 } },
  { file: "../../photos/IMG_2.jpg", lat: 36.691722, lon: 44.074361, alt: 510.6, scene: { x: -0.2102, y: 0.7326, z: 0.6874 } },
];

let ok = true;
for (const c of cases) {
  const buf = readFileSync(new URL(c.file, import.meta.url));
  const head = new Uint8Array(buf.subarray(0, 256 * 1024));
  const fix = readExifGps(head);
  const exifOk =
    !!fix &&
    near(fix.lat, c.lat, 1e-4) &&
    near(fix.lon, c.lon, 1e-4) &&
    near(fix.alt ?? -999, c.alt, 0.5);
  const pos = fix ? gpsToScenePosition(fix, BBOX) : null;
  const posOk =
    !!pos &&
    near(pos.x, c.scene.x, 0.01) &&
    near(pos.y, c.scene.y, 0.01) &&
    near(pos.z, c.scene.z, 0.01);
  console.log(c.file, "exif", exifOk, JSON.stringify(fix), "scene", posOk, JSON.stringify(pos));
  ok = ok && exifOk && posOk;
}
console.log(ok ? "ALL PASS" : "FAIL");
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/verify-geo.mts`
Expected: FAIL — cannot find module `../src/panorama/domain/exif-gps.ts`.

- [ ] **Step 3: Write minimal implementation** — `frontend/src/panorama/domain/exif-gps.ts`

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/verify-geo.mts`
Expected: both lines end `exif true ... scene true ...` and a final `ALL PASS`, exit 0.

- [ ] **Step 5: Commit** (module only)

```bash
git add src/panorama/domain/exif-gps.ts
git commit -m "feat(panorama): minimal JPEG EXIF GPS reader"
```

---

### Task 3: Wire auto-placement into upload (glue + page + form)

**Files:**
- Create: `frontend/src/panorama/application/exif-scene-position.ts`
- Modify: `frontend/src/app/territories/[slug]/panoramas/new/page.tsx`
- Modify: `frontend/src/panorama/presentation/components/panorama-upload-form.tsx`
- Delete (cleanup): `frontend/scripts/verify-geo.mts`

**Interfaces:**
- Consumes: `readExifGps` (`@/panorama/domain/exif-gps`), `gpsToScenePosition`, `SourceBbox` (`@/panorama/domain/geo-anchor`), `getSceneBundle` (`@/territory/infrastructure/territory-gateway`), `createPanorama` (`@/panorama/infrastructure/panorama-gateway`).
- Produces:
  - `type ScenePositionResult = { position: Vec3 } | { position: null; reason: "no-gps" | "outside" }`
  - `function exifScenePosition(file: File, bbox: SourceBbox | null): Promise<ScenePositionResult>`

- [ ] **Step 1: Create the glue module** — `frontend/src/panorama/application/exif-scene-position.ts`

```ts
import { readExifGps } from "@/panorama/domain/exif-gps";
import {
  gpsToScenePosition,
  type SourceBbox,
} from "@/panorama/domain/geo-anchor";
import type { Vec3 } from "@/shared/domain/vec3";

export type ScenePositionResult =
  | { position: Vec3 }
  | { position: null; reason: "no-gps" | "outside" };

// exifScenePosition reads the file's EXIF GPS (head bytes only — EXIF lives
// near the start, so 256 KB avoids loading the whole multi-MB image) and
// maps it to the territory's scene coordinates. Returns a reason when no
// usable position is found so the caller can message precisely.
export async function exifScenePosition(
  file: File,
  bbox: SourceBbox | null,
): Promise<ScenePositionResult> {
  if (!bbox) return { position: null, reason: "no-gps" };
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const fix = readExifGps(head);
  if (!fix) return { position: null, reason: "no-gps" };
  const position = gpsToScenePosition(fix, bbox);
  if (!position) return { position: null, reason: "outside" };
  return { position };
}
```

- [ ] **Step 2: Pass the source bbox from the new-panorama page** — replace the body of `frontend/src/app/territories/[slug]/panoramas/new/page.tsx`

```tsx
import { notFound } from "next/navigation";
import PanoramaUploadForm from "@/panorama/presentation/components/panorama-upload-form";
import { getSceneBundle } from "@/territory/infrastructure/territory-gateway";
import { notFoundOnHttp404 } from "@/shared/infrastructure/http/not-found-on-404";

interface NewPanoramaPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export default async function NewPanoramaPage({ params }: NewPanoramaPageProps) {
  const { slug } = await params;
  const bundle = await getSceneBundle(slug).catch(notFoundOnHttp404(null));
  if (!bundle) notFound();

  // Source bbox drives GPS auto-placement; absent until LOD0 is converted.
  const art = bundle.artifact;
  const sourceBbox =
    art?.bboxMin && art?.bboxMax
      ? { min: art.bboxMin, max: art.bboxMax }
      : null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 sm:px-10">
      <PanoramaUploadForm
        territorySlug={slug}
        territoryTitle={bundle.territory.title}
        sourceBbox={sourceBbox}
      />
    </main>
  );
}
```

- [ ] **Step 3: Consume bbox + set position in the form** — edit `frontend/src/panorama/presentation/components/panorama-upload-form.tsx`

3a. Add imports (after the existing `createPanorama` import):

```ts
import { exifScenePosition } from "@/panorama/application/exif-scene-position";
import type { SourceBbox } from "@/panorama/domain/geo-anchor";
```

3b. Extend the props interface and destructuring to include `sourceBbox`:

```ts
interface PanoramaUploadFormProps {
  territorySlug: string;
  territoryTitle: string;
  sourceBbox: SourceBbox | null;
}
```

```ts
export default function PanoramaUploadForm({
  territorySlug,
  territoryTitle,
  sourceBbox,
}: PanoramaUploadFormProps) {
```

3c. Replace the `createPanorama` + success block inside `onSubmit` (the lines from `await createPanorama(...)` through `notify.success("Panorama uploaded");`) with:

```ts
        const placement = await exifScenePosition(file, sourceBbox);
        await createPanorama(territorySlug, {
          title: title.trim(),
          sourceBlobHash: blob.hash,
          position: placement.position ?? undefined,
          yawOffset: 0,
        });
        notify.success(
          placement.position
            ? "Panorama placed from GPS"
            : placement.reason === "outside"
              ? "Photo location doesn't match this territory — set position manually"
              : "Panorama uploaded — set its position manually",
        );
```

- [ ] **Step 4: Lint and build**

Run: `yarn lint && yarn build`
Expected: lint `Done`, build `Compiled successfully` + `Finished TypeScript`. (Confirms the new prop, glue module, and `position` field all type-check; `PanoramaCreate.position?` already exists in the domain type.)

- [ ] **Step 5: Final end-to-end check of the pure pipeline, then clean up**

Run: `node --experimental-strip-types scripts/verify-geo.mts`
Expected: `ALL PASS`.
Then remove the throwaway harness:

```bash
rm frontend/scripts/verify-geo.mts
```

- [ ] **Step 6: Commit**

```bash
git add src/panorama/application/exif-scene-position.ts \
        src/app/territories/[slug]/panoramas/new/page.tsx \
        src/panorama/presentation/components/panorama-upload-form.tsx
git commit -m "feat(panorama): auto-place uploaded panoramas from photo GPS"
```

- [ ] **Step 7: Manual verification (operator)**

Deploy, then on `operation-center` delete the origin-placed `IMG 1`/`IMG 2` and re-upload `photos/IMG_1.jpg` and `photos/IMG_2.jpg`. Expect the "Panorama placed from GPS" toast and the two anchors landing ~6 m apart inside the footprint (not at origin). A non-GPS image still uploads with the "set position manually" toast.

---

## Self-Review

**Spec coverage:**
- GPS extraction → Task 2 (`exif-gps.ts`). ✓
- UTM projection + normalize transform + footprint guard → Task 1 (`geo-anchor.ts`). ✓
- Use GPS altitude for y (fallback bbox center) → Task 1 `sy = fix.alt ?? cy`. ✓
- Auto on upload, manual editing unchanged → Task 3 form change only touches the success path; calibration UI untouched. ✓
- bbox from artifact, null when unconverted → Task 3 page. ✓
- Read head only (not 40 MB) → Task 3 glue `file.slice(0, 256*1024)`. ✓
- Toast outcomes (placed / no-gps / outside) → Task 3 Step 3c. ✓
- CRS derived from longitude + footprint validation → Task 1 `utmZone` + guard. ✓
- Verification oracle → Tasks 1–2 verify harness. ✓
- Out of scope (server backfill, stored CRS, datum offset) → not included. ✓

**Deviation from spec (improvement):** the spec proposed `createPanorama` then `updatePanorama` to set position. The backend already accepts `position` on create (`openapi.yaml` `PanoramaCreate.position`, handler `vec3PtrFromAPI(body.Position)`) and the domain `PanoramaCreate` already has `position?`, so the plan sets it in the single create call — atomic, and it removes the PUT title-clobber concern entirely. Still frontend-only, same scope.

**Placeholder scan:** none — all steps contain full code/commands.

**Type consistency:** `GpsFix` defined in `geo-anchor.ts`, imported as a type by `exif-gps.ts` and returned by `readExifGps`. `SourceBbox` defined in `geo-anchor.ts`, consumed by the glue, page (structural literal), and form prop. `gpsToScenePosition(GpsFix, SourceBbox): Vec3 | null` used consistently. `exifScenePosition(File, SourceBbox|null): Promise<ScenePositionResult>` consumed by the form. `createPanorama` body uses the existing domain `PanoramaCreate` (has `position?`, `yawOffset?`). ✓
