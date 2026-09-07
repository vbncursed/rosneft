# Single-GET counts, LOD metadata, and two frontend guards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The single-entity GETs carry `placementCount` / `usageCount`, every LOD artifact carries its own `vertices` / `faces` and LOD 0's bbox, and two small frontend guards land: encoded slugs in the catalog paths, and a Cancel button that disappears once the bytes are done.

**Architecture:** Task 1 rewrites two SQL statements in catalog-service so the single GETs use the same correlated count subquery their list twins do, then corrects the comments and descriptions that said otherwise (proto, two domains, openapi) and inverts the two gateway tests that pinned the old contract. Task 2 adds a glTF-header stats helper to mesh-service and wires it into the LOD loop, copying LOD 0's bbox across. Task 3 removes the frontend's now-unnecessary list query, encodes the two catalog paths, and makes `UploadProgressPanel.onCancel` optional. Task 4 is docs.

**Tech Stack:** Go 1.25 (catalog-service pgx v5, mesh-service qmuntal/gltf, gateway oapi-codegen, buf), frontend-v2 React 19 + TanStack Query + vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-single-get-counts-and-lod-metadata-design.md`.

## Global Constraints

- Branch `feat/frontend-v2-design-system`. Stage by path only. **Never stage `.claude/settings.json` or `backend/go.work.sum`.** A parallel session may work in `backend/`; check `git status` before staging and stage the exact files you touched.
- Go commits: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` green first (fmt-check, tidy-check, vet, lint, test -race -shuffle=on, govulncheck; ~80 s; needs network for govulncheck). Backend 200-line cap by hand. `make -C backend proto-gen` after a `.proto` edit (needs `buf` + network); `make -C backend openapi-gen` after an `openapi.yaml` edit (regenerates `openapi_gen.go` **and** `openapi_spec_gen.go`).
- Frontend commits: from `frontend-v2/`, `yarn lint` and `yarn test:coverage` (90/85/90/90) green; `git commit --no-verify` with the body line "Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes." 200-line cap; `src/architecture.spec.ts` rules (spec per module, fixture per JSX slice, imports inward only, never past another slice's `index.ts`); **clsx does not merge** — conditional utilities on one CSS property are ternaries.
- The catalog integration suite is behind the `integration` build tag and needs Docker: from `backend/services/catalog-service`, `go test -tags=integration ./internal/storage/`. `make check` does not run it.
- Live checks run against a rebuilt stack: `docker compose -f docker-compose.yml up --build -d catalog gateway mesh-worker` from the repo root (catalog and gateway go up together — they share the `replace`d local proto module). Gateway :8080, `yarn dev` :3001, Root `admin` / `change-me-now` (login JSON field `identifier`, form label "Email or username").
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef
  ```
- Skills each implementer and reviewer loads first via the Skill tool: `ponytail:ponytail`, `clean-code`, `superpowers:test-driven-development`; Go tasks add `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to`; frontend tasks add `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `frontend-design:frontend-design`.

---

## File map

**Task 1 (counts):** `backend/services/catalog-service/internal/storage/{get_model.go, get_territory.go, queries.go, list_counts_integration_test.go}`; `backend/services/catalog-service/internal/domain/types.go`; `backend/proto/rosneft/catalog/v1/catalog.proto` (+ regenerated `backend/proto/gen/go/rosneft/catalog/v1/catalog.pb.go`); `backend/services/gateway-service/internal/domain/types.go`; `backend/services/gateway-service/api/openapi.yaml` (+ regenerated `internal/transport/httpapi/openapi_gen.go`, `openapi_spec_gen.go`); `backend/services/gateway-service/internal/transport/httpapi/list_counts_test.go`; `frontend-v2/src/shared/api/dto.ts` (regenerated).

**Task 2 (LOD metadata):** `backend/services/mesh-service/internal/converter/{glb_stats.go, glb_stats_test.go, convert_lods.go, convert_lods_test.go}`.

**Task 3 (frontend):** `frontend-v2/src/pages/model-detail/model/{use-model-detail.ts, use-model-detail.spec.tsx}`; `frontend-v2/src/entities/model/model/{model.ts, model.spec.ts}`; `frontend-v2/src/entities/territory/model/{territory.ts, territory.spec.ts}`; `frontend-v2/src/entities/model/api/to-model.spec.ts`; `frontend-v2/src/entities/territory/api/to-territory.spec.ts`; `frontend-v2/src/entities/upload/ui/{upload-progress-panel.tsx, upload-progress-panel.spec.tsx}`; `frontend-v2/src/pages/replace-source/{model/use-replace-source.ts, ui/replace-source-page.tsx}` (+ specs); `frontend-v2/src/pages/upload-territory/{model/use-upload-territory.ts, ui/upload-territory-page.tsx}` (+ specs).

**Task 4 (docs):** `CLAUDE.md`, `frontend-v2/CLAUDE.md`, the spec's §7 ticks.

---

### Task 1: The counts on the single-entity GETs

**Files:**
- Modify: `backend/services/catalog-service/internal/storage/get_model.go:15-18`, `get_territory.go:17-21`, `queries.go:69-84` (two doc comments)
- Modify: `backend/services/catalog-service/internal/storage/list_counts_integration_test.go` (add two assertions)
- Modify: `backend/services/catalog-service/internal/domain/types.go:17-19,31-33` (comments)
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto:84,98` (comments) → `make -C backend proto-gen`
- Modify: `backend/services/gateway-service/internal/domain/types.go:40-42,67-69` (comments)
- Modify: `backend/services/gateway-service/api/openapi.yaml:56-59,77-80` (descriptions) → `make -C backend openapi-gen`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/list_counts_test.go:14-16,33-35,41-43,57-64,77-83`
- Regenerate: `frontend-v2/src/shared/api/dto.ts` via `cd frontend-v2 && yarn openapi:generate`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GET /api/models/{slug}` returns `usageCount` (omitted when zero, as on the list); `GET /api/territories/{slug}` returns `placementCount` the same way. Task 3 relies on this.

- [ ] **Step 1: Invert the gateway's two contract tests**

In `list_counts_test.go`, the stubs currently return zero-count entities and the tests assert the key is absent. Give the stubs counts and assert the JSON carries them:

```go
// in the territory stub (was: domain.Territory{Slug: "yard"})
return domain.Territory{Slug: "yard", PlacementCount: 3}, nil
// in the model stub (was: domain.Model{Slug: "pump"})
return domain.Model{Slug: "pump", UsageCount: 2}, nil
```

Rename and rewrite the two tests:

```go
func (s *ListCountsSuite) TestGetTerritoryCarriesPlacementCount() {
	var got httpapi.Territory
	s.getJSON("/api/territories/yard", &got)

	assert.Assert(s.T(), got.PlacementCount != nil)
	assert.Equal(s.T(), *got.PlacementCount, 3)
}

func (s *ListCountsSuite) TestGetModelCarriesUsageCount() {
	var got httpapi.Model
	s.getJSON("/api/models/pump", &got)

	assert.Assert(s.T(), got.UsageCount != nil)
	assert.Equal(s.T(), *got.UsageCount, 2)
}
```

(Keep the file's existing helper names and assertion style — read the file and match it; the two list tests above them do not change. Update the suite's doc comment at the top: the counts are on both the list and the single GET, and the JSON key is still omitted when the count is zero.)

- [ ] **Step 2: Run them — expect FAIL**

```bash
cd backend/services/gateway-service && GOWORK=off go test ./internal/transport/httpapi/ -run ListCounts -v
```
Expected: the two new tests fail (`PlacementCount` / `UsageCount` nil) because the gateway's stub is exercised through the real handler and the httpapi converters only set the pointer when non-zero — which they do, so in fact these two pass immediately once the stub carries a count. **If they pass at this step, that is correct**: the gateway needs no production change, and the test now pins the contract catalog-service is about to start honouring. Record that in the report; the real red/green is Step 4.

- [ ] **Step 3: Add the integration assertions — expect FAIL**

In `list_counts_integration_test.go`, at the end of `TestListsCarryPlacementAndUsageCounts` (or as a sibling test on the same fixture), add:

```go
	t, err := s.pg.GetTerritory(ctx, "yard", "")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), t.PlacementCount, 3)

	m, err := s.pg.GetModel(ctx, "pump")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), m.UsageCount, 2)
