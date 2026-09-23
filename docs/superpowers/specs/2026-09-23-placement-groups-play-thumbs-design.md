# Placement hiding and groups, camera fly-around, panorama thumbnails

Date: 2026-09-23. Branch: `feat/placement-groups-play-thumbs` (off `dev` at
`16da20f3`). Three independent pieces of work shipped as one package:

1. **Hide and group placements** — an eye on every placement, on every model
   group and on user-made groups; groups are a new shared structure of the
   territory.
2. **Play** — a toolbar toggle that flies the camera above the territory,
   drops to 45° and orbits until stopped.
3. **Panorama thumbnails** — the Panoramas fold stutters on production because
   every row decodes the full equirectangular original for a 44×34 box.

## Decisions (user, 2026-09-23)

- **G-1 Hiding is shared.** `hidden` is a property of the placement, stored in
  the catalog DB. Hidden for one reader means hidden for everyone who opens
  the territory. Only a caller with `placement:write` changes it.
- **G-2 One group per placement.** A placement is in at most one user group
  (`placements.group_id`); a group may hold placements of different models.
  The panel lists user groups first, then the existing per-model groups
  holding only ungrouped placements.
- **G-3 Group/type hide is a bulk write, not a flag.** The eye on a group (user
  group or model group) sets `hidden` on every placement it covers, in one
  transaction. A group has no hidden flag of its own; its eye shows the
  aggregate (all visible / all hidden / mixed). One placement of a hidden
  group can be shown again on its own. The model-group eye covers **every**
  placement of that model on the territory, including those in user groups.
- **G-4 Adding to a group.** A user group has its own `Add` (the existing model
  picker; the new placement lands in that group) and every placement row has
  "Move to group…" (a list of groups plus "No group"). Deleting a group never
  deletes placements — they return to "No group".
- **G-5 No new grants.** Groups (create / rename / delete), moving placements
  and the eyes are all `placement:write`; `Add` inside a group stays
  `placement:create`. No auth migration.
- **P-1 Play** as designed in §2 (defaults proposed and accepted).
- **T-1 Thumbnails are generated server-side and stored** (option B): a new
  `panoramas.thumbnail_blob_hash` column, filled by content-service at create
  time and by a startup backfill.

## 1. Hide and group placements

### 1.1 Schema — catalog migration `00019_placement_groups.sql`

```sql
CREATE TABLE placement_groups (
    id           BIGSERIAL PRIMARY KEY,
    territory_id BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT placement_groups_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
    CONSTRAINT placement_groups_territory_id UNIQUE (territory_id, id)
);

ALTER TABLE placements
    ADD COLUMN hidden   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN group_id BIGINT,
    ADD CONSTRAINT placements_group_fk
        FOREIGN KEY (territory_id, group_id)
        REFERENCES placement_groups (territory_id, id)
        ON DELETE SET NULL (group_id);

CREATE INDEX placements_group_id ON placements (group_id) WHERE group_id IS NOT NULL;
```

- The composite FK makes "a group of another territory" unrepresentable; the
  column-list form of `SET NULL` (Postgres 15+, we run 18.6) clears only
  `group_id` when a group is deleted.
- The `UNIQUE (territory_id, id)` also serves as the territory index.
- `placementSelectCols`, `scanPlacement` and every hand-written `RETURNING`
  list (`create_placement.go`, `update_placement.go`,
  `set_placement_visibility.go`, `create_placements.go`) gain the two columns.
- `UpdatePlacement` (full replace of transform + label) does **not** touch
  `hidden` or `group_id`, so a rename or gizmo commit never un-hides or
  ungroups a placement.

### 1.2 Audit

- audit-service migration: `CREATE OR REPLACE ensure_audit_triggers()` with
  one more row `('placement_groups','placement_group','id','title')`, copying
  `00005_audit_measurements.sql`.
- `hidden` and `group_id` changes on `placements` are audited like any other
  column (not added to `v_ignore`): hiding is visible to everyone. A bulk hide
  of N placements writes N journal rows, as a batch placement does.
- gateway `audit_labels.go` (`territoryOwners`) and `audit_ref_fields.go`
  (`refFields`) learn `placement_group`; the SPA's journal labels
  (`entities/audit`) name the action.

### 1.3 Catalog RPCs (`catalog.proto`)

- `Placement` gains `bool hidden = 11; optional int64 group_id = 12;`.
- `CreatePlacementRequest` / batch item gain `optional int64 group_id`.
- `SetPlacementsHidden {territory_slug, ids[], hidden} → {updated}` and
  `SetPlacementsGroup {territory_slug, ids[], optional group_id} → {updated}`:
  one `UPDATE … WHERE territory_id = … AND id = ANY($ids)` in an `audittx`
  transaction; if the updated count differs from the number of distinct ids
  the transaction rolls back and the answer is `ErrPlacementNotFound`. For
  `SetPlacementsGroup` a `group_id` of another territory fails the composite
  FK and is mapped to `ErrPlacementGroupNotFound`.
