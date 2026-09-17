# Persisted measurements — plan

Spec: `docs/superpowers/specs/2026-09-17-persisted-measurements-design.md`.
Ledger and status: `.superpowers/sdd/2026-09-17-measurements-and-system-roles/`.
Base: `a3ff876` plus the system-roles commit (task R).

Every backend task loads, through the Skill tool, before any code:
`ponytail:ponytail`, `clean-code`, `superpowers:test-driven-development`,
`modern-go-guidelines:use-modern-go` (and runs its `list --file-path` on
each Go file it edits), `cc-skills-golang:golang-how-to`,
`cc-skills-golang:golang-database`, `cc-skills-golang:golang-grpc`,
`cc-skills-golang:golang-testing`, `cc-skills-golang:golang-error-handling`,
`cc-skills-golang:golang-security`, `cc-skills-golang:golang-naming`,
`cc-skills-golang:golang-code-style`. Frontend tasks load `ponytail:ponytail`,
`clean-code`, `superpowers:test-driven-development`, `react-best-practices`,
`senior-frontend`, `tailwind-patterns`, `frontend-design:frontend-design`,
`emil-design-eng`, `threejs-interaction` (task M6).

Rules for every task: TDD (break → red → restore → green); the backend gate
is `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check`
run by the coordinator on a quiet tree; the frontend gate is
`yarn lint && yarn test:coverage && VITE_API_URL= yarn build`, also the
coordinator's. Commits by path, `--no-verify` only
for frontend-only commits, last line exactly
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never stage
`.claude/settings.json` or `backend/go.work.sum`.

## M1 — catalog-service: table, storage, service

1. Migration `00015_measurements.sql` (spec §Backend) with Up and Down.
2. `domain/measurement.go`: `Measurement{ID, TerritorySlug, Points []Vec3,
   Closed, CreatedBy, CreatedAt, UpdatedAt}`, `ErrMeasurementNotFound`.
3. Storage: `list_measurements.go`, `create_measurement.go`,
   `update_measurement.go`, `delete_measurement.go`,
   `delete_measurements.go` — every write in `audittx.Run`, every
   id-addressed statement scoped by slug; flatten/unflatten helpers with
   their own test.
4. `rescale_territory_placements.go`: a `measurements` CTE with the same
   factor and guard; comment updated.
5. Service: validation (≥2 points, closed ⇒ ≥3, ≤1 000 points, finite
   values) and the five methods.
6. Tests: storage integration (spec §Tests), service unit tests with the
   existing mocks pattern.

## M2 — proto and catalog gRPC transport

1. `catalog.proto` messages and five RPCs; `make -C backend proto-gen`.
2. `transport/grpcapi` handlers + converters + error mapping
   (`ErrMeasurementNotFound` → `NotFound`, validation → `InvalidArgument`).
3. Transport tests in the existing style.

## M3 — grants and audit

1. auth-service `00017_measurement_permissions.sql` (spec M-2), with its
   seed test; the same migration corrects `territory:write`'s description
   from "create/update territories" to "update territories" (creation is
   `territory:create`, Root only).
2. audit-service migration `00005_audit_measurements.sql` re-creating `ensure_audit_triggers()` with the
   `measurements` row; confirm an empty label with a non-empty pk is
   supported, extend the function if not; its test.

## M4 — gateway-service

1. `openapi.yaml`: `Measurement`, `MeasurementWrite`, five operations,
   `SceneBundle.measurements`; `make -C backend openapi-gen`.
2. `clients/catalog`: five calls; `domain.Measurement`.
3. `service`: five methods; scene bundle fetches measurements in the
   errgroup (a not-found territory yields an empty list, like placements).
4. `transport/httpapi/measurements.go`: handlers passing `req.Slug`,
   point flatten/rebuild, status mapping; converters.
5. `route_permissions.go`: four entries (spec §gateway).
6. Tests: handlers, route permission table, scene bundle, not-found for a
   foreign id.
7. Coordinator: backend gate; `docker compose up -d --build catalog-service
   auth-service audit-service gateway-service` (check the image was really
   rebuilt — memory: a failed token fetch silently reuses the old image);
   live curl matrix — admin creates/updates/deletes; editor creates;
   guest1/viewer GET 200, POST 403; cotest (other tenant) GET 404 on
   `dji-wp46-cut`, and PUT/DELETE of a dji measurement id through
   `tenant-a-scene` answer 404 and leave the row. Nothing touches
   placements 22/23 or panorama 1. Test rows are deleted at the end.
8. Commit: `feat(backend): persisted measurements …` (Go gate ran).

## M5 — frontend-v2: data layer

Order: steps 4–5 (pure, API-independent) run in parallel with S and M1–M4;
steps 1–3 need the regenerated DTO and run after M4.

1. `yarn openapi:generate`.
2. `entities/measurement/api/`: gateway (five calls) and `to-measurement`
   mapper, with specs.
3. `entities/scene`: the view model carries saved chains.
4. Reducer: `seed`, `saved`, `unsaved` actions; `Chain` gains
   `serverId?`, `saved`; `removeSegment` keeps the left part's server id.
5. `syncPlan(before, after, grants)` — pure, table-tested: finish →
   create (≥2 points, `create` grant) or drop (1 point); removeChain of a
   saved chain → delete; removeSegment of a saved chain → update/create/
   delete per spec D-2; clear → deleteAll (confirmed upstream).

## M6 — frontend-v2: behaviour and UI

1. `features/measure/model/use-measurement-sync.ts`: runs `syncPlan`,
   calls the gateway, dispatches `saved`/`unsaved`, reverts a failed
   delete, one toast with `Retry`; spec with a mocked gateway.
2. `use-territory-viewer.ts` grants; `page-props` passes them; the layer
   hides remove affordances on saved chains without the grants.
3. `Clear`: `ConfirmDialog` when saved chains exist and the reader holds
   `measurement:delete`; otherwise clears local chains silently.
4. The strip chip's ` · not saved`.
5. Fixtures: saved, unsaved, reader. Audit vocabulary names `measurement`.
6. Live pass (spec §Frontend) in both themes; screenshots in the ledger.
7. Docs: root `CLAUDE.md` endpoint list gains the measurements routes;
   `frontend-v2/CLAUDE.md` gains a "Measurements are saved when a chain
   ends" paragraph.
8. Coordinator: frontend gate; commit by path.

## Review

Each task gets its own reviewer (same skill list as its implementer) with
the diff, the spec section and this plan; a final whole-feature review after
M6, then the gates on the head.
