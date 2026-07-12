# Panorama Default View (defaultYaw) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-panorama default horizontal look direction (`defaultYaw`, radians) that the camera faces when the panorama opens, settable via a "Set default view" button while inside panorama mode.

**Architecture:** New persisted `defaultYaw` float mirrors the existing `yawOffset` path end-to-end (catalog migration → content-service proto/SQL/gRPC → gateway gRPC/HTTP/OpenAPI → frontend DTO/domain/gateway). Frontend captures the current camera yaw (`atan2(dirX, dirZ)`) and applies it in `PanoramaRig.enterPanorama` instead of the hardcoded +Z. Create path is deliberately untouched (defaults to 0).

**Tech Stack:** Go 1.26 (catalog + content + gateway services, `go.work`), Postgres 17 (goose migrations), buf/protobuf gRPC, oapi-codegen (embedded OpenAPI), Next.js 16 / React 19 / three + @react-three/fiber, openapi-typescript. Frontend tests via `node --test`.

## Global Constraints

- **Go 1.26 idioms** (backend `CLAUDE.md`): `errors.AsType[T]`, `slices`/`maps`, `omitzero`, `new(val)`, `t.Context()` in tests. Match surrounding style; composite literals use field names.
- **200-line hard cap per file** (frontend ESLint `max-lines`; backend by hand). `look-yaw.ts` is split out partly to keep `panorama-rig.tsx` under the cap.
- **Layer boundaries** (frontend): presentation → application/domain only; no cross-context presentation imports. Backend: domain types never leak into transport; sentinels in `domain/errors.go`.
- **Displayed copy must not contain "Rosneft"/"Роснефть"** — new UI string is "Set default view" (neutral).
- **`defaultYaw` semantics:** `float64`/`DOUBLE PRECISION`, radians, `atan2(dirX, dirZ)` (0 = +Z, grows toward +X), DB default `0` → backward compatible.
- **Scope: read + update only.** Do NOT add `defaultYaw` to `CreatePanoramaRequest` (proto), the create gRPC/HTTP handlers' write path, `PanoramaCreate` (openapi/dto), or the INSERT in `create_panorama.go`. It defaults to 0 at creation.
- **Regeneration:** editing `.proto` requires `make proto-gen`; editing `openapi.yaml` requires `make openapi-gen` (commit `openapi_gen.go` + `openapi_spec_gen.go`, per memory: the spec is embedded). Frontend `dto.ts` regenerates via `yarn openapi:generate`. All backend `make` commands run from `backend/`; frontend from `frontend/`.
- **Prereqs:** `buf` (for `make proto-gen`), `oapi-codegen` (for `make openapi-gen`), `openapi-typescript` (installed as a frontend dep). If a generator binary is missing, STOP and report — do not hand-edit generated files.

---

## File Structure

**Backend — create:**
- `backend/services/catalog-service/internal/migrate/migrations/00013_panorama_default_yaw.sql`

**Backend — modify:**
- `backend/proto/rosneft/content/v1/content.proto` (+ regen `backend/proto/gen/go/rosneft/content/v1/content.pb.go`)
- `backend/services/content-service/internal/domain/panorama.go`
- `backend/services/content-service/internal/storage/queries.go`
- `backend/services/content-service/internal/storage/create_panorama.go`
- `backend/services/content-service/internal/storage/update_panorama.go`
- `backend/services/content-service/internal/transport/grpcapi/panoramas.go`
- `backend/services/content-service/internal/transport/grpcapi/converters.go`
- `backend/services/gateway-service/internal/domain/panorama.go`
- `backend/services/gateway-service/internal/clients/content/panoramas.go`
- `backend/services/gateway-service/internal/clients/content/converters.go`
- `backend/services/gateway-service/internal/transport/httpapi/panoramas.go`
- `backend/services/gateway-service/internal/transport/httpapi/converters.go`
- `backend/services/gateway-service/api/openapi.yaml` (+ regen `openapi_gen.go`, `openapi_spec_gen.go`)

**Frontend — create:**
- `frontend/src/panorama/domain/look-yaw.ts`
- `frontend/src/panorama/domain/look-yaw.test.ts`

**Frontend — modify:**
- `frontend/src/panorama/domain/panorama.ts`
- `frontend/src/panorama/infrastructure/panorama-gateway.ts`
- `frontend/src/shared/infrastructure/api/dto.ts` (regenerated)
- `frontend/src/panorama/presentation/three/camera-position-tracker.tsx`
- `frontend/src/panorama/application/use-panorama-overlays.ts`
- `frontend/src/viewer/presentation/three/scene-canvas.tsx`
- `frontend/src/viewer/presentation/components/model-viewer.tsx`
- `frontend/src/panorama/presentation/three/panorama-rig.tsx`
- `frontend/src/panorama/presentation/components/panorama-section.tsx`
- `frontend/src/panorama/presentation/components/panorama-edit-panel.tsx`
- `frontend/src/panorama/application/use-panoramas.ts`

---

### Task 1: Catalog migration — `default_yaw` column