- `ListPlacementGroups`, `CreatePlacementGroup {territory_slug, title}`,
  `RenamePlacementGroup {territory_slug, id, title}`,
  `DeletePlacementGroup {territory_slug, id}` — scoped by territory slug like
  every placement write; a foreign id is `ErrPlacementGroupNotFound`.
- Title validation (trimmed, 1–120 runes) in `service/validation.go`, the DB
  check is the backstop.

### 1.4 Gateway (`openapi.yaml`)

| Route | Body → answer | Grant |
|---|---|---|
| `PUT /api/territories/{slug}/placements/hidden` | `{ids: int64[1..1000], hidden: bool}` → `{updated: n}` | `placement:write` |
| `PUT /api/territories/{slug}/placements/group` | `{ids: int64[1..1000], groupId: int64 \| null}` → `{updated: n}` | `placement:write` |
| `POST /api/territories/{slug}/placement-groups` | `{title}` → 201 `PlacementGroup` | `placement:write` |
| `PATCH /api/territories/{slug}/placement-groups/{id}` | `{title}` → `PlacementGroup` | `placement:write` |
| `DELETE /api/territories/{slug}/placement-groups/{id}` | → 204 | `placement:write` |

- `Placement` gains `hidden` (required) and `groupId` (omitted when none);
  `PlacementCreate` gains optional `groupId` (so `POST …/placements/batch`
  carries it per item; the `Idempotency-Key` semantics are unchanged — the key
  names the action, not its group).
- `PlacementGroup {id, title, createdAt, updatedAt}`.
- `SceneBundle` gains required `placementGroups: PlacementGroup[]` (`[]` when
  none), read in the existing errgroup. No standalone GET list — YAGNI; the
  scene is the only reader.
- Duplicate ids in `ids` are de-duplicated before the count check; an empty or
  oversized list is 400.
- Every route sits under `/api/territories/{slug}`, so `RequireTerritoryAccess`
  covers it; an unknown or foreign id is 404. `routePerms` gets all five
  mutations (the spec test fails otherwise).

### 1.5 Frontend — panel (`widgets/placements-panel`)

Top to bottom: search; user groups (alphabetical); a divider; model groups
holding only ungrouped placements; `New group` (with `placement:write`),
which opens an inline title field.

- **Group row** stops being a single `<button>`: a disclosure button, a
  sibling eye button, and — for a user group — a menu (`Rename`, `Delete group
  (placements stay)`). Eye states: `eye` all visible, `eye-off` all hidden,
  `eye` with a muted dot when mixed (a click then hides all).
- **User group body**: its placements (the row shows the model title), then
  `Add` — the existing model picker; the placement is created with `groupId`.
- **Instance row**: a leading eye; beside pencil and trash a "Move to group…"
  icon opening a list of the territory's groups plus `No group`. A hidden
  placement's row is dimmed but stays interactive (select, rename, un-hide).
- **Without `placement:write`**: no eyes, no menus, no `New group`; hidden rows
  still show dimmed, so a missing object is explained.
- Icons: `eye`/`eye-off` exist in `shared/ui/icon/glyphs.tsx`; "move to group"
  and "new group" glyphs come from runeicons, added per `frontend/CLAUDE.md`'s
  glyph rule. Every icon-only control has a `Tooltip`.

### 1.6 Frontend — state

- `usePlacementsEditor` gains `setHidden(ids, hidden)`,
  `moveToGroup(ids, groupId | null)`, and `create(…, groupId?)`. Writes apply
  the server's answer, as today.
- New `usePlacementGroups` (create / rename / remove) in the same style,
  seeded from `scene.placementGroups`. Removing a group clears `groupId` on its
  placements locally (mirrors `ON DELETE SET NULL`).
- Every write marks `["scene", slug]` stale through the existing `onChanged`.
- Pure helpers with unit tests: `groupPlacements(placements, groups)` (user
  groups + ungrouped-by-model), `eyeState(placements) → "visible" | "hidden" |
  "mixed"`, `idsOfModel(placements, modelSlug)`.

### 1.7 Frontend — 3D

- `PlacementsLayer`, `PlacementMarkers`, `glb-preloader` and `lod-warmer` skip
  `hidden` placements (not drawn, not preloaded).
- Hiding the selected placement clears the selection and the gizmo; `Focus`
  is disabled on a hidden placement.
- Panorama mode composes: visible = `!hidden && isVisibleIn(panorama)`.

## 2. Play — camera fly-around

- **Tile**: `play` in the viewer rail beside `Reset camera`, a toggle
  (`aria-pressed`); glyph `play`, `pause` while running (both new, from
  runeicons); tooltips "Fly around" / "Stop fly-around". Inert without
  geometry, inside a panorama, and in `place`/`measure` modes.
- **State**: `playing` lives in `use-page-handlers.ts` beside `resetVersion`
  and flows down the same prop chain to `CameraRig`, which reports a stop by
  grab through `onPlayStop`.
