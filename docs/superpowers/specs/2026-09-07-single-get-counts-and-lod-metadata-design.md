# Single-GET counts, LOD metadata, and two frontend guards

Date: 2026-09-07. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Closes four follow-ups the Model Detail / Replace Source package
recorded (`.superpowers/sdd/2026-09-06-model-detail-and-replace-source/progress.md`).

## Goal

`GET /api/models/{slug}` and `GET /api/territories/{slug}` carry the same
counts their list endpoints do, so the model page stops fetching the whole
library to learn one number. Every LOD an artifact chain holds carries its
own triangle and vertex counts, so the model page's artifact rows stop going
silent for LOD 1 and 2. Two small frontend guards land beside them.

## Decisions (user)

- **`faces`/`vertices` for LOD 1-2 come from parsing the produced GLB**
  (`gltf.Decode` over the bytes gltfpack already returned in memory), not
  from scraping gltfpack's stdout and not from an estimate. `qmuntal/gltf`
  is already a direct dependency of mesh-service.
- **Old artifacts are not backfilled.** No reconversion pass, no CLI, no
  endpoint. The frontend already omits the triangle segment when `faces` is
  0, so pre-existing rows stay quiet; new and re-uploaded ones carry numbers.
- All four follow-ups ship in one package.

## Rulings (controller)

- **`bboxMin`/`bboxMax` are copied from LOD 0 into every LOD**, not read back
  from the simplified GLB. Simplification does not move the mesh, and the
  numbers LOD 0 records are the *source-unit* extents (pre-normalisation),
  which is what `unitRatio` and `rescalePlacements` depend on. The bbox the
  produced GLB carries is the normalised one (max axis = 2) and would be a
  different quantity under the same column name.
- **A failed decode does not fail the conversion.** The LOD keeps today's
  zeros and the job continues; metadata is a nice-to-have on an artifact that
  is otherwise complete.
- **`isBusy` is not narrowed.** It also drives the submit button's spinner, so
  the Cancel button's visibility moves to whether an `onCancel` handler is
  passed at all: `UploadProgressPanel.onCancel` becomes optional and the
  button renders only when it is present.
- **Upload Models is not changed.** Its Cancel during a row's `creating`
  phase stops the queue after the current row — a real effect, unlike the two
  single-file pages where the abort signal belongs to an upload that already
  finished.
- **`encodeURIComponent` lands in `modelPath`/`territoryPath` and in the two
  `leaveTo` templates.** Slugs are minted server-side from `[a-z0-9-]`, so
  this fixes nothing observable today; it is a guard against a future change
  to the slug generator, in the one place every caller routes through.
- The proto/domain/openapi comments that say the counts are "filled by the
  list endpoint only" become false and are rewritten in the same commit as
  the SQL, not left for a later pass.

## 1. Catalog-service — the counts on the single GET

`internal/storage/get_model.go` takes the `SELECT` shape of
`list_models.go`: columns qualified to `m.`, plus
`(SELECT COUNT(DISTINCT p.territory_id) FROM placements p WHERE p.model_id = m.id) AS usage_count`,
scanned by `scanModelListed`.

`internal/storage/get_territory.go` likewise takes `list_territories.go`'s
`(SELECT COUNT(*) FROM placements p WHERE p.territory_id = t.id) AS placement_count`
and `scanTerritoryListed`. Its existing `$2` scope `EXISTS` clause is
untouched.

`scanTerritory`/`scanModel` stay: the four INSERT…RETURNING paths
(`create_*`, `upsert_*`) still use them. Their doc comments in `queries.go`
lose the "used only by ListTerritories'/ListModels' correlated-count query"
claim.

Nothing else in catalog-service changes: `grpcapi/converters.go` already maps
both fields in both directions, and the service layer is validate-and-forward.

Comments rewritten (no behaviour): `proto/rosneft/catalog/v1/catalog.proto`
on `placement_count` / `usage_count` (then `make -C backend proto-gen`, which
rewrites the copies in `catalog.pb.go`), and `catalog-service/internal/domain/types.go`.

## 2. Gateway-service — descriptions and tests only

`internal/clients/catalog/converters.go`, `internal/domain/types.go`'s fields,
the two handlers and `httpapi/converters.go` are all correct as they stand:
the omit-when-zero JSON rule is deliberate and stays, and the v2 mapper's
`?? 0` already reads a missing key as zero.

Changed: the two doc comments in `gateway-service/internal/domain/types.go`,
and `api/openapi.yaml`'s two descriptions — "filled on the list endpoint"
drops out, "omitted when zero" stays, and the model's "across every
territory" scope note stays. Then `make -C backend openapi-gen` (regenerating
`openapi_gen.go` and `openapi_spec_gen.go`) and `cd frontend-v2 && yarn
openapi:generate` for `dto.ts`.

