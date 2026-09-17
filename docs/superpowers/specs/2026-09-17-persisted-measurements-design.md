# Persisted measurements

Date: 2026-09-17. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch), head `a3ff876`. Ledger:
`.superpowers/sdd/2026-09-17-measurements-and-system-roles/`.

## Goal

The viewer's ruler survives a reload. Today a measurement chain lives only
in `useMeasurementTool`'s reducer: there is no table, no RPC and no route
for it — the old SPA never stored one either — so every refresh wipes the
scene's measurements. After this change a finished chain is written to the
database, belongs to the territory, and every reader of that territory sees
it the next time the scene loads.

## Decisions (user, 2026-09-17)

- **M-1 Shared per territory.** A measurement is an annotation on the
  territory, like a placement, not a personal note. Everyone who can open the
  territory sees every saved measurement.
- **M-2 New grants.** `measurement:read`, `measurement:create`,
  `measurement:write`, `measurement:delete`, seeded like the placement
  grants: `read` for all five system roles; `create`/`write`/`delete` for
  `admin` (Company Owner) and `editor` (Scene Editor). Custom roles get
  nothing automatically (as with every earlier grant); a Company Owner can
  add them in the role editor.
- **M-3 Only a finished chain is saved.** A chain is finished the moment it
  stops being the active chain — closed by a click on its start, by
  `Close measurement chain`, by Escape, or by leaving measure mode — and is
  saved then if it has at least two points. A single-point chain is dropped,
  never saved. While a chain is being drawn nothing is sent; a reload
  mid-chain loses only that chain.
- **M-4 Clear asks first.** `Clear` opens a confirm dialog naming the count
  ("Delete all N measurements on this territory?") and deletes every saved
  measurement on the territory — they are shared, so this is everyone's.

## Further decisions (proposed, confirmed by the user 2026-09-17)

- **D-1 A reader still measures.** Without `measurement:create` the tool
  works exactly as today — the chains are drawn and summed — but stay local
  and vanish on reload. The strip's measure chip says `not saved` for such a
  chain so the difference is visible. Saved chains are drawn for everyone;
  their per-segment and per-chain remove affordances show only with
  `measurement:write`/`measurement:delete`. `Clear` for a reader clears only
  their local chains and asks nothing.
- **D-2 Editing a saved chain.** Removing a segment of a saved chain is a
  write: the chain is split by the existing pure `removeSegment`; the
  first surviving part (the left, else the right) keeps the saved id
  (`PUT`), a second surviving part is a new row (`POST`), and a chain with
  no part left is deleted. Removing a
  whole chain is a `DELETE`. A saved chain is never extended — clicking in
  measure mode always starts a new chain, as now.
- **D-3 No label, no owner column in the UI.** The row carries
  `created_by` for the audit trail only; the viewer does not show authors.
- **D-4 Failure is loud and reverts.** A failed save leaves the chain on
  screen as unsaved (the `not saved` chip) and raises one error toast with a
  `Retry`; a failed delete puts the chain back.

## Backend

### catalog-service owns the table

Measurements are points in the territory's normalised scene space, exactly
like placement positions, so they live beside placements and are rescaled
with them.

Migration `00015_measurements.sql`:

```sql
CREATE TABLE measurements (
    id            BIGSERIAL PRIMARY KEY,
    territory_id  BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    points        DOUBLE PRECISION[] NOT NULL,   -- x0,y0,z0,x1,y1,z1,…
    closed        BOOLEAN NOT NULL DEFAULT FALSE,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT measurements_points_shape CHECK (
        cardinality(points) >= 6 AND cardinality(points) % 3 = 0
        AND (NOT closed OR cardinality(points) >= 9)
    )
);
CREATE INDEX idx_measurements_territory ON measurements(territory_id);
```

A flat `double precision[]` rather than JSONB because the rescale multiplies
every element by one factor (`ARRAY(SELECT v * f FROM unnest(points) v)`),
and the check constraint can enforce the shape. A server-side cap of 1 000
points per chain (validation in the service, `ErrInvalidInput`).