```

(Match the file's existing variable names and assertion helper. The fixture already gives `pump` three placements across two territories, which is exactly the `COUNT` vs `COUNT(DISTINCT …)` distinction worth re-pinning.)

Run: `cd backend/services/catalog-service && go test -tags=integration ./internal/storage/ -run ListsCarry -v` (needs Docker).
Expected: FAIL — both counts read 0.

- [ ] **Step 4: Rewrite the two SELECTs**

`get_model.go`:
```go
// GetModel returns a single model by slug, with the count of distinct
// territories placing it — the same correlated subquery ListModels uses, so
// a model's page and the library agree on the number.
func (r *PG) GetModel(ctx context.Context, slug string) (domain.Model, error) {
	const q = `SELECT m.slug, m.title, m.description, m.source_blob_hash, m.thumbnail_blob_hash, m.created_at, m.updated_at,
       (SELECT COUNT(DISTINCT p.territory_id) FROM placements p WHERE p.model_id = m.id) AS usage_count
FROM models m WHERE m.slug = $1`

	row := r.pool.QueryRow(ctx, q, slug)
	m, err := scanModelListed(row)
	…unchanged error handling…
}
```

`get_territory.go`:
```go
// GetTerritory returns a single territory by slug, with its placement count.
// When scopeAdminID is non-empty, the territory must be assigned to that
// admin or it reads as not found (empty scope = no check; covers Root and
// internal callers).
func (r *PG) GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error) {
	const q = `SELECT t.slug, t.title, t.description, t.source_blob_hash, t.external_panorama_url, t.created_at, t.updated_at,
       (SELECT COUNT(*) FROM placements p WHERE p.territory_id = t.id) AS placement_count
FROM territories t
WHERE t.slug = $1 AND ($2 = '' OR EXISTS (
    SELECT 1 FROM territory_assignments a
    WHERE a.territory_id = t.id AND a.admin_user_id = $2::uuid))`

	row := r.pool.QueryRow(ctx, q, slug, scopeAdminID)
	t, err := scanTerritoryListed(row)
	…unchanged error handling…
}
```

`entityColumns` and `territoryColumns` stay — the four INSERT…RETURNING callers still use them. In `queries.go`, `scanTerritoryListed`'s and `scanModelListed`'s doc comments drop "used only by ListTerritories'/ListModels' correlated-count query" and say instead that both the list and the single GET use them.

- [ ] **Step 5: Run both suites — expect PASS**

```bash
cd backend/services/catalog-service && go test -tags=integration ./internal/storage/ -run ListsCarry -v
cd backend/services/gateway-service && GOWORK=off go test ./internal/transport/httpapi/ -run ListCounts -v
```

- [ ] **Step 6: The comments that are now wrong**

- `catalog-service/internal/domain/types.go`: `PlacementCount` / `UsageCount` — replace "Filled by ListTerritories only; zero on a single GetTerritory." with a line saying both the list and the single Get fill it.
- `gateway-service/internal/domain/types.go`: same edit on its two fields.
- `backend/proto/rosneft/catalog/v1/catalog.proto`: the `placement_count` and `usage_count` comments lose "Filled by ListTerritories/ListModels only". Then:
  ```bash
  make -C backend proto-gen
  ```
  and confirm the only diff in `backend/proto/gen/go/.../catalog.pb.go` is the two comment lines.
- `gateway-service/api/openapi.yaml`:
  ```yaml
  placementCount:
    type: integer
    description: Placements on this territory. Omitted when zero.
  usageCount:
    type: integer
    description: Distinct territories placing this model, across every territory. Omitted when zero.
  ```
  (Keep the surrounding keys exactly as they are; only the two `description` values change.) Then:
  ```bash
  make -C backend openapi-gen
  cd frontend-v2 && yarn openapi:generate
  ```
  Both generated gateway files change; `dto.ts` changes only in the two doc comments.

- [ ] **Step 7: The gate**

```bash
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check
cd frontend-v2 && yarn lint && yarn test:coverage
```
(The frontend run is because `dto.ts` moved.)

- [ ] **Step 8: Live check**

```bash
docker compose -f docker-compose.yml up --build -d catalog gateway mesh-worker
```
Then, logged in as Root through the gateway, pick a model the library shows as used and a territory with placements:
```bash
curl -s -b cookies.txt localhost:8080/api/models/<slug>   | jq .usageCount
curl -s -b cookies.txt localhost:8080/api/territories/<slug> | jq .placementCount
```
Both must be non-zero, and an unplaced model must still omit the key entirely.

- [ ] **Step 9: Commit**

```bash
git add backend/proto backend/services/catalog-service backend/services/gateway-service frontend-v2/src/shared/api/dto.ts
git commit -m "feat(catalog): a single-entity GET carries the same counts its list does

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```
(No `--no-verify`: the pre-commit hook runs the backend gate, which you have already run.)

---

### Task 2: Per-LOD vertex and face counts

**Files:**
- Create: `backend/services/mesh-service/internal/converter/glb_stats.go`, `glb_stats_test.go`
- Modify: `backend/services/mesh-service/internal/converter/convert_lods.go:23-25,46-59,61-77`
- Modify: `backend/services/mesh-service/internal/converter/convert_lods_test.go`

**Interfaces:**
- Consumes: `domain.ConversionResult{ArtifactHash, Content, ContentType, Size, Vertices, Faces, BBoxMin, BBoxMax}`; the package-private `rawGLB{content, vertices, faces, bboxMin, bboxMax}` and `(*Converter).convertRaw`.
- Produces: `glbStats(body []byte) (vertices, faces uint64, err error)` — package-private, used only by the LOD loop.

- [ ] **Step 1: Write the failing stats test**

`glb_stats_test.go`:
```go
package converter