**Files:**
- Create: `backend/services/catalog-service/internal/migrate/migrations/00013_panorama_default_yaw.sql`

**Interfaces:**
- Produces: a `default_yaw DOUBLE PRECISION NOT NULL DEFAULT 0` column on `panoramas`, applied automatically on catalog boot.

- [ ] **Step 1: Write the migration**

Create `backend/services/catalog-service/internal/migrate/migrations/00013_panorama_default_yaw.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
-- Per-panorama default camera yaw (radians, world-space atan2(dirX, dirZ);
-- 0 = +Z = current hardcoded look direction). The viewer faces this heading
-- when the panorama opens. NOT NULL DEFAULT 0 keeps existing panoramas facing
-- +Z exactly as before, so no scan NULL-handling is needed. Table DDL is owned
-- by catalog-service even though content-service owns the read/write SQL.
ALTER TABLE panoramas
    ADD COLUMN default_yaw DOUBLE PRECISION NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE panoramas
    DROP COLUMN default_yaw;
-- +goose StatementEnd
```

- [ ] **Step 2: Verify the migration parses (build catalog)**

Run: `cd backend && go build ./services/catalog-service/...`
Expected: builds clean (the `//go:embed migrations/*.sql` picks up the new file; goose validates at runtime).

- [ ] **Step 3: Commit**

```bash
git add backend/services/catalog-service/internal/migrate/migrations/00013_panorama_default_yaw.sql
git commit -m "feat(catalog): add panoramas.default_yaw column"
```

---

### Task 2: Proto field + regeneration

**Files:**
- Modify: `backend/proto/rosneft/content/v1/content.proto`
- Regenerate: `backend/proto/gen/go/rosneft/content/v1/content.pb.go`

**Interfaces:**
- Produces: `Panorama.GetDefaultYaw() float64` (field 10) and `UpdatePanoramaRequest.GetDefaultYaw() float64` (field 5) on the generated Go types.

- [ ] **Step 1: Add the field to the `Panorama` message**

In `backend/proto/rosneft/content/v1/content.proto`, change the `Panorama` message (append after `updated_at = 9`, new tag — keeps wire compatibility):

```proto
message Panorama {
  int64 id = 1;
  string territory_slug = 2;
  string slug = 3;
  string title = 4;
  string source_blob_hash = 5;
  Vec3 position = 6;
  double yaw_offset = 7;
  google.protobuf.Timestamp created_at = 8;
  google.protobuf.Timestamp updated_at = 9;
  double default_yaw = 10;
}
```

- [ ] **Step 2: Add the field to `UpdatePanoramaRequest` (NOT to `CreatePanoramaRequest`)**

```proto
message UpdatePanoramaRequest {
  int64 id = 1;
  string title = 2;
  Vec3 position = 3;
  double yaw_offset = 4;
  double default_yaw = 5;
}
```

Leave `CreatePanoramaRequest` unchanged.

- [ ] **Step 3: Regenerate**

Run: `cd backend && make proto-gen`
Expected: `buf generate` succeeds; `git status` shows `backend/proto/gen/go/rosneft/content/v1/content.pb.go` modified with `DefaultYaw` fields + `GetDefaultYaw()` methods. If `buf` is not installed, STOP and report.

- [ ] **Step 4: Verify proto module builds**

Run: `cd backend && go build ./proto/...`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add backend/proto/rosneft/content/v1/content.proto backend/proto/gen/go/rosneft/content/v1/content.pb.go
git commit -m "feat(proto): add default_yaw to Panorama and UpdatePanoramaRequest"
```

---

### Task 3: content-service — domain, storage, gRPC

**Files:**
- Modify: `backend/services/content-service/internal/domain/panorama.go`
- Modify: `backend/services/content-service/internal/storage/queries.go`
- Modify: `backend/services/content-service/internal/storage/create_panorama.go`
- Modify: `backend/services/content-service/internal/storage/update_panorama.go`
- Modify: `backend/services/content-service/internal/transport/grpcapi/panoramas.go`
- Modify: `backend/services/content-service/internal/transport/grpcapi/converters.go`

**Interfaces:**
- Consumes: `contentv1.*.GetDefaultYaw()` from Task 2; `default_yaw` column from Task 1.
- Produces: `domain.Panorama.DefaultYaw float64` populated on read (list/create/update) and written on update.

- [ ] **Step 1: Add `DefaultYaw` to the domain struct**

In `backend/services/content-service/internal/domain/panorama.go`, add the field after `YawOffset` (line 26):

```go
	Position       Vec3
	YawOffset      float64
	DefaultYaw     float64
	CreatedAt      time.Time
	UpdatedAt      time.Time
```

- [ ] **Step 2: Add `default_yaw` to the shared select columns + scan**

In `backend/services/content-service/internal/storage/queries.go`, update `panoramaSelectCols` (add `pa.default_yaw` between `yaw_offset` and `created_at`) and `scanPanorama` (matching position):

```go
const panoramaSelectCols = `pa.id, t.slug AS territory_slug, pa.slug, pa.title,
	pa.source_blob_hash,
	pa.position_x, pa.position_y, pa.position_z,
	pa.yaw_offset, pa.default_yaw, pa.created_at, pa.updated_at`