Storage (every write through `audittx.Run`), each scoped by territory slug
in SQL, never by id alone:

- `ListMeasurements(slug)` — ordered by id.
- `CreateMeasurement(slug, points, closed)` — `created_by` from the actor on
  the context.
- `UpdateMeasurement(slug, id, points, closed)` —
  `WHERE m.id = $id AND m.territory_id = t.id AND t.slug = $slug`.
- `DeleteMeasurement(slug, id)` — same scoping.
- `DeleteMeasurements(slug)` — all rows of the territory; returns the count.

An id that exists under another territory answers `ErrMeasurementNotFound`,
the same 404 as an unknown id.

`RescaleTerritoryPlacements` gains a CTE that multiplies every measurement
point of the territory by the same `old_max / newMax` factor, inside the
same statement, so a source replace keeps rulers 1:1 with the new mesh. The
RPC name stays (mesh-service calls it); its doc comment says it now carries
measurements too.

### Proto

`catalog.proto`: `Measurement { id, territory_slug, repeated double points,
closed, created_at, updated_at }` and `ListMeasurements`,
`CreateMeasurement`, `UpdateMeasurement`, `DeleteMeasurement`,
`DeleteMeasurements`; every request carries `territory_slug`. `buf generate`.

### auth-service

Migration `00017_measurement_permissions.sql` — inserts the four
permissions and grants them per M-2, with a `Down` that removes them.

### audit-service

A migration that `CREATE OR REPLACE`s `ensure_audit_triggers()` with
`ARRAY['measurements', 'measurement', 'id', '']` added (no label column —
the empty label is the composite-key convention's form; check the function
accepts an empty label with a non-empty pk, and extend it if not).
`frontend-v2`'s audit vocabulary names the `measurement` entity.

### gateway-service

`openapi.yaml`:

- `GET /api/territories/{slug}/measurements` → `Measurement[]`.
- `POST /api/territories/{slug}/measurements` `{points: Vec3[], closed}` →
  `201 Measurement`.
- `PUT /api/territories/{slug}/measurements/{id}` `{points, closed}` →
  `Measurement`.
- `DELETE /api/territories/{slug}/measurements/{id}` → `204`.
- `DELETE /api/territories/{slug}/measurements` → `200 {deleted: n}`.
- `SceneBundle` gains `measurements: Measurement[]` (required, possibly
  empty), fetched in the same errgroup.

`route_permissions.go`: POST → `measurement:create`, PUT →
`measurement:write`, both DELETEs → `measurement:delete`. The GET needs only
the session, as every content read does. All five routes sit under
`/api/territories/{slug}` and inherit `RequireTerritoryAccess`. The
handlers pass `req.Slug` down on every call. `oapi-codegen`, then
`yarn openapi:generate` in `frontend-v2`.