Tests: `httpapi/list_counts_test.go`'s `TestGetTerritoryLeavesPlacementCountAbsent`
and `TestGetModelLeavesUsageCountAbsent` assert the old contract and are
inverted — the stubs return non-zero counts and the tests assert the JSON
carries them. The suite's doc comment says the new contract.
`catalog-service/internal/storage/list_counts_integration_test.go` gains two
assertions against the same fixture: `GetTerritory("yard", "")` reports 3
placements and `GetModel("pump")` reports 2 distinct territories — the same
`COUNT` vs `COUNT(DISTINCT …)` distinction the list test already pins.

## 3. Mesh-service — per-LOD metadata

New `internal/converter/glb_stats.go`: `glbStats(body []byte) (vertices, faces uint64, err error)`
reads the GLB container's JSON chunk by hand and `json.Unmarshal`s it into a
`gltf.Document`, then sums each mesh primitive's POSITION accessor `Count`
for vertices, and its indices accessor `Count / 3` for faces; a primitive
drawn without indices counts `POSITION.Count / 3`. The JSON header carries
these counts however the payload is compressed, so nothing is decompressed.

The library's own `gltf.Decode` is deliberately **not** used: it walks every
declared buffer after parsing the JSON, and gltfpack's `-cc` output declares
an `EXT_meshopt_compression` fallback buffer that has a length but no URI and
no data — a buffer a reader is meant to skip. `Decode` rejects it with
`gltf: buffer without URI`, which is exactly how this shipped zeros on the
first pass and was caught by the live check. Unmarshalling the JSON chunk
still runs the library's own per-type validators, so only the buffer-reading
phase is skipped.

`convert_lods.go`'s `simplifyLOD` gains the raw LOD-0 result as an argument
(or the loop passes `raw`'s bbox and the fallback counts). Each simplified
LOD's `ConversionResult` gets:

- `BBoxMin`/`BBoxMax` copied from the raw conversion, unconditionally;
- `Vertices`/`Faces` from `glbStats` when it succeeds, and left at 0 when it
  errors — no wrapping, no job failure.

The two comments that say LOD>0 skips accounting "because parsing the
simplified GLB to count faces is expensive" are deleted; the expense turned
out to be a JSON header parse over bytes already in memory.

Persistence needs no change: `persistLOD` already forwards all four fields,
and `RegisterTerritoryArtifact`/`RegisterModelArtifact` upsert them by
`(entity, lod)`.

Tests: a new `glb_stats_test.go` builds a small GLB with the encoder the
converter already uses (`write_glb.go`'s path) and asserts the counts, plus
one case for malformed bytes returning an error. `convert_lods_test.go` gains
a case that every returned LOD carries LOD 0's bbox and, where the fake
postprocessor returns a real GLB, non-zero counts.

## 4. Frontend-v2

- `use-model-detail.ts` drops the `modelsQuery` query, its loading/error
  participation and the `usageCount` merge; the ready state returns
  `model.data` as it stands. `use-model-detail.spec.tsx`'s "takes usageCount
  from the models list" case inverts: the single fetch's value is what the
  page shows. `entities/model/model/model.ts` and the two mapper specs lose
  their "a Get path defaults it to 0" notes.
- `modelPath` and `territoryPath` encode their slug. The two `leaveTo`
  templates that build a territory URL inline (`use-replace-source.ts`,
  `use-upload-territory.ts`) encode theirs too.
- `UploadProgressPanel.onCancel` becomes optional; the Cancel button renders
  only when it is passed. `replace-source-page.tsx` passes it while the phase
  is `uploading` or `finalizing`, not while `replacing`;
  `upload-territory-page.tsx` does the same against `creating`. `isBusy` and
  the `busy` prop are unchanged, so the submit button still reads
  "Uploading…" through the final POST.

## 5. Out of scope

Backfilling old artifacts (decided against); a model replace-source route;
Upload Models' cancel semantics; making `createTerritory`/`createModel`/
`replaceTerritorySource` cancellable (they take no `AbortSignal`, and adding
one is a larger change than this package).

## 6. Testing

- Go: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check`
  green before each Go commit. The catalog integration suite is behind the
  `integration` tag and needs Docker: `go test -tags=integration ./internal/storage/`
  from `services/catalog-service`.
- Frontend: `yarn lint` and `yarn test:coverage` (90/85/90/90).
- Live, on a stack rebuilt from the new images
  (`docker compose -f docker-compose.yml up --build -d catalog gateway mesh-worker`;
  catalog and gateway go up together because they share the local proto
  module): upload a territory and a model, wait for conversion, then check
  `GET /api/models/{slug}` carries `usageCount` for a placed model, and that
  the model page's LOD 1 and LOD 2 rows print triangle counts. The model page
  makes no `/api/models` request. Cancel disappears once the upload's bytes
  are done.

## 7. Order of work

1. Catalog + gateway: the two SQL statements, the comments, the two codegen
   passes, the inverted gateway tests, the integration assertions. — done
2. Mesh-service: `glbStats`, the LOD loop, the tests. — done
3. Frontend-v2: the `usageCount` merge removed, the path encoding, the
   optional `onCancel`. — done
4. Docs: the two CLAUDE.md files where the old behaviour is written down. — done