```

```go
func scanPanorama(r rowScanner) (domain.Panorama, error) {
	var p domain.Panorama
	err := r.Scan(
		&p.ID, &p.TerritorySlug, &p.Slug, &p.Title,
		&p.SourceBlobHash,
		&p.Position.X, &p.Position.Y, &p.Position.Z,
		&p.YawOffset, &p.DefaultYaw, &p.CreatedAt, &p.UpdatedAt,
	)
	return p, err
}
```

- [ ] **Step 3: Update create's RETURNING + outer SELECT (NOT the INSERT)**

In `backend/services/content-service/internal/storage/create_panorama.go`, add `default_yaw` to the inner `RETURNING` and the outer `SELECT` so the column list matches `scanPanorama`. Leave the `INSERT (...)` columns, the `SELECT ... FROM territories` placeholders, and the `QueryRow` args unchanged (the column takes its DB default of 0):

```go
	const q = `
		WITH inserted AS (
			INSERT INTO panoramas (
				territory_id, slug, title, source_blob_hash,
				position_x, position_y, position_z,
				yaw_offset
			)
			SELECT t.id, $2, $3, $4,
				$5, $6, $7,
				$8
			FROM territories t
			WHERE t.slug = $1
			RETURNING id, territory_id, slug, title, source_blob_hash,
				position_x, position_y, position_z,
				yaw_offset, default_yaw, created_at, updated_at
		)
		SELECT i.id, t.slug, i.slug, i.title, i.source_blob_hash,
			i.position_x, i.position_y, i.position_z,
			i.yaw_offset, i.default_yaw, i.created_at, i.updated_at
		FROM inserted i
		JOIN territories t ON t.id = i.territory_id`
```

- [ ] **Step 4: Update's SET, RETURNING, SELECT, and args**

In `backend/services/content-service/internal/storage/update_panorama.go`, add `default_yaw = $7` to the `SET`, `default_yaw` to the RETURNING + outer SELECT, and `p.DefaultYaw` to the args:

```go
	const q = `
		WITH updated AS (
			UPDATE panoramas SET
				title      = $2,
				position_x = $3, position_y = $4, position_z = $5,
				yaw_offset = $6,
				default_yaw = $7,
				updated_at = NOW()
			WHERE id = $1
			RETURNING id, territory_id, slug, title, source_blob_hash,
				position_x, position_y, position_z,
				yaw_offset, default_yaw, created_at, updated_at
		)
		SELECT u.id, t.slug, u.slug, u.title, u.source_blob_hash,
			u.position_x, u.position_y, u.position_z,
			u.yaw_offset, u.default_yaw, u.created_at, u.updated_at
		FROM updated u
		JOIN territories t ON t.id = u.territory_id`

	row := r.pool.QueryRow(ctx, q,
		p.ID, p.Title,
		p.Position.X, p.Position.Y, p.Position.Z,
		p.YawOffset, p.DefaultYaw,
	)
```

- [ ] **Step 5: Read `DefaultYaw` in the Update gRPC handler**

In `backend/services/content-service/internal/transport/grpcapi/panoramas.go`, add to the `UpdatePanorama` domain build (leave `CreatePanorama` unchanged):

```go
	out, err := s.svc.UpdatePanorama(ctx, domain.Panorama{
		ID:         req.GetId(),
		Title:      req.GetTitle(),
		Position:   vec3FromProto(req.GetPosition()),
		YawOffset:  req.GetYawOffset(),
		DefaultYaw: req.GetDefaultYaw(),
	})
```

- [ ] **Step 6: Emit `DefaultYaw` in `panoramaToProto`**

In `backend/services/content-service/internal/transport/grpcapi/converters.go`, add to `panoramaToProto`:

```go
		Position:       vec3ToProto(p.Position),
		YawOffset:      p.YawOffset,
		DefaultYaw:     p.DefaultYaw,
		CreatedAt:      timestamppb.New(p.CreatedAt),
		UpdatedAt:      timestamppb.New(p.UpdatedAt),
```

- [ ] **Step 7: Build + test content-service**

Run: `cd backend && go build ./services/content-service/... && go test ./services/content-service/...`
Expected: builds and tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/services/content-service
git commit -m "feat(content): persist and expose panorama default_yaw"
```

---

### Task 4: gateway-service — domain, client, HTTP, OpenAPI

**Files:**
- Modify: `backend/services/gateway-service/internal/domain/panorama.go`
- Modify: `backend/services/gateway-service/internal/clients/content/panoramas.go`
- Modify: `backend/services/gateway-service/internal/clients/content/converters.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/panoramas.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/converters.go`
- Modify: `backend/services/gateway-service/api/openapi.yaml`
- Regenerate: `openapi_gen.go`, `openapi_spec_gen.go`