On the wire a point is `{x, y, z}` (the frontend's `MeasurePoint`); the
gateway flattens it for the RPC and rebuilds it on the way back.

### Tests

- catalog storage integration: create/list/update/delete/delete-all; the
  cross-territory id answers not-found on update and delete; the check
  constraint refuses 1 point and a closed 2-point chain; the rescale
  multiplies measurement points and leaves another territory's alone.
- catalog service: validation (point count, cap, finite values).
- gateway: handler mapping and status codes; route permission table test;
  scene bundle includes measurements; not-found for a foreign id.
- auth: migration applies and grants per M-2 (the existing seed test
  pattern).
- `make -C backend check` (with `CC=/usr/bin/clang
  SDKROOT=$(xcrun --show-sdk-path)`), and a live check against the compose
  stack after `docker compose up -d --build` of catalog, auth, audit and
  gateway.

## Frontend (frontend-v2)

- `entities/measurement/api/measurements-gateway.ts` + `to-measurement.ts`
  (DTO → `Chain` with the server id); `scene-view-model` carries the saved
  chains.
- The reducer learns where chains come from: `seed` (saved chains from the
  bundle), `saving`, `saved` (a local chain acquired its server id),
  `failed` (a save failed) and `restore` (a delete failed). A chain carries
  `serverId?: number` and `sync: "local" | "saving" | "saved" | "failed"`;
  local ids stay the reducer's own counter. `clear` takes `keepSaved`: a
  reader without `measurement:delete` clears only unsaved chains. A chain
  deleted while its create is in flight is deleted on the server as soon as
  the create answers.
- A small effect hook (`useMeasurementSync`) watches for the finish
  transition of M-3 and for `removeChain` / `removeSegment` / `clear` on
  saved chains, and sends the calls of D-2 through the gateway. The decision
  of *which* calls a transition needs is a pure function
  (`syncPlan(before, after)`) with its own spec; the hook only runs it.
- Grants in `use-territory-viewer.ts`: `measureCreate`, `measureWrite`,
  `measureDelete` from the principal; the layer and the chips read them.
- `Clear` with saved chains and `measurement:delete` opens
  `ConfirmDialog`; the count is the saved chains'.
- The strip chip: `measure · 2 segments · 20.55 m total` gains
  ` · not saved` when the last finished chain has no server id because the
  reader cannot save, or its save failed. A chain still being drawn is
  never saved yet, so it is not flagged (M-3).
- Tests: `syncPlan` table, gateway, mapper, reducer actions, hook with a
  mocked gateway, the confirm flow, the grants; fixtures with saved and
  unsaved chains. Live: measure, finish, reload — the chain is there; guest
  measures, reload — it is gone and the chip said so; editor removes a
  segment of a saved chain, reload — the split survived; Clear asks and
  empties the territory for everyone.

## Hiding the ruler

User request, 2026-09-17: "the ruler's measurements should be hideable so
they don't get in the way". Decisions:

- A **`Show measurements`** switch on the View tab, in a small section of
  its own (`Measurements`, count `saved chains · N` — the chains with a
  server id), placed after Documents. **The mock draws no such switch or
  section; this is a deviation.** Its row copies `Show panorama points`
  (the same `Switch`, `aria-labelledby` on the visible words).
- Remembered per browser, not per user and not on the server:
  `localStorage["andrey.measurements"] = "hidden"`; no entry means shown.
  The write happens outside the state updater (StrictMode) and every storage
  access is wrapped in try/catch — a blocked store answers "shown" and the
  switch still works for the session. The storage logic is one hook,
  `shared/lib/use-stored-switch`, under both `useMeasurementSwitch`
  (`features/measure`) and the existing `useMarkerSwitch`: one shared hook
  plus two three-line wrappers came out shorter than two copies.
- Hidden means the scene draws no segment, no label and no point of any
  chain — saved and local alike. `MeasurementLayer` unmounts its children
  (`visible={false}`) rather than setting `Object3D.visible`, because the
  labels are drei `<Html>` DOM, and repaints on the change (the canvas runs
  on demand). The chains, their sync and the strip chip do not change.
- **Measure mode wins:** while the mode is `measure`, the ruler is drawn
  whatever the switch says — nobody measures blind. The stored choice is not
  touched, so leaving measure mode hides the ruler again. The override is
  the canvas's (`showMeasurements || mode === "measure"`), not the page's.
- No keyboard shortcut, no tour step, no animation — the switch is instant,
  like every other scene toggle.

## Found while reading, not part of this change

The existing id-addressed mutations under `/api/territories/{slug}` —
`UpdatePlacement`, `DeletePlacement`, `UpdatePanorama`, `DeletePanorama`,
`DeleteDocument` — pass only the id to their service; storage matches
`WHERE id = $1`. The slug in the URL is checked by
`RequireTerritoryAccess` and then ignored, so a caller with access to one
territory and the matching grant can change or delete a row of another
territory — another tenant's — by id, and ids are sequential.
`SetPlacementVisibility` is the one that scopes correctly. Reported to the
user; the fix (scope each by slug in SQL, as measurements do) is a separate
change awaiting a decision.

## Not in this change

Naming or colouring a measurement; per-user visibility; measurements inside
a panorama (the ruler is a 3D-scene tool, as now); area of a closed chain.