import (
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"
)

// A GLB produced by the converter itself is the only fixture this package
// can build without checking a binary into the repo.
func writeOneTriangleGLB(t *testing.T) []byte {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "tri.obj")
	obj := "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
	assert.NilError(t, os.WriteFile(path, []byte(obj), 0o600))

	c := &Converter{}
	raw, err := c.convertRaw(t.Context(), path)
	assert.NilError(t, err)
	return raw.content
}

func TestGLBStatsCountsPositionsAndTriangles(t *testing.T) {
	vertices, faces, err := glbStats(writeOneTriangleGLB(t))

	assert.NilError(t, err)
	assert.Equal(t, vertices, uint64(3))
	assert.Equal(t, faces, uint64(1))
}

func TestGLBStatsRejectsGarbage(t *testing.T) {
	_, _, err := glbStats([]byte("not a glb"))

	assert.Assert(t, err != nil)
}
```

- [ ] **Step 2: Run it — expect FAIL (undefined: glbStats)**

```bash
cd backend/services/mesh-service && GOWORK=off go test ./internal/converter/ -run GLBStats -v
```

- [ ] **Step 3: Implement `glb_stats.go`**

```go
package converter

import (
	"bytes"
	"fmt"

	"github.com/qmuntal/gltf"
)

// glbStats reads a produced GLB's accessor counts — how many positions it
// holds and how many triangles it draws. Only the glTF JSON header is
// parsed: accessor counts survive Draco compression and KTX2 textures, so
// nothing is decoded and the cost is independent of the mesh's size.
//
// A primitive with an index buffer draws indices/3 triangles; one without
// draws its positions in threes.
func glbStats(body []byte) (vertices, faces uint64, err error) {
	doc, err := gltf.NewDecoder(bytes.NewReader(body)).Decode()
	if err != nil {
		return 0, 0, fmt.Errorf("glbStats: decode: %w", err)
	}
	// A decoder given arbitrary bytes can answer an empty document rather
	// than an error, and an artifact with no mesh is not something to record
	// counts for either way.
	if len(doc.Meshes) == 0 {
		return 0, 0, fmt.Errorf("glbStats: no meshes")
	}
	for _, mesh := range doc.Meshes {
		for _, p := range mesh.Primitives {
			pos, ok := p.Attributes[gltf.POSITION]
			if !ok || int(pos) >= len(doc.Accessors) {
				continue
			}
			count := uint64(doc.Accessors[pos].Count)
			vertices += count
			if p.Indices != nil && int(*p.Indices) < len(doc.Accessors) {
				faces += uint64(doc.Accessors[*p.Indices].Count) / 3
				continue
			}
			faces += count / 3
		}
	}
	return vertices, faces, nil
}
```

Check the installed `qmuntal/gltf` v0.29's API before writing: the decoder constructor may be `gltf.NewDecoder(r).Decode()` returning `(*gltf.Document, error)` or `gltf.Decode(r)`; `Primitive.Attributes` may be `map[string]int` (index) rather than a typed handle, and `Primitive.Indices` may be `*int`. Adapt the field access to what the vendored version actually exposes — the shape above is the intent, not a promise about the API.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Write the failing LOD-loop test**

Append to `convert_lods_test.go` (it already has `fakePostprocessor` and a one-triangle OBJ in `SetupTest`):

```go
// A simplifier that hands the same GLB back stands in for gltfpack: the
// bytes are a real GLB, so the LOD carries real counts.
func (s *ConvertLODsSuite) TestLODsCarryTheirOwnCountsAndLOD0Bbox() {
	c := &Converter{
		lodRatios: []float64{0.5},
		compressor: &fakePostprocessor{
			simplifyFn: func(_ context.Context, glb []byte, _ float64) ([]byte, error) { return glb, nil },
		},
	}

	out, err := c.ConvertLODs(s.T().Context(), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
	assert.Equal(s.T(), out[1].Vertices, uint64(3))
	assert.Equal(s.T(), out[1].Faces, uint64(1))
	assert.Equal(s.T(), out[1].BBoxMin, out[0].BBoxMin)
	assert.Equal(s.T(), out[1].BBoxMax, out[0].BBoxMax)
}

// A LOD whose bytes cannot be read still ships: the artifact is complete,
// only its stats are unknown, and the bbox is LOD0's either way.
func (s *ConvertLODsSuite) TestLODWithUnreadableBytesKeepsZeroCounts() {
	c := &Converter{
		lodRatios: []float64{0.5},
		compressor: &fakePostprocessor{
			simplifyFn: func(context.Context, []byte, float64) ([]byte, error) { return []byte("garbage"), nil },
		},
	}

	out, err := c.ConvertLODs(s.T().Context(), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
	assert.Equal(s.T(), out[1].Faces, uint64(0))
	assert.Equal(s.T(), out[1].BBoxMax, out[0].BBoxMax)
}
```

(Check the suite's existing `Converter` construction — if the zero-value struct needs more fields for `ConvertLODs` to reach the LOD loop, copy what `TestAppendsForEachRatio` builds.)

- [ ] **Step 6: Run — expect FAIL (counts 0, bbox zero)**

```bash
cd backend/services/mesh-service && GOWORK=off go test ./internal/converter/ -run ConvertLODs -v
```

- [ ] **Step 7: Wire it into the loop**

`simplifyLOD` takes the raw conversion so it can copy the bbox and fall back on nothing:

```go
// simplifyLOD runs one simplification pass and packages the result with a
// fresh content hash. Vertex and face counts are read back from the produced
// GLB's glTF header; the bounding box is copied from the raw conversion,
// because simplification never moves the mesh and the box LOD0 records is in
// source units, not the normalized ones the GLB itself carries.
//
// Unreadable bytes leave the counts at zero rather than failing the LOD: the
// artifact is complete, only its statistics are missing.
func (c *Converter) simplifyLOD(ctx context.Context, raw rawGLB, ratio float64) (domain.ConversionResult, error) {
	body, err := c.compressor.Simplify(ctx, raw.content, ratio)
	if err != nil {
		return domain.ConversionResult{}, fmt.Errorf("simplify ratio=%v: %w", ratio, err)
	}
	vertices, faces, err := glbStats(body)
	if err != nil {
		slog.WarnContext(ctx, "converter: LOD stats unavailable",
			slog.Float64("ratio", ratio), slog.Any("error", err))
	}
	sum := sha256.Sum256(body)
	return domain.ConversionResult{
		ArtifactHash: hex.EncodeToString(sum[:]),
		Content:      body,
		ContentType:  "model/gltf-binary",
		Size:         int64(len(body)),
		Vertices:     vertices,
		Faces:        faces,
		BBoxMin:      raw.bboxMin,
		BBoxMax:      raw.bboxMax,
	}, nil
}
```

The call site becomes `c.simplifyLOD(ctx, raw, ratio)`. In `ConvertLODs`'s doc comment, delete the paragraph beginning "LOD>0 artifacts skip vertex/face accounting" and say instead that every LOD carries its own counts and LOD 0's source-unit bounding box.

- [ ] **Step 8: Run the package — expect PASS**

```bash
cd backend/services/mesh-service && GOWORK=off go test ./internal/converter/ -v
```

- [ ] **Step 9: The gate, then commit**

```bash
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check
git add backend/services/mesh-service
git commit -m "feat(mesh): every LOD reports its own triangles and vertices

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

- [ ] **Step 10: Live check**

Rebuild the worker (`docker compose -f docker-compose.yml up --build -d mesh-worker` — this is the slow image, it builds gltfpack), upload a throwaway model through `/models/new` with a real OBJ-bearing ZIP, wait for conversion, then:
```bash
curl -s -b cookies.txt localhost:8080/api/models/<slug>/artifacts | jq '[.[] | {lod, faces, vertices, bboxMax}]'
```
LOD 1 and LOD 2 must carry non-zero `faces`/`vertices`, monotonically below LOD 0's, and the same `bboxMax` as LOD 0. Open the model page and confirm all three artifact rows print a triangle count. Delete the throwaway.

---

### Task 3: The frontend guards

**Files:**
- Modify: `frontend-v2/src/pages/model-detail/model/use-model-detail.ts:43-46,83,87,92,96`, `use-model-detail.spec.tsx:118-124`
- Modify: `frontend-v2/src/entities/model/model/model.ts:15,19` (+ its spec), `frontend-v2/src/entities/territory/model/territory.ts:16,18` (+ its spec)
- Modify: `frontend-v2/src/entities/model/api/to-model.spec.ts:43-49`, `frontend-v2/src/entities/territory/api/to-territory.spec.ts:26-33` (comments only)
- Modify: `frontend-v2/src/entities/upload/ui/upload-progress-panel.tsx:30-45` (+ its spec)
- Modify: `frontend-v2/src/pages/replace-source/model/use-replace-source.ts:90`, `ui/replace-source-page.tsx:66` (+ specs)
- Modify: `frontend-v2/src/pages/upload-territory/model/use-upload-territory.ts:100`, `ui/upload-territory-page.tsx:78` (+ specs)

**Interfaces:**
- Consumes: Task 1's `usageCount` on `GET /api/models/{slug}`.
- Produces: `UploadProgressPanelProps.onCancel?: () => void` (optional); `modelPath` / `territoryPath` encode their slug.

- [ ] **Step 1: Invert the model-detail hook spec**

`use-model-detail.spec.tsx` currently holds `it("takes usageCount from the models list, not the single-model fetch")`. Replace it with:

```tsx
  it("reads usageCount off the model itself — the gateway sends it now", async () => {
    getModel.mockResolvedValue({ ...MODEL, usageCount: 2 });
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.model.usageCount).toBe(2);
  });
```

(Match the file's own mock names and helpers. Any other case in the file that seeds `listModels` only to feed the merge loses that seeding; do not delete cases that test something else.)

- [ ] **Step 2: Run — expect FAIL or a stale mock error**

```bash
cd frontend-v2 && yarn vitest run src/pages/model-detail/model/use-model-detail.spec.tsx
```

- [ ] **Step 3: Drop the merge**

In `use-model-detail.ts`: delete the `models` query, its `isPending` entry in the `loading` gate, its `unanswered(...)` entry in the error gate, the `usageCount` const, and the spread in the ready state (`model: model.data!`). Delete the doc comment that explained why the extra query existed. Remove `modelsQuery` / `listModels` from the imports if nothing else uses them.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Encode the two catalog paths**

`entities/model/model/model.ts`:
```ts
export const modelPath = (slug: string) => `/models/${encodeURIComponent(slug)}`;
```
`entities/territory/model/territory.ts` likewise. Their specs gain one case each:
```ts
  it("encodes a slug that needs it", () => {
    expect(modelPath("a b")).toBe("/models/a%20b");
  });
```
Then the two inline templates:
```ts
// use-replace-source.ts
leaveTo(`/territories/${encodeURIComponent(replaced.slug)}?jobId=${job.id}`);
// use-upload-territory.ts
leaveTo(`/territories/${encodeURIComponent(territory.slug)}?jobId=${job.id}`);
```
Also correct the two stale comments: `model.ts`'s `usageCount` and `territory.ts`'s `placementCount` no longer say "a Get path defaults it to 0" — both endpoints fill them, and the `?? 0` in the mappers is for the omitted-when-zero key. Same wording fix in `to-model.spec.ts` / `to-territory.spec.ts` where a comment repeats the old claim; their assertions stay.

- [ ] **Step 6: Make Cancel optional**

`entities/upload/ui/upload-progress-panel.tsx`:
```tsx
export type UploadProgressPanelProps = {
  busy: boolean;
  progress?: UploadProgressView;
  canSubmit: boolean;
  submitLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  onSubmit: () => void;
  /** Omitted once the bytes are done: the final POST takes no abort signal, so a Cancel there would do nothing. */
  onCancel?: () => void;
};
```
and the button becomes `{busy && onCancel ? <Button …>{cancelLabel}</Button> : null}`. Its spec gains a case: `busy` with no `onCancel` renders no Cancel button, and the submit still reads its busy label.

Call sites:
```tsx
// replace-source-page.tsx
onCancel={phase === "uploading" || phase === "finalizing" ? onCancel : undefined}
// upload-territory-page.tsx — same expression against its own phase union
```
`isBusy` and the `busy` prop are untouched. Each page's spec gains a case: in the final phase (`replacing` / `creating`) the panel shows the busy submit and no Cancel.

- [ ] **Step 7: Run the suites — expect PASS**

```bash
cd frontend-v2 && yarn vitest run src/pages/model-detail src/pages/replace-source src/pages/upload-territory src/entities/upload src/entities/model src/entities/territory
```

- [ ] **Step 8: Lint, coverage, live check, commit**

```bash
cd frontend-v2 && yarn lint && yarn test:coverage
```
Live (the stack from Tasks 1-2 is already rebuilt): open a model page for a placed model — the About row reads `in N territories` and the Network panel shows **no** `/api/models` request; start a replace on a throwaway territory and watch Cancel vanish when the bar reaches 100 % and the phase turns to the final POST. Delete the throwaway.

```bash
git add frontend-v2/src
git commit --no-verify -m "fix(frontend-v2): the model page trusts its own endpoint, catalog paths encode their slug, and Cancel goes when the bytes are done

Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 4: Docs

**Files:**
- Modify: `CLAUDE.md` (the gateway-endpoints section, where the counts' scope is described), `frontend-v2/CLAUDE.md` (any line saying the model page reads the library for its usage count), the spec's §7

- [ ] **Step 1:** In the root `CLAUDE.md`, find the `GET /api/models` / `GET /api/territories` bullets and the sentence about `placementCount`/`usageCount` being list-only; say both the list and the single GET carry them, omitted when zero. Add one line to the mesh/LOD paragraph: every LOD now records its own triangle and vertex counts, and shares LOD 0's source-unit bounding box. In `frontend-v2/CLAUDE.md`, correct anything that says the model page merges the count from the library. Tick §7 in the spec.
- [ ] **Step 2:** Commit:
```bash
git add CLAUDE.md frontend-v2/CLAUDE.md docs/superpowers/specs/2026-09-07-single-get-counts-and-lod-metadata-design.md docs/superpowers/plans/2026-09-07-single-get-counts-and-lod-metadata.md
git commit --no-verify -m "docs: the single GETs carry their counts and every LOD carries its stats

Docs-only; the backend gate is skipped with --no-verify because nothing under backend/ changes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

## Parallelism

Tasks 1 and 2 touch disjoint services and can run in parallel; both run the backend gate, which is repo-wide, so the second to finish re-runs it after rebasing on the first. Task 3 needs Task 1 committed (its live check depends on the gateway change) — dispatch it after Task 1's review. Task 4 last.