**Interfaces:**
- Consumes: `contentv1.Panorama.GetDefaultYaw()`; the generated `Panorama.DefaultYaw float64` and `PanoramaUpdate.DefaultYaw *float64` structs (produced by Step 6's regen).
- Produces: `defaultYaw` in the JSON `Panorama` response and accepted in the `PanoramaUpdate` body at `PUT /api/territories/{slug}/panoramas/{id}`.

- [ ] **Step 1: Add `DefaultYaw` to the gateway domain struct**

In `backend/services/gateway-service/internal/domain/panorama.go`, after `YawOffset` (line 20):

```go
	Position       Vec3
	YawOffset      float64
	DefaultYaw     float64
	CreatedAt      time.Time
	UpdatedAt      time.Time
```

- [ ] **Step 2: Send `DefaultYaw` in the Update gRPC client call**

In `backend/services/gateway-service/internal/clients/content/panoramas.go`, add to the `UpdatePanorama` request (leave `CreatePanorama` unchanged):

```go
	resp, err := c.cc.UpdatePanorama(ctx, &contentv1.UpdatePanoramaRequest{
		Id:         p.ID,
		Title:      p.Title,
		Position:   vec3ToProto(p.Position),
		YawOffset:  p.YawOffset,
		DefaultYaw: p.DefaultYaw,
	})
```

- [ ] **Step 3: Read `DefaultYaw` in `panoramaFromProto`**

In `backend/services/gateway-service/internal/clients/content/converters.go`, add to `panoramaFromProto`:

```go
		Position:       vec3FromProto(p.GetPosition()),
		YawOffset:      p.GetYawOffset(),
		DefaultYaw:     p.GetDefaultYaw(),
		CreatedAt:      p.GetCreatedAt().AsTime(),
		UpdatedAt:      p.GetUpdatedAt().AsTime(),
```

- [ ] **Step 4: Read `body.DefaultYaw` in the Update HTTP handler**

In `backend/services/gateway-service/internal/transport/httpapi/panoramas.go`, in `UpdatePanorama`, mirror the `yawOffset` nil-pointer pattern and pass it through (leave `CreatePanorama` unchanged):

```go
	var yawOffset float64
	if body.YawOffset != nil {
		yawOffset = *body.YawOffset
	}
	var defaultYaw float64
	if body.DefaultYaw != nil {
		defaultYaw = *body.DefaultYaw
	}
	p, err := s.svc.UpdatePanorama(ctx, domain.Panorama{
		ID:         req.Id,
		Title:      title,
		Position:   vec3PtrFromAPI(body.Position),
		YawOffset:  yawOffset,
		DefaultYaw: defaultYaw,
	})
```

- [ ] **Step 5: Emit `DefaultYaw` in `panoramaToAPI`**

In `backend/services/gateway-service/internal/transport/httpapi/converters.go`, add to `panoramaToAPI`:

```go
		Position:       vec3ToAPI(p.Position),
		YawOffset:      p.YawOffset,
		DefaultYaw:     p.DefaultYaw,
```

- [ ] **Step 6: Update the OpenAPI spec + regenerate**

In `backend/services/gateway-service/api/openapi.yaml`, in the `Panorama` schema add `defaultYaw` to `required` and to `properties`; in `PanoramaUpdate` add `defaultYaw`. Leave `PanoramaCreate` unchanged.

`Panorama.required`:
```yaml
      required: [id, territorySlug, slug, title, sourceBlobHash, position, yawOffset, defaultYaw]
```

`Panorama.properties` (after the `yawOffset` block, before `createdAt`):
```yaml
        defaultYaw:
          type: number
          format: double
          description: |
            Default horizontal camera yaw (radians, world-space atan2(dirX, dirZ);
            0 = +Z) the viewer faces when the panorama opens.
```

`PanoramaUpdate.properties`:
```yaml
    PanoramaUpdate:
      type: object
      properties:
        title: { type: string }
        position: { $ref: '#/components/schemas/Vec3' }
        yawOffset: { type: number, format: double }
        defaultYaw: { type: number, format: double }
```

Then run: `cd backend && make openapi-gen`
Expected: `openapi_gen.go` gains `DefaultYaw float64` on `Panorama` and `DefaultYaw *float64` on `PanoramaUpdate`; `openapi_spec_gen.go` embedded spec updates. If `oapi-codegen` is missing, STOP and report.

- [ ] **Step 7: Build + test the whole backend**

Run: `cd backend && make build && make test`
Expected: all modules build and tests pass. (This also compiles the gateway against the regenerated structs.)

- [ ] **Step 8: Commit**

```bash
git add backend/services/gateway-service
git commit -m "feat(gateway): accept and expose panorama defaultYaw"
```

---

### Task 5: Frontend domain + gateway mapping + DTO regen

**Files:**
- Modify: `frontend/src/panorama/domain/panorama.ts`
- Modify: `frontend/src/panorama/infrastructure/panorama-gateway.ts`
- Regenerate: `frontend/src/shared/infrastructure/api/dto.ts`

**Interfaces:**
- Consumes: the updated `openapi.yaml` from Task 4.
- Produces: `Panorama.defaultYaw: number`, `PanoramaUpdate.defaultYaw: number`, and `mapPanorama` populating `defaultYaw`.

- [ ] **Step 1: Regenerate the DTO types**

Run: `cd frontend && yarn openapi:generate`
Expected: `src/shared/infrastructure/api/dto.ts` updates — `Panorama` gains `defaultYaw: number`, `PanoramaUpdate` gains `defaultYaw?: number`. (This reads `../backend/.../openapi.yaml`, already updated in Task 4.)

- [ ] **Step 2: Add `defaultYaw` to the domain interfaces**

In `frontend/src/panorama/domain/panorama.ts`, add to `Panorama` and `PanoramaUpdate` (NOT `PanoramaCreate`):

```ts
export interface Panorama {
  id: number;
  territorySlug: string;
  slug: string;
  title: string;
  sourceBlobHash: string;
  position: Vec3;
  yawOffset: number;
  // Default horizontal camera yaw (radians) faced when the panorama opens.
  defaultYaw: number;
  updatedAt: string;
}
```

```ts
export interface PanoramaUpdate {
  title: string;
  position: Vec3;
  yawOffset: number;
  defaultYaw: number;
}
```

- [ ] **Step 3: Map `defaultYaw` in the gateway**

In `frontend/src/panorama/infrastructure/panorama-gateway.ts`, add to `mapPanorama`:

```ts
    position: d.position,
    yawOffset: d.yawOffset,
    defaultYaw: d.defaultYaw,
    updatedAt: d.updatedAt ?? "",
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && yarn lint`
Expected: no errors. (If `use-panoramas.ts` or the panel now error on a missing `defaultYaw`, that's expected — they're fixed in Tasks 6–8; if lint fails ONLY there, proceed; otherwise fix.)

Note: `yarn lint` runs ESLint only, not `tsc`. Type errors surface at `yarn build` (Task 9). Adding a required `defaultYaw` here means the optimistic-merge object in `use-panoramas.ts` is incomplete until Task 8 — acceptable mid-plan; Task 9's build is the gate.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/panorama/domain/panorama.ts frontend/src/panorama/infrastructure/panorama-gateway.ts frontend/src/shared/infrastructure/api/dto.ts
git commit -m "feat(panorama): defaultYaw in frontend domain + DTO"
```

---

### Task 6: `look-yaw.ts` pure helpers (TDD)

**Files:**
- Create: `frontend/src/panorama/domain/look-yaw.ts`
- Test: `frontend/src/panorama/domain/look-yaw.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `@/shared/domain/vec3`.
- Produces:
  - `yawToTarget(anchor: Vec3, yaw: number, radius: number): Vec3` — a point `radius` from `anchor` in the horizontal direction `yaw` (0 = +Z).
  - `dirToYaw(dx: number, dz: number): number` — `Math.atan2(dx, dz)`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/panorama/domain/look-yaw.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { yawToTarget, dirToYaw } from "./look-yaw.ts";

const anchor = { x: 5, y: 2, z: -3 };

test("yaw 0 looks toward +Z", () => {
  const t = yawToTarget(anchor, 0, 1);
  assert.ok(Math.abs(t.x - anchor.x) < 1e-9, "no x offset");
  assert.equal(t.y, anchor.y, "y unchanged");
  assert.ok(t.z - anchor.z > 0, "target is +Z of anchor");
});

test("yaw round-trips through dirToYaw", () => {
  for (const yaw of [0, 0.5, 1.5, 3, -1, -2.5]) {
    const t = yawToTarget(anchor, yaw, 0.01);
    const back = dirToYaw(t.x - anchor.x, t.z - anchor.z);
    // atan2 returns (-π, π]; compare via the shortest angular distance.
    const diff = Math.atan2(Math.sin(back - yaw), Math.cos(back - yaw));
    assert.ok(Math.abs(diff) < 1e-9, `round-trip yaw ${yaw} → ${back}`);
  }
});

test("radius scales the offset but not the direction", () => {
  const near = yawToTarget(anchor, 1.2, 0.01);
  const far = yawToTarget(anchor, 1.2, 5);
  assert.ok(dirToYaw(near.x - anchor.x, near.z - anchor.z) - 1.2 < 1e-9);
  assert.ok(dirToYaw(far.x - anchor.x, far.z - anchor.z) - 1.2 < 1e-9);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && yarn test`
Expected: FAIL — `Cannot find module './look-yaw.ts'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/panorama/domain/look-yaw.ts`:

```ts
import type { Vec3 } from "@/shared/domain/vec3";

// Yaw is the horizontal look angle measured as atan2(dirX, dirZ): 0 points
// toward +Z (the viewer's historical default look direction) and grows toward
// +X. Pitch is intentionally ignored — the panorama default view is horizontal.

// yawToTarget returns an OrbitControls target `radius` away from `anchor` in
// the horizontal direction `yaw`. y is left at the anchor's height (level look).
export function yawToTarget(anchor: Vec3, yaw: number, radius: number): Vec3 {
  return {
    x: anchor.x + Math.sin(yaw) * radius,
    y: anchor.y,
    z: anchor.z + Math.cos(yaw) * radius,
  };
}

// dirToYaw recovers the horizontal yaw from a look-direction's x/z components.
export function dirToYaw(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && yarn test`
Expected: PASS — the three `look-yaw` tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/panorama/domain/look-yaw.ts frontend/src/panorama/domain/look-yaw.test.ts
git commit -m "feat(panorama): look-yaw pure helpers with tests"
```

---

### Task 7: Apply defaultYaw on open (tracker → ref → rig)

**Files:**
- Modify: `frontend/src/panorama/presentation/three/camera-position-tracker.tsx`
- Modify: `frontend/src/panorama/application/use-panorama-overlays.ts`
- Modify: `frontend/src/viewer/presentation/three/scene-canvas.tsx`
- Modify: `frontend/src/viewer/presentation/components/model-viewer.tsx`
- Modify: `frontend/src/panorama/presentation/three/panorama-rig.tsx`

**Interfaces:**
- Consumes: `yawToTarget`, `dirToYaw` (Task 6); `panorama.defaultYaw` (Task 5).
- Produces: `cameraYawRef: RefObject<number | null>` (written by the tracker, exposed by `usePanoramaOverlays`, consumed by the edit panel in Task 8); the panorama camera faces `defaultYaw` on entry.

- [ ] **Step 1: Extend `CameraPositionTracker` to also write the camera yaw**

Replace `frontend/src/panorama/presentation/three/camera-position-tracker.tsx` with:

```tsx
import { type RefObject, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Vec3 } from "@/shared/domain/vec3";
import { dirToYaw } from "@/panorama/domain/look-yaw";

interface CameraPositionTrackerProps {
  positionRef: RefObject<Vec3 | null>;
  // Live horizontal camera yaw (radians), read by the panorama edit panel to
  // capture a default view. Written on the same OrbitControls "change" events.
  yawRef: RefObject<number | null>;
}

// Reused across sync calls so the "change" listener doesn't allocate a Vector3
// per event.
const dir = new Vector3();

// CameraPositionTracker mirrors the live camera position and horizontal yaw
// into imperative refs so components outside the Canvas (the panorama edit
// panel) can read them on demand. Lives inside the Canvas tree for useThree.
export default function CameraPositionTracker({
  positionRef,
  yawRef,
}: CameraPositionTrackerProps) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls as { addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void } | null);

  useEffect(() => {
    const sync = () => {
      positionRef.current = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      };
      camera.getWorldDirection(dir);
      yawRef.current = dirToYaw(dir.x, dir.z);
    };
    sync();
    controls?.addEventListener?.("change", sync);
    return () => controls?.removeEventListener?.("change", sync);
  }, [camera, controls, positionRef, yawRef]);

  return null;
}
```

- [ ] **Step 2: Expose `cameraYawRef` from the overlays hook**

In `frontend/src/panorama/application/use-panorama-overlays.ts`, add the ref next to `cameraPositionRef` (line 33) and return it (line 54 area):

```ts
  const cameraPositionRef = useRef<Vec3 | null>(null);
  // Mirror of the live camera's horizontal yaw — written each "change" by
  // CameraPositionTracker, read by the edit panel's "Set default view".
  const cameraYawRef = useRef<number | null>(null);
```

```ts
    cameraPositionRef,
    cameraYawRef,
    showMarkers,
```

- [ ] **Step 3: Thread `cameraYawRef` through `scene-canvas.tsx`**

In `frontend/src/viewer/presentation/three/scene-canvas.tsx`: add a `cameraYawRef` prop alongside the existing `cameraPositionRef` prop (in the props interface and destructuring — mirror `cameraPositionRef` exactly), then pass it to the tracker at line 282:

```tsx
      <CameraPositionTracker positionRef={cameraPositionRef} yawRef={cameraYawRef} />
```

The prop type is `RefObject<number | null>` (import `RefObject` is already present for `cameraPositionRef`).

- [ ] **Step 4: Pass `cameraYawRef` from `model-viewer.tsx`**

In `frontend/src/viewer/presentation/components/model-viewer.tsx`, `pano` (from `usePanoramaOverlays`) now exposes `pano.cameraYawRef`. Add `cameraYawRef={pano.cameraYawRef}` immediately after each existing `cameraPositionRef={pano.cameraPositionRef}` prop — there are two occurrences: the `<SceneCanvas>` render (~line 142) and the `<PanoramaSection>` render (~line 205). Both get the new prop.

- [ ] **Step 5: Apply `defaultYaw` in `PanoramaRig.enterPanorama`**

In `frontend/src/panorama/presentation/three/panorama-rig.tsx`:

Add the import:
```tsx
import { yawToTarget } from "@/panorama/domain/look-yaw";
```

Change `enterPanorama`'s signature to take `defaultYaw` and use it for the initial target (replace the hardcoded `+Z` at line 57):

```tsx
function enterPanorama(
  controls: OrbitControlsImpl,
  camera: Camera,
  getAnchor: () => Vec3,
  defaultYaw: number,
  invalidate: () => void,
): () => void {
  const prev = {
    enableZoom: controls.enableZoom,
    enablePan: controls.enablePan,
    target: controls.target.clone(),
    cameraPos: camera.position.clone(),
    minDist: controls.minDistance,
    maxDist: controls.maxDistance,
  };
  const a = getAnchor();
  const t = yawToTarget(a, defaultYaw, LOOK_RADIUS);
  camera.position.set(a.x, a.y, a.z);
  controls.target.set(t.x, t.y, t.z);
```

Then update the single call site (inside the first `useEffect`, ~line 114) to pass `panorama.defaultYaw`:

```tsx
      st.cleanup = enterPanorama(controls, camera, () => ref.current.pos, panorama.defaultYaw, invalidate);
```

`panorama.defaultYaw` is stable per panorama; the effect already re-enters on `id` change, and `recenter` (unchanged) preserves the look direction on later position nudges — so the default is applied only at entry.

- [ ] **Step 6: Lint**

Run: `cd frontend && yarn lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/panorama/presentation/three/camera-position-tracker.tsx frontend/src/panorama/application/use-panorama-overlays.ts frontend/src/viewer/presentation/three/scene-canvas.tsx frontend/src/viewer/presentation/components/model-viewer.tsx frontend/src/panorama/presentation/three/panorama-rig.tsx
git commit -m "feat(panorama): face defaultYaw on panorama entry"
```

---

### Task 8: Capture + save UI ("Set default view")

**Files:**
- Modify: `frontend/src/panorama/presentation/components/panorama-edit-panel.tsx`
- Modify: `frontend/src/panorama/presentation/components/panorama-section.tsx`
- Modify: `frontend/src/panorama/application/use-panoramas.ts`

**Interfaces:**
- Consumes: `cameraYawRef` (Task 7); `panorama.defaultYaw` (Task 5).
- Produces: a "Set default view" button (enabled only in panorama mode) that captures the live yaw and persists it via the existing "Save anchor" → `update` → PUT flow.

- [ ] **Step 1: Add `defaultYaw` through the optimistic update + PUT body**

In `frontend/src/panorama/application/use-panoramas.ts`, extend the `patch` type, the optimistic merge, and the PUT body:

```ts
  const update = useCallback(
    async (id: number, patch: { title?: string; position?: Vec3; yawOffset?: number; defaultYaw?: number }) => {
      const current = panoramasRef.current.find((p) => p.id === id);
      if (!current) return;
      const optimistic: Panorama = {
        ...current,
        title: patch.title ?? current.title,
        position: patch.position ?? current.position,
        yawOffset: patch.yawOffset ?? current.yawOffset,
        defaultYaw: patch.defaultYaw ?? current.defaultYaw,
      };
```

```ts
        const saved = await updatePanorama(territorySlug, id, {
          title: optimistic.title,
          position: optimistic.position,
          yawOffset: optimistic.yawOffset,
          defaultYaw: optimistic.defaultYaw,
        });
```

- [ ] **Step 2: Thread the patch type + `cameraYawRef` through `panorama-section.tsx`**

In `frontend/src/panorama/presentation/components/panorama-section.tsx`:

Add `cameraYawRef` to the props interface (after `cameraPositionRef`, line 23) and destructuring (after line 56):
```ts
  cameraPositionRef: RefObject<Vec3 | null>;
  cameraYawRef: RefObject<number | null>;
```

Extend the `onSavePanorama` patch type (lines 36-39):
```ts
  onSavePanorama: (
    id: number,
    patch: { position?: Vec3; yawOffset?: number; defaultYaw?: number },
  ) => void;
```

Pass `cameraYawRef` into `PanoramaEditPanel` (after line 184's `cameraPositionRef`):
```tsx
          cameraPositionRef={cameraPositionRef}
          cameraYawRef={cameraYawRef}
```

- [ ] **Step 3: Add the button + state in `panorama-edit-panel.tsx`**

In `frontend/src/panorama/presentation/components/panorama-edit-panel.tsx`:

Add `cameraYawRef` to the props interface (after `cameraPositionRef`, line 12) and destructuring (after `cameraPositionRef`, line 47), and extend `onSave`'s type (line 24):
```ts
  cameraPositionRef: RefObject<Vec3 | null>;
  cameraYawRef: RefObject<number | null>;
```
```ts
  onSave: (patch: { position?: Vec3; yawOffset?: number; defaultYaw?: number }) => void;
```

Add state + capture handler (after the `yawOffset` state at line 63, and after `useCameraPos` at line 75):
```ts
  const [defaultYaw, setDefaultYaw] = useState(panorama.defaultYaw);
```
```ts
  const useCameraYaw = () => {
    const yaw = cameraYawRef.current;
    if (yaw == null) return;
    setDefaultYaw(yaw);
  };
```

Extend `dirty` (line 65-69) with the new field:
```ts
  const dirty =
    position.x !== panorama.position.x ||
    position.y !== panorama.position.y ||
    position.z !== panorama.position.z ||
    yawOffset !== panorama.yawOffset ||
    defaultYaw !== panorama.defaultYaw;
```

Add the button + readout inside the `canWrite` `<div className="space-y-3">` block, right before the "Save anchor" button (line 169):
```tsx
            <div data-tour="panorama-default-view" className="space-y-1">
              <button
                type="button"
                onClick={useCameraYaw}
                disabled={!inPanoramaMode}
                title={
                  inPanoramaMode
                    ? "Capture the current look direction as the panorama's default view"
                    : "Enter panorama view first — the default view is captured from inside the panorama"
                }
                className="w-full cursor-pointer rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Set default view
              </button>
              <p className="text-[10px] text-neutral-400">
                Default look: {Math.round(((defaultYaw % TAU) + TAU) % TAU * RAD_TO_DEG)}°
              </p>
            </div>
```

Update the "Save anchor" click to send `defaultYaw` (line 171):
```tsx
              onClick={() => onSave({ position, yawOffset, defaultYaw })}
```

- [ ] **Step 4: Lint**

Run: `cd frontend && yarn lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/panorama/presentation/components/panorama-edit-panel.tsx frontend/src/panorama/presentation/components/panorama-section.tsx frontend/src/panorama/application/use-panoramas.ts
git commit -m "feat(panorama): Set default view button captures and saves camera yaw"
```

---

### Task 9: Full verification (build + tests + manual)

**Files:** none (verification only).

- [ ] **Step 1: Backend build + tests**

Run: `cd backend && make build && make test`
Expected: all green.

- [ ] **Step 2: Frontend tests, lint, build**

Run: `cd frontend && yarn test && yarn lint && yarn build`
Expected: all green — including the `look-yaw` tests, and `tsc` (via `next build`) confirming the `defaultYaw` type threads cleanly everywhere.

- [ ] **Step 3: Manual end-to-end (needs the stack up)**

Bring the stack up (`cd backend && make compose-up`), open a territory with a panorama, and as a `panorama:write` user:

1. Enter a panorama (the picker or a marker). Confirm it opens facing +Z (existing panoramas have `defaultYaw = 0`).
2. Rotate the camera to a distinctive heading. The "Set default view" button is enabled (it's disabled in 3D view).
3. Click "Set default view" — the "Default look: N°" readout updates to the current heading.
4. Click "Save anchor". Confirm no error toast.
5. Switch to 3D view, then re-enter the same panorama → it now opens facing the saved heading.
6. Reload the page and re-enter → still faces the saved heading (persisted through the PUT).
7. Confirm `GET /api/territories/{slug}/scene` (or `.../panoramas`) returns the panorama with the new `defaultYaw` value.

- [ ] **Step 4: Update the frontend CLAUDE.md note (optional, if maintaining docs)**

The "Panorama transforms" / rig section in the root `CLAUDE.md` describes the +Z default; if keeping docs current, note that entry now faces `panorama.defaultYaw`. (Skip if out of scope for this branch.)

---

## Self-Review

**Spec coverage:**
- `default_yaw` DB column, default 0, backward compatible → Task 1. ✓
- proto read+update field (not create) → Task 2. ✓
- content-service domain/storage(read via shared cols + create RETURNING + update write)/gRPC → Task 3. ✓
- gateway domain/client/http(update)/openapi(Panorama+PanoramaUpdate, not Create)+regen → Task 4. ✓
- frontend domain (Panorama+PanoramaUpdate, not Create) + gateway map + dto regen → Task 5. ✓
- `look-yaw.ts` pure helpers + runnable test (round-trip, yaw 0 → +Z) → Task 6. ✓
- tracker writes `cameraYawRef`; rig applies `defaultYaw` via `yawToTarget` → Task 7. ✓
- "Set default view" button enabled only in panorama mode; captures yaw; saved via existing Save anchor → Task 8. ✓
- Create path untouched everywhere → enforced in Tasks 2/3/4/5. ✓
- Backward compat (defaultYaw=0 → +Z) → Task 1 default + Task 6 `yaw 0` test + Task 9 manual step 1. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every command has an expected result. ✓

**Type consistency:**
- `DefaultYaw float64` — consistent Go field name across content domain, gateway domain, proto (`default_yaw`/`GetDefaultYaw`), all converters/handlers.
- `defaultYaw: number` — consistent TS name across `dto.ts` (regen), `domain/panorama.ts`, `mapPanorama`, `use-panoramas` patch/optimistic/PUT, section + panel patch types.
- `yawToTarget(anchor, yaw, radius)` / `dirToYaw(dx, dz)` — defined in Task 6, consumed in Task 7 (both rig and tracker) with matching signatures.
- `cameraYawRef: RefObject<number | null>` — created in overlays (Task 7), threaded through scene-canvas + model-viewer (Task 7) and section + panel (Task 8) with the same type.
- Update SQL args count: `$1..$7` (id, title, x, y, z, yawOffset, defaultYaw) — SET uses `$2..$7`, WHERE uses `$1`. ✓
