# Password reset, entity editing, source-replace fix, request batching — design

Date: 2026-09-23. Branch: off `dev`. One spec, four independent parts (A–D),
each landing as its own commits and review. Order: A → B → C → D — D last so
it batches the endpoints A–C leave behind.

Skills per task (the plan repeats them per task): common `ponytail:ponytail`,
`clean-code`, `senior-architect`, `superpowers:test-driven-development`; Go
`modern-go-guidelines:use-modern-go` then `cc-skills-golang:golang-how-to`
(which loads `golang-testing`, `golang-database`, `golang-security`,
`golang-error-handling` as needed); frontend `react-best-practices`,
`tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`.

---

## A. Admin password reset (`/console/users`)

**Goal.** Root resets anyone's password; a Company Owner resets only users they
created. No old password asked. The dialog generates one immediately, allows
typing one, and copies it.

### Backend
- `auth.proto`: `rpc SetUserPassword(SetUserPasswordRequest{actor, id, password}) returns (Empty)`.
- `service/users/set_password.go` — `Service.SetPassword(ctx, actorID, scopeAll, id, password)`:
  1. `ownership(ctx, actorID, scopeAll, id)` — out of scope is `ErrUserNotFound` (404, never 403).
  2. `actorID == id` → `ErrSelfTarget` (own password goes through `/account`, which asks the old one).
  3. Target holds `admin` and actor is not owner → `ErrAdminOwnerOnly`. Deliberately
     not `guard()`: the last-admin rule protects against losing admins, a
     password reset loses nobody.
  4. `validate.Password`, `password.Hash` (argon2id, same params as create).
  5. Storage write through `audittx.Run` (the trigger records "password changed,
     by whom" and hides the hash — same as `change_password.go`).
  6. `sessions.DeleteUser(ctx, id)` — the user is signed out everywhere. A
     failure here is returned as an error after the password is already
     changed; the handler logs it and still answers 500 so the admin retries
     (a retry re-sets the same password and re-deletes — idempotent).
- Gateway: `PUT /api/auth/users/{id}/password`, body `{password}`, 204,
  `Require("users:write")`, CSRF as every mutation. openapi entry + error
  mapping reusing `server.go`'s existing codes for weak password, admin-owner-only,
  not-found and self-target.
- Not added to `authAuditActions`: the trigger already logs it (double-logging rule).

### Frontend
- `features/reset-password/` — `ResetPasswordDialog` reusing `PasswordField`,
  `generatePassword`, `validatePassword`, `copyText` exactly as
  `create-user-dialog.tsx` does. Opens pre-filled with a generated password,
  revealed, with "Generate" and "Copy" actions.
- Row action "Change password" in the users screen, hidden for the caller's own
  row and for admin rows when the caller is not Root.
- Success toast: "Password changed. The user was signed out everywhere."

### Tests
- Service table test: owner→any, company owner→own user, company owner→foreign
  user (404), →self (self-target), non-owner→admin (admin-owner-only), weak
  password; `DeleteUser` called once on success, never on refusal.
- Gateway handler test + route-permission test entry.
- Dialog test: pre-filled, generate replaces, copy calls `copyText`, submit sends
  the typed value.

Out of scope: signing out other sessions on a *self* password change.

---

## B. Edit title and description (models, territories)

**Goal.** Title and description editable for both. Slug is immutable (URLs,
Redis job keys `{kind}:{slug}`, `RequireTerritoryAccess` all key on it).

### Backend
- openapi: `ModelUpdate` and `TerritoryUpdate` gain optional `title`
  (`minLength: 1`, same `maxLength` as create) and `description`. Omitted =
  unchanged; present-but-blank title = 400.
- Gateway `service/models.go` / `service/territories.go` update paths merge the
  two fields into the read row before the existing `Upsert*`. Permissions stay
  `model:write` / `territory:write`. No catalog change.
- Audit: the table trigger already records the row change.
- Last-writer-wins, no If-Match — accepted; add optimistic locking only if
  concurrent edits become a real complaint.

### Frontend
- `features/edit-entity/` — one `EditDetailsDialog({kind, slug, title, description})`
  with a title input and a description textarea, submit disabled while unchanged
  or title blank.
- Entry points: model detail aside; territory viewer header (next to "Replace
  source"); the territory catalog card menu. Shown only with the write grant.
- On success: `setQueryData` for the single entity and the list entry, no refetch.

"Update the object on every territory" needs no work: `/scene` reads the model
row on every request.

### Tests
Gateway service tests (title/description merge, blank title 400, omitted fields
untouched); dialog test; permission-gated visibility test.

---

## C. Source replace keeps every binding in place

**Today.** `RescaleTerritoryPlacements` multiplies placement position/scale and
measurement points by `old_max/new_max`. It ignores the bbox **centre** shift
and does not touch **panoramas** at all. Documents have no coordinates.

**Math.** Normalisation is `s = (p − c)·2/M` (c = bbox centre, M = max axis).
Old scene space → new: `s' = s·(M/M') + (c − c')·2/M'`. Scale factors multiply
by `M/M'` only. Rotations and `yaw_offset` are unchanged (normalisation does
not rotate).

### Changes
1. Catalog migration: `territories.rescale_baseline_center_{x,y,z} DOUBLE PRECISION NULL`.
2. `SetTerritoryRescaleBaseline(slug, max, centre)` writes all four only when
   none is pending (existing "first replace wins" rule). Gateway
   `captureRescaleBaseline` passes the old LOD0 bbox centre.
3. `RescaleTerritoryPlacements(slug, newMax, newCentre)` — proto + mesh worker
   pass LOD0's centre alongside `newMax`. The single SQL statement applies the
   full formula to placement positions, measurement points (flat `x,y,z`
   triples in `points`) and a **new `panoramas` CTE** (catalog owns the
   `panoramas` DDL, migration 00004, shared DB — no content RPC, no
   double-apply on retry), then clears all baseline columns.
4. A NULL baseline centre is treated as zero offset, so a replace captured
   before the deploy completes with today's scale-only behaviour.

**Assumption, stated in the code comment:** old and new sources share one
coordinate frame (a re-scan of the same site in the same georeference). A
source in a different frame cannot be aligned automatically; manual calibration
is out of scope.

### Tests
Storage integration test: one placement, one measurement, one panorama; given
old bbox (c, M) and new bbox (c', M'), each point's reconstructed world position
`s·M/2 + c` is unchanged within 1e-9, scale scaled by M/M', baseline cleared;
NULL-centre case matches the old scale-only result.

---

## D. Fewer requests

Old per-item endpoints stay (other screens use them); the SPA stops calling
them in bulk.

### D1. Frontend caching (frontend only)
- `query-client.ts`: `staleTime: 60_000`, `refetchOnWindowFocus: false`.
  Polls keep their `refetchInterval`; mutations keep explicit invalidation.
- Viewer `onChanged`: `invalidateQueries(["scene", slug], { refetchType: "none" })`.
- Conversion page: territory and LOD chain from the `sceneQuery` cache (drops
  `GET /territories/{slug}` and `/artifacts`); the 5 s `/api/jobs` poll is off
  while the SSE stream is open and back on when it errors or closes.
- Roles save invalidates `roles` only; user mutations write the returned user
  with `setQueryData` instead of invalidating the list.

### D2. LOD summary on list payloads
- `Territory` and `Model` in `GET /api/territories` / `GET /api/models` carry
  `lods: LodArtifact[]` (schema exists, sorted by lod).
- Catalog: one `SELECT … FROM territory_artifacts WHERE territory_id = ANY($1)`
  (and the model twin) per list call, keyed by the unique `(…_id, lod)` index.
- SPA: the `useQueries(artifactsQuery)` loops in territory catalog, model
  library, content and Home are deleted; mappers read `lods`.

### D3. Batch endpoints
1. **`GET /api/territory-admins`** → `{ [slug]: userId[] }` over the caller's
   visible territories. Not `/api/territories/admins`: chi would shadow a
   territory whose slug is `admins`. It sits outside `/api/territories/{slug}`,
   so `RequireTerritoryAccess` does **not** cover it — the handler filters by
   the same visible-set resolver `GET /api/territories` uses, and the
   two-tenant test pins that. Catalog: one `… WHERE territory_id = ANY($1)`.
2. **Metrics:** `GET /api/metrics/query` takes repeated `panel` and returns
   `{ [panel]: MetricSeries[] }`; Prometheus queries run in parallel through
   `errgroup` with `SetLimit(4)`. The single-panel shape is replaced (the SPA is
   its only consumer). Metrics page: one query instead of 19.
3. **`POST /api/territories/{slug}/placements/batch`** `{ items: PlacementCreate[] }`,
   1–100 items, one catalog transaction under `audittx.Run`, returns the created
   placements. Route permission `placement:create`; inherits
   `RequireTerritoryAccess`. Replaces the N sequential POSTs in
   `use-placements-editor` (and its `ponytail:` comment).
4. **Role in one call:** `PATCH /api/auth/roles/{slug}` accepts `title` and
   `permissions` together, applied in one auth-service transaction with the
   existing grant checks. `PUT …/permissions` stays; the SPA stops calling it.

### D4. Home summary
- **`GET /api/console/summary`** → numbers only, one key per card the caller
  can open: `users`, `roles`, `content {territories, models}`, `access`,
  `audit24h`, `alerts`. A card the caller cannot open is absent and its source
  is never queried; each card's gate is the same permission its console screen
  requires (the plan pins the table from `console-nav`). A failed source is
  `null` for that card only. Fan-out through `errgroup`; `Cache-Control: no-store`.
- Hint wording stays on the frontend (`usersHint`, etc. take numbers).
- `use-console-counters` becomes one `useQuery`.

### Tests
- Per endpoint: gateway handler test, route-permission entry, storage test for
  the `ANY($1)` queries, tenant isolation for `territory-admins` and `summary`
  on the two-tenant fixture.
- Frontend: hook tests that count fetch calls (e.g. Content = territories +
  models + jobs + me, independent of row count; Metrics = 1 per tick).

Out of scope: a generic batch/GraphQL layer; merging the two `/api/audit` calls
on the journal page.

---

## Gates
- `make -C backend check` (with the `CC=/usr/bin/clang SDKROOT=…` override) per Go commit.
- `frontend`: lint, `test:coverage` thresholds, build.
- Regenerate openapi Go/TS types after each openapi change.