- **Motion** (`CameraRig`, own `requestAnimationFrame` loop calling
  `invalidate()` — the canvas runs `frameloop="demand"`):
  1. Target = centre of the territory's bounding sphere
     (`Box3.setFromObject(territoryRef)`); distance fits the sphere in the
     current FOV with the `Bounds` margin 1.2.
  2. ~1.2 s ease-in-out to straight above the centre (a tiny azimuth offset
     avoids the zenith flip).
  3. ~0.3 s hold.
  4. ~1.5 s ease-in-out down to 45° elevation at the same distance.
  5. Continuous orbit, one revolution per ~40 s, azimuth continuous across the
     phase joins.
- **Stops on**: the toggle again; OrbitControls `start` (pointer, wheel,
  touch — `change` is not used, our own `update()` fires it); `Reset camera`;
  entering a panorama; a mode change; unmount. The camera stays where it was
  caught (`holdStill` drops the inertia).
- **Reduced motion**: no fly-in; jump to the 45° pose, orbit at half speed.
- **No keyboard shortcut** (not asked for).
- **Tests**: `flightPose(t, sphere)` is pure, unit-tested per phase and at the
  joins; `camera-rig.spec.tsx` covers stop-on-`start` and stop-on-reset.

## 3. Panorama thumbnails and fold jank

### 3.1 Root cause (measured by reading, to be confirmed with a profile)

- `panorama-row.tsx` renders `assetUrl(panorama.sourceBlobHash)` — the
  original equirect (4–8K, 32–128 MB decoded) — into a 44×34 box.
- Folded sections keep every row mounted (`hidden`), and fold state is
  page-level, so each toggle re-renders the whole viewer including
  `ViewerCanvas` (lazy, not memoised).

### 3.2 Backend

- catalog migration `00020_panorama_thumbnail.sql`:
  `ALTER TABLE panoramas ADD COLUMN thumbnail_blob_hash TEXT NOT NULL DEFAULT ''`
  (same shape as `models.thumbnail_blob_hash`).
- content-service mounts `blob-data` **read-write** and opens
  `pkg/blobstore.FS` (config `CONTENT_BLOB_DIR`).
- New package `content-service/internal/thumbnail`:
  `Make(ctx, store, srcHash) (hash string, err error)`:
  1. `image.DecodeConfig` first; refuse anything over 16384×8192 pixels
     (decompression-bomb guard) or of an unregistered format.
  2. Decode (stdlib `image/jpeg`, `image/png`).
  3. Scale to 256×128 with `golang.org/x/image/draw.ApproxBiLinear` (new
     dependency).
  4. Encode JPEG q80, hash sha256, `store.Put` (content-addressed, so a rerun
     is idempotent).
- `CreatePanorama` calls `Make` after the insert and stores the hash; a
  failure is logged and the panorama is still created with an empty hash.
- Startup backfill: a goroutine lists panoramas with
  `thumbnail_blob_hash = ''` and processes them **one at a time**, bounded by
  the service's lifetime context. It is also the retry for create-time
  failures; an undecodable source is retried on each boot (one log line).
- Gateway: `Panorama` gains `thumbnailBlobHash` (omitted when empty);
  `ResolveBlobAccess` gains a branch for `panoramas.thumbnail_blob_hash` plus
  a case in its integration test (the `CLAUDE.md` rule for hash columns).

### 3.3 Frontend

- `panorama-row.tsx`: `<img src={assetUrl(thumbnailBlobHash)} width height
  loading="lazy" decoding="async">`; without a hash, the panorama glyph. The
  original is never used as a thumbnail again. The `ponytail:` comment goes.
- Folded Panoramas/Documents unmount their rows (conditional render instead of
  `hidden`, as placement groups already do); the doc comment at
  `view-tab.tsx:82-84` is rewritten.
- A fold toggle no longer re-renders the 3D scene: `ViewerCanvas` is wrapped in
  `memo`, and the canvas props and section rows are memoised in
  `page-props*.ts(x)`.

### 3.4 Verification

- React Profiler on the viewer fixture: toggling a fold does not render
  `SceneCanvas`.
- Locally with a real 8K panorama: a Performance recording of expand/collapse
  before and after, no long task on toggle.
- Production after deploy: backfill lines in content-service logs; the
  thumbnail asset is ~15 KB.

## Deploy order

1. Bring catalog up and wait until it is healthy, so 00019 and 00020 are
   applied (`placement_groups` exists).
2. `docker compose restart audit`. Audit attaches its triggers only at boot
   (`ensure_audit_triggers()` in its bootstrap) and has no `depends_on`
   catalog, so a one-shot `docker compose up -d --build catalog audit content
   gateway` can boot audit before 00019 creates `placement_groups`, and every
   group write then goes unjournaled with no error anywhere.
3. Verify the trigger: `SELECT tgname FROM pg_trigger WHERE
   tgname='audit_placement_groups'` returns one row.
4. content (volume mount, backfill) + gateway together.
5. SPA + desktop.

The SPA reads `hidden`,
`groupId`, `placementGroups` and `thumbnailBlobHash`, all of which the new
gateway always sends (or omits meaning "none"), so SPA-after-gateway is safe;
the old SPA against the new gateway ignores the new fields.

## Out of scope

Per-user hiding; nested groups; a placement in several groups; group
ordering other than alphabetical; a keyboard shortcut for Play; thumbnails
for anything but panoramas.
