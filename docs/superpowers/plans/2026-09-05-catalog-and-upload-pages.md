# Catalog and upload pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Territory Catalog, Model Library, Upload Territory and Upload Models exist in frontend-v2, built to their v2 mocks against the real gateway, with the missing shared components built first and two list counts added to the backend.

**Architecture:** One Go task adds `placementCount` / `usageCount` to the catalog list responses (proto → catalog-service SQL → gateway JSON → regenerated DTO). One task adds the missing `shared/ui` pieces (icons, `DropZone`, `FileCard`, `Checklist`, a rewritten `CatalogCard`, `PageHeader xl`, `EmptyState` row layout, `StageList` hint/tone). One task adds the catalog shell, four routes, the guard decision and the `entities/upload` chunked-upload port plus create/thumbnail gateways. Four page tasks then follow the Content page pattern (pure model + hook + props-only page + screen + fixture). A final whole-package review closes it.

**Tech Stack:** Go 1.25 (catalog-service pgx v5, gateway, buf), frontend-v2 React 19 + TypeScript + TanStack Router/Query + Tailwind v4 + vitest/Testing Library + Cosmos.

**Spec:** `docs/superpowers/specs/2026-09-05-catalog-and-upload-pages-design.md` — the mocks' measurements are in `.superpowers/sdd/2026-09-05-catalog-and-upload-pages/mocks/*.md` (working copies; the originals are in the Claude Design project).

## Global Constraints

- Branch `feat/frontend-v2-design-system`. Stage by path only: Go tasks `git add proto backend/services/catalog-service backend/services/gateway-service frontend-v2/src/shared/api/dto.ts`; frontend tasks `git add frontend-v2`. **Never stage `.claude/settings.json` or `backend/go.work.sum`.**
- Go: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` before committing; `make -C backend proto` (buf) after editing `.proto`. Backend 200-line cap by hand.
- Frontend: `yarn`, never `npm`; from `frontend-v2/`: `yarn lint` (the type check) and `yarn test:coverage` (90/85/90/90) green before every commit; `git commit --no-verify` with the body line "Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes." 200-line cap hand-checked (skip blanks/comments). `src/architecture.spec.ts`: spec per module, one Cosmos fixture per JSX slice (`<slice>.fixture.tsx` at the slice root), imports inward only (`shared → entities → features → widgets → pages → app`), never past another slice's `index.ts`. `src/fixtures.spec.tsx` renders every fixture.
- Design tokens only (`bg, panel, panel-2, line, line-2, fg, muted, dim, accent, accent-fg, accent-soft, accent-line, ok/warn/bad(+-soft), grid, elevation`); fonts via the existing `font-sans`/`font-mono`. Measurements from the mock summaries, verbatim where they are given.
- Accessible names unique on a screen (`Delete <title>`, `Replace source of <title>`); state never by colour alone; specs assert roles/labels/values, not classes (except a deliberate token test).
- Copy verbatim from the mock summaries (headers, ledes, stage labels, checklist items, callouts, button labels, tab labels).
- Live check for every page task against the compose stack (gateway :8080, `yarn dev` :3001, Root `admin` / `change-me-now`, login JSON field `identifier`), both themes, screenshot beside the mock; upload tasks push a real ≥ 8 MB ZIP.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef
  ```
- Skills each implementer loads first via the Skill tool: `ponytail:ponytail`, `clean-code`, `superpowers:test-driven-development`; frontend tasks add `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `frontend-design:frontend-design`; Go tasks add `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to`.

---

## File map

**Task 1 (Go):** `proto/rosneft/catalog/v1/catalog.proto`; catalog-service `internal/domain/types.go`, `internal/storage/queries.go` (`scanTerritoryListed`/`scanModelListed`), `list_territories.go`, `list_models.go`, `internal/transport/grpcapi/converters.go`, new `internal/storage/list_counts_integration_test.go`; gateway `internal/domain/types.go`, `internal/clients/catalog/converters.go` (+ test), `internal/transport/httpapi/*` JSON mapping (+ test), `api/openapi.yaml`, regenerated `openapi_gen.go` if the repo generates it (check the Makefile) and `frontend-v2/src/shared/api/dto.ts`.

**Task 2 (shared/ui):** `shared/ui/icon/glyphs.tsx`; new `shared/ui/drop-zone/`, `shared/ui/file-card/`, `shared/ui/checklist/`; rewrite `shared/ui/catalog-card/`; `widgets/page-header/ui/page-header.tsx`; `shared/ui/card/empty-state.tsx`; `entities/conversion/ui/stage-list.tsx` + `model/status.ts`; `entities/territory/ui/territory-card.tsx`, `entities/model/ui/model-card.tsx` (+ specs, fixtures).

**Task 3 (shell, routes, entities):** new `widgets/catalog-shell/`; `app/router/routes.tsx`, `router.tsx`, `guard.ts` (+ spec), new `app/router/catalog-shell-route.tsx` (wiring, exempt), `console-shell.tsx` (`backHref`), `exempt-modules.ts`; new `entities/upload/` (api + model + specs); `entities/territory` (`createTerritory`, `placementCount`), `entities/model` (`createModel`, `setModelThumbnail`, `usageCount`), `entities/conversion/model/stage-label.ts`.

**Tasks 4–7 (pages):** `pages/territory-catalog/`, `pages/model-library/`, `pages/upload-territory/`, `pages/upload-models/`, each `{index.ts, model/*.ts+spec, model/use-*.ts+spec, ui/*-page.tsx+spec, ui/*-screen.tsx+spec, *-page.fixture.tsx}`; the leaf routes in `routes.tsx` point at the screens.

---

### Task 1: Backend — `placementCount` and `usageCount` on the lists

**Files:**
- Modify: `proto/rosneft/catalog/v1/catalog.proto:75-96`
- Modify: `backend/services/catalog-service/internal/domain/types.go:9-28`
- Modify: `backend/services/catalog-service/internal/storage/queries.go:28-68`, `list_territories.go`, `list_models.go`
- Create: `backend/services/catalog-service/internal/storage/list_counts_integration_test.go`
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/converters.go:10-40`
- Modify: `backend/services/gateway-service/internal/domain/types.go` (Territory/Model), `internal/clients/catalog/converters.go` (+ spec), the httpapi JSON mapping for territories/models (+ spec), `api/openapi.yaml:45-70`
- Regenerate: gateway `openapi_gen.go` (if generated), `frontend-v2/src/shared/api/dto.ts` via `cd frontend-v2 && yarn openapi:generate`

**Interfaces:**
- Produces: proto `Territory.placement_count = 8` (uint32), `Model.usage_count = 8`; JSON `placementCount?: number` on `Territory`, `usageCount?: number` on `Model` (present on the list endpoints; 0/absent on single GETs); v2 DTO regenerated so Task 3 can map them.

- [ ] **Step 1: Proto**

Add after `external_panorama_url` / `thumbnail_blob_hash`:
```proto
  // How many placements sit on this territory. Filled by ListTerritories only.
  uint32 placement_count = 8;
```
```proto
  // How many distinct territories place this model. Filled by ListModels only.
  uint32 usage_count = 8;
```
Run `make -C backend proto`.

- [ ] **Step 2: Failing integration test**

`list_counts_integration_test.go` (tag `integration`; copy the suite skeleton and the `seedTerritory`/`seedModel` helpers from `delete_model_integration_test.go`):
```go
func (s *ListCountsSuite) TestListsCarryPlacementAndUsageCounts() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "yard", "hash-yard", s.admin)
	s.seedTerritory(ctx, "block", "hash-block", s.admin)
	s.seedModel(ctx, "pump", "h-pump-src", "h-pump-thumb", "h-pump-glb")
	s.seedModel(ctx, "tank", "h-tank-src", "h-tank-thumb", "h-tank-glb")
	s.seedModel(ctx, "ladder", "h-ladder-src", "h-ladder-thumb", "h-ladder-glb")
	place := func(t, m string) {
		_, err := s.pg.CreatePlacement(ctx, domain.Placement{TerritorySlug: t, ModelSlug: m, Scale: domain.Vec3{X: 1, Y: 1, Z: 1}})
		assert.NilError(s.T(), err)
	}
	place("yard", "pump")
	place("yard", "pump")
	place("yard", "tank")
	place("block", "pump")

	terrs, err := s.pg.ListTerritories(ctx, "")
	assert.NilError(s.T(), err)
	counts := map[string]int{}
	for _, t := range terrs {
		counts[t.Slug] = t.PlacementCount
	}
	assert.DeepEqual(s.T(), counts, map[string]int{"yard": 3, "block": 1})

	models, err := s.pg.ListModels(ctx)
	assert.NilError(s.T(), err)
	usage := map[string]int{}
	for _, m := range models {
		usage[m.Slug] = m.UsageCount
	}
	// pump is placed twice on yard and once on block: two territories, not three placements.
	assert.DeepEqual(s.T(), usage, map[string]int{"pump": 2, "tank": 1, "ladder": 0})
}
```
Run `cd backend/services/catalog-service && go test -tags=integration ./internal/storage/ -run ListCounts` → FAIL (fields undefined).

- [ ] **Step 3: Domain, SQL, scanners**

`types.go`: `PlacementCount int \`yaml:"-"\`` on Territory, `UsageCount int \`yaml:"-"\`` on Model.

`queries.go`: two list scanners that take the base columns plus a trailing count:
```go
func scanTerritoryListed(r rowScanner) (domain.Territory, error) {
	var t domain.Territory
	err := r.Scan(&t.Slug, &t.Title, &t.Description, &t.SourceBlobHash, &t.ExternalPanoramaURL, &t.CreatedAt, &t.UpdatedAt, &t.PlacementCount)
	return t, err
}

func scanModelListed(r rowScanner) (domain.Model, error) {
	var m domain.Model
	err := r.Scan(&m.Slug, &m.Title, &m.Description, &m.SourceBlobHash, &m.ThumbnailBlobHash, &m.CreatedAt, &m.UpdatedAt, &m.UsageCount)
	return m, err
}
```
`list_territories.go` query (columns qualified with `t.`; write the column list out rather than reusing `territoryColumns`, which is unqualified):
```sql
SELECT t.slug, t.title, t.description, t.source_blob_hash, t.external_panorama_url, t.created_at, t.updated_at,
       (SELECT COUNT(*) FROM placements p WHERE p.territory_id = t.id) AS placement_count
FROM territories t
WHERE ($1 = '' OR EXISTS (SELECT 1 FROM territory_assignments a WHERE a.territory_id = t.id AND a.admin_user_id = $1::uuid))
ORDER BY t.slug
```
`list_models.go`:
```sql
SELECT m.slug, m.title, m.description, m.source_blob_hash, m.thumbnail_blob_hash, m.created_at, m.updated_at,
       (SELECT COUNT(DISTINCT p.territory_id) FROM placements p WHERE p.model_id = m.id) AS usage_count
FROM models m ORDER BY m.slug
```
Both loops call the `*Listed` scanner. Run the integration test → PASS.

- [ ] **Step 4: gRPC and gateway**

`grpcapi/converters.go`: `PlacementCount: uint32(t.PlacementCount)` in `territoryToProto`, `UsageCount: uint32(m.UsageCount)` in `modelToProto`; the proto→domain direction reads `int(GetPlacementCount())` / `int(GetUsageCount())`.

Gateway: `domain.Territory.PlacementCount int`, `domain.Model.UsageCount int`; `clients/catalog/converters.go` maps them both ways (add a case to its existing test); the httpapi JSON writer for territories/models emits `placementCount` / `usageCount` (find the function that emits `externalPanoramaUrl`; if the response struct is generated from `openapi.yaml`, edit the yaml first and regenerate). `openapi.yaml`: under `Territory.properties` add `placementCount: { type: integer, minimum: 0, description: "Placements on this territory; filled on the list endpoint." }`, under `Model.properties` add `usageCount: { type: integer, minimum: 0, description: "Distinct territories placing this model; filled on the list endpoint." }`. A route test (`list_territories`/`list_models` handler tests, whichever exist) asserts the JSON key with a stubbed catalog returning a count.

- [ ] **Step 5: DTO, gate, commit**

`cd frontend-v2 && yarn openapi:generate`, then `yarn lint` (the generated file must still type-check with the existing mappers). `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check`.

```bash
git add proto backend/services/catalog-service backend/services/gateway-service frontend-v2/src/shared/api/dto.ts
git commit -m "feat(catalog): the territory and model lists carry placementCount and usageCount

The v2 catalog cards print how many placements a territory holds and how
many territories place a model; neither list said. Two correlated counts
in the list queries only — single GETs leave them zero — through the
proto, the gateway JSON and the regenerated frontend-v2 DTO.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 2: shared/ui — the missing pieces

**Files:**
- Modify: `frontend-v2/src/shared/ui/icon/glyphs.tsx` (+ `icon.spec.tsx` case)
- Create: `frontend-v2/src/shared/ui/drop-zone/{drop-zone.tsx, drop-zone.spec.tsx, drop-zone.fixture.tsx, index.ts}`
- Create: `frontend-v2/src/shared/ui/file-card/{file-card.tsx, file-card.spec.tsx, file-card.fixture.tsx, index.ts}`
- Create: `frontend-v2/src/shared/ui/checklist/{checklist.tsx, checklist.spec.tsx, checklist.fixture.tsx, index.ts}`
- Rewrite: `frontend-v2/src/shared/ui/catalog-card/{catalog-card.tsx, catalog-card.spec.tsx, catalog-card.fixture.tsx}`
- Modify: `frontend-v2/src/entities/territory/ui/territory-card.tsx`, `frontend-v2/src/entities/model/ui/model-card.tsx` (+ specs/fixtures) to the new card props
- Modify: `frontend-v2/src/widgets/page-header/ui/page-header.tsx` (+ spec)
- Modify: `frontend-v2/src/shared/ui/card/empty-state.tsx` (+ spec, fixture)
- Modify: `frontend-v2/src/entities/conversion/ui/stage-list.tsx`, `model/status.ts` (+ specs)

**Interfaces (Produces):**
```ts
// Icon: new names "minus" | "grid" | "list"
// DropZone
export type DropZoneProps = {
  label: string;            // "Drop ZIP archives here"
  hint: string;             // "Or pick several at once — each becomes its own model."
  buttonLabel: string;      // "Choose files"
  accept: string;           // ".zip,application/zip"
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
};
// FileCard
export type FileCardProps = { name: string; meta: string; onReplace?: () => void; replaceLabel?: string; className?: string };
// Checklist
export type ChecklistItem = { label: string; ok: boolean };
export type ChecklistProps = { items: ChecklistItem[]; label?: string; className?: string };
// CatalogCard (rewrite)
export type CatalogTone = "neutral" | "warn" | "bad";
export type CatalogChip = { label: string; tone: "plain" | "accent" | "ok" | "warn" };
export type CatalogCardProps = {
  title: string; description?: string; slug: string;
  tone?: CatalogTone;                                    // border colour
  badge?: { label: string; tone: "ok" | "warn" | "bad" }; // top-left pill
  thumbnailUrl?: string; noImageLabel?: string;          // else the cube glyph on the grid
  actions?: ReactNode;                                   // top-right overlay squares
  chips?: CatalogChip[];
  progress?: { value: number; stage: string };           // 0–100, warn bar + stage line
  trailing: { label: string; tone: "accent" | "muted" | "warn" | "bad" };
  onOpen?: () => void;                                   // whole-card click when openable
  size?: "md" | "sm";                                    // md = Territory Catalog, sm = Model Library
  className?: string;
};
// PageHeader: size "md" | "lg" | "xl"; description gets max-w-[56ch] (lg) / max-w-[52ch] (xl) and leading-relaxed
// EmptyState: layout?: "center" | "row"; icon?: IconName (row draws icon | title+description | action)
// StageList: stages: (ConversionStage & { hint?: string })[]; activeTone?: "warn" | "accent"
```

- [ ] **Step 1: Icons** — add to `GLYPHS`: `minus` (box 24, width 2.2, `<path d="M6 12h12" />`), `grid` (width 1.8, four `<rect>` 7×7 rx 1 at (3,3) (14,3) (3,14) (14,14)), `list` (width 1.8, `<path d="M4 6h16M4 12h16M4 18h16" />`). Spec: the three names render an `svg`.

- [ ] **Step 2: DropZone — spec first**

```tsx
it("hands the picked files to onFiles and labels the hidden input", async () => {
  const onFiles = vi.fn();
  render(<DropZone label="Drop ZIP archives here" hint="Or pick several at once" buttonLabel="Choose files" accept=".zip" multiple onFiles={onFiles} />);
  const input = screen.getByLabelText("Drop ZIP archives here") as HTMLInputElement;
  expect(input.accept).toBe(".zip"); expect(input.multiple).toBe(true);
  const a = new File(["x"], "a.zip"); const b = new File(["y"], "b.zip");
  await userEvent.upload(input, [a, b]);
  expect(onFiles).toHaveBeenCalledWith([a, b]);
});
it("accepts a drop and highlights while a file is over it", () => { /* fireEvent.dragEnter → class contains border-accent; fireEvent.drop with dataTransfer.files → onFiles */ });
it("opens the picker from the keyboard", () => { /* Enter on the focused zone calls input.click (spy) */ });
it("does nothing while disabled", () => {});
```
Implementation: a `<label>` wrapping the whole panel (so the label text names the input), `className="flex cursor-pointer items-center gap-3.5 rounded-[12px] border border-dashed border-line-2 bg-panel px-5 py-[18px]"` + `border-accent bg-accent-soft` while `over`; `<Icon name="upload" size={24} className="text-muted" />`; title `text-[13px] font-semibold`, hint `mt-1 text-xs text-muted`; right `<span>` styled as the accent outline pill (`rounded-full border border-accent bg-accent-soft px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent`); `<input type="file" className="sr-only" accept multiple disabled onChange={(e) => onFiles([...(e.target.files ?? [])])} />` — reset `e.target.value = ""` after so the same file can be picked again. `onDragOver` preventDefault + `over=true`, `onDragLeave` false, `onDrop` preventDefault + files from `dataTransfer.files` (filter by `accept` extension when `accept` names extensions). `tabIndex={0}` + `onKeyDown` Enter/Space → `inputRef.current?.click()`.

- [ ] **Step 3: FileCard — spec then code.** Renders `name` (14px/600), `meta` (mono 11px muted), and a `Replace` button (`Button shape="pill" size="sm"`) calling `onReplace`; container `relative flex items-center gap-3.5 rounded-[12px] border border-accent border-l-[3px] border-l-accent bg-accent-soft py-[18px] pl-[23px] pr-5` with `<Icon name="upload" size={26} className="text-accent" />`.

- [ ] **Step 4: Checklist — spec then code.** `<ul aria-label={label ?? "Checklist"}>`, each `<li className="flex items-start gap-[9px]">` with `<Icon name={ok ? "check" : "minus"} size={13} className={ok ? "text-ok" : "text-muted"} />` and `<span className={cx("text-xs leading-[1.45]", ok ? "text-fg" : "text-muted")}>`. Spec: two items, the ok one has the check icon (query by `data-icon` or the path `d`) and fg text.

- [ ] **Step 5: CatalogCard rewrite — spec first** (replace the existing spec; keep its "heading carries the link" idea as `onOpen` on a button-styled title instead):

```tsx
it("draws the badge, chips, slug and trailing note", () => {
  render(<CatalogCard title="North Ridge Pad" slug="north-ridge-pad" description="Wellhead cluster." badge={{ label: "ready", tone: "ok" }} chips={[{ label: "3 placements", tone: "plain" }, { label: "panorama", tone: "ok" }]} trailing={{ label: "Open →", tone: "accent" }} />);
  expect(screen.getByRole("article", { name: "North Ridge Pad" })).toBeInTheDocument();
  expect(screen.getByText("ready")).toBeInTheDocument();
  expect(screen.getByText("3 placements")).toBeInTheDocument();
  expect(screen.getByText("north-ridge-pad")).toBeInTheDocument();
  expect(screen.getByText("Open →")).toBeInTheDocument();
});
it("shows the progress bar and stage only while converting", () => { /* progress={{ value: 62, stage: "Compressing textures" }} → progressbar with aria-valuenow 62 and the stage text; without → no progressbar */ });
it("renders the thumbnail when given and the no-image label otherwise", () => {});
it("opens on click only when onOpen is given, and never from the overlay actions", async () => { /* click on an action button inside actions does not call onOpen (stopPropagation) */ });
it("fits the small size", () => { /* size="sm" → title has text-[14px] — one token test */ });
```
Implementation notes: `<article aria-label={title} className={cx("overflow-hidden rounded-[14px] border bg-panel", TONE[tone], onOpen && "cursor-pointer", size === "sm" && "rounded-[12px]")} onClick={onOpen}>`; thumb `relative flex h-[132px] items-center justify-center border-b border-line bg-panel-2` + grid background inline style `backgroundImage: "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)", backgroundSize: size === "sm" ? "22px 22px" : "24px 24px"` when no thumbnail; `<img src alt="" className="size-full object-cover" />` when given; `<Icon name="cube" size={size === "sm" ? 46 : 34} className="text-dim" />` or `noImageLabel` mono 10px uppercase tracking-[0.18em] muted; badge `absolute left-3 top-3` → `Badge tone shape="pill" size="sm" fill="soft"`; actions `absolute right-2.5 top-2.5 flex gap-1.5` in a `div` with `onClick={(e) => e.stopPropagation()}`; body `flex flex-col gap-3 px-[18px] pb-[18px] pt-4` (sm: `gap-2.5 px-[15px] pb-[15px] pt-[13px]`); title `text-[18px] font-semibold tracking-[-0.015em]` (sm: `truncate text-[14px] tracking-[-0.01em]`); description `text-[13px] leading-[1.55] text-muted`; chips `Badge shape="chip"` with tones mapped plain→neutral outline on panel-2, accent→accent soft, ok→ok outline, warn→warn outline; progress → `ProgressBar tone="warn" variant="framed" className="[&>div]:h-1"` + `<p className="mt-[7px] font-mono text-[10px] text-warn">`; footer `flex items-center justify-between gap-2.5 border-t border-line pt-3` with slug `truncate font-mono text-[11px] text-muted` and trailing `font-mono text-[10px] uppercase tracking-[0.16em] whitespace-nowrap` in `TRAILING[tone]`. Keep the file ≤ 200 lines; if it will not fit, split the thumb into `catalog-card-thumb.tsx` in the same slice.

Then update `TerritoryCard` / `ModelCard` in entities to the new props (they map an entity to `CatalogCardProps`; keep their fixtures rendering) — or, if nothing outside the fixtures uses them any more, delete both and their fixtures/specs and the barrel exports (check `grep -rn 'TerritoryCard\|ModelCard' src`).

- [ ] **Step 6: PageHeader xl, EmptyState row, StageList hint/tone** — spec first for each:
  - PageHeader: `size="xl"` → h1 `text-[38px] tracking-[-0.03em] leading-[1.05]`; description wrapper `max-w-[52ch] leading-relaxed` (xl) / `max-w-[56ch]` (lg); back link gap `mt-4` before the eyebrow (mock: 16px) for lg/xl.
  - EmptyState `layout="row"`: `flex items-center gap-3.5 rounded-[14px] border border-dashed border-line-2 p-[26px] text-left`, `<Icon name={icon} size={22} className="text-muted" />`, title 14px/600, description 12px muted, action on the right. Default `layout="center"` unchanged.
  - StageList: `hint` renders `<p className="mt-[3px] text-[11px] leading-[1.45] text-muted">` under the label, rows become `items-start` when any hint exists; `activeTone="accent"` swaps the active dot/text to `bg-accent`/`text-accent` (keep `STAGE_DOT`/`STAGE_TEXT` as the warn defaults; add `ACCENT_DOT`/`ACCENT_TEXT` maps or a `toneClasses(state, activeTone)` helper in `status.ts` with a spec).

- [ ] **Step 7: Lint, tests, commit**

`yarn lint && yarn test:coverage`. Open Cosmos (`yarn cosmos`, port 5100) and look at the new fixtures in both themes; note what you saw.

```bash
git add frontend-v2
git commit --no-verify -m "feat(frontend-v2): the shared pieces the catalog and upload pages need

Frontend-only; the backend gate is skipped with --no-verify because
nothing under backend/ changes.

DropZone (a labelled file input that also takes a drop), FileCard,
Checklist, three icons, a CatalogCard rebuilt to the v2 mock (thumb,
badge, chips, progress, overlay actions, footer), PageHeader xl,
EmptyState's row layout, and StageList's hint line and accent tone.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 3: Catalog shell, routes, guard, and the upload/create entities

**Files:**
- Create: `frontend-v2/src/widgets/catalog-shell/{ui/catalog-shell.tsx, ui/catalog-shell.spec.tsx, catalog-shell.fixture.tsx, index.ts}`
- Create: `frontend-v2/src/app/router/catalog-shell-route.tsx` (wiring; add to `exempt-modules.ts`)
- Modify: `frontend-v2/src/app/router/routes.tsx`, `router.tsx`, `guard.ts` (+ `guard.spec.ts`), `console-shell.tsx:38` (`backHref="/territories"`)
- Create: `frontend-v2/src/entities/upload/{index.ts, api/upload-gateway.ts (+spec), model/run-chunked-upload.ts (+spec), model/title.ts (+spec), model/upload-stats.ts (+spec)}`
- Modify: `frontend-v2/src/entities/territory/{model/territory.ts, api/to-territory.ts (+spec), api/territories-gateway.ts (+spec), index.ts}`
- Modify: `frontend-v2/src/entities/model/{model/model.ts, api/to-model.ts (+spec), api/models-gateway.ts (+spec), index.ts}`
- Create: `frontend-v2/src/entities/conversion/model/stage-label.ts` (+spec); export from `index.ts`

**Interfaces (Produces):**
```ts
// widgets/catalog-shell
export function CatalogShell({ children }: { children: ReactNode }) // <div className="min-h-dvh bg-bg text-fg"><main className="flex min-w-0 flex-col gap-[22px] px-9 pb-[72px] pt-8">{children}</main></div>
// app/router/guard.ts
export const CATALOG_PATHS = ["/territories", "/territories/new", "/models", "/models/new"] as const;
export const routesInApp = (href, e) => !!href && (href.startsWith("/console") || isCatalogHref(href)) && plainLeftClick(e)
export const isCatalogHref = (href: string) => /^\/(territories|models)(\/new)?(\?.*)?$/.test(href)   // NOT /territories/<slug> — those leave to the old SPA
// entities/upload
export const CHUNK_SIZE = 8 * 1024 * 1024;
export type UploadProgress = { bytes: number; total: number; chunk: number; chunks: number };
export type UploadStage = "initiating" | "uploading" | "finalizing";
export function runChunkedUpload(file: File, opts?: { onStage?: (s: UploadStage) => void; onProgress?: (p: UploadProgress) => void; signal?: AbortSignal }): Promise<{ hash: string; size: number }>
export const deriveTitle = (fileName: string) => fileName.replace(/\s*\.zip\s*$/i, "").trim();
export const slugPreview = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export type UploadSample = { at: number; bytes: number };
export function uploadStats(samples: UploadSample[], total: number): { bytesPerSecond: number | null; etaSeconds: number | null }
export const formatEta = (s: number | null) => s === null ? "" : s < 60 ? "<1 min" : `~${Math.round(s / 60)} min`;
// entities/territory
export type Territory = { …existing; placementCount: number };
export function createTerritory(input: { title: string; description?: string; externalPanoramaUrl?: string; sourceBlobHash: string }): Promise<{ territory: Territory; job: { id: string } }>
// entities/model
export type Model = { …existing; usageCount: number };
export function createModel(input: { title: string; description?: string; sourceBlobHash: string; thumbnailBlobHash?: string }): Promise<{ model: Model; job: { id: string } }>
export function setModelThumbnail(slug: string, thumbnailBlobHash: string): Promise<Model>
// entities/conversion
export function stageLabel(token: string | null): string  // "compressing" → "Compressing textures", "lod-1" → "Building LOD 1", null → "Queued", unknown → token
```

- [ ] **Step 1: guard — spec then code.** `guard.spec.ts` gains: `isCatalogHref` true for the four paths (with or without a query), false for `/territories/north-ridge` and `/models/pump`; `routesInApp` true for `/territories` on a plain click, false with metaKey. Implement.

- [ ] **Step 2: shell + routes.** `CatalogShell` (spec: renders children inside a `main`; fixture). `catalog-shell-route.tsx` mirrors `console-shell.tsx`: `useQuery(meQuery)`, the same `onClickCapture` delegate, `<CatalogShell><Outlet /></CatalogShell><Toaster />`. `routes.tsx`: 
```ts
export const catalogRoute = createRoute({ getParentRoute: () => rootRoute, id: "catalog", beforeLoad: ({ location }) => { const t = redirectTarget(isAuthed(), location.href); if (t) throw redirect(t); }, loader: ({ context }) => context.queryClient.ensureQueryData(meQuery), component: CatalogShellRoute });
export const territoriesRoute = createRoute({ getParentRoute: () => catalogRoute, path: "/territories", component: TerritoryCatalogScreen });
export const territoryNewRoute = createRoute({ getParentRoute: () => catalogRoute, path: "/territories/new", component: UploadTerritoryScreen });
export const modelsRoute = createRoute({ getParentRoute: () => catalogRoute, path: "/models", component: ModelLibraryScreen });
export const modelNewRoute = createRoute({ getParentRoute: () => catalogRoute, path: "/models/new", component: UploadModelsScreen });
```
Until Tasks 4–7 land, point the four leaves at a one-line placeholder component exported from the shell route file (`const Soon = () => <p>Soon</p>`) so the router compiles — remove it in Task 7. `router.tsx`: `catalogRoute.addChildren([...])`. `console-shell.tsx`: `backHref="/territories"`. Add the new wiring file to `exempt-modules.ts`. **Layering:** `app` importing `pages` is inward — fine.

- [ ] **Step 3: entities/upload — spec first.** `upload-gateway.spec.ts` stubs `fetch` (the file pattern from `audit-gateway.spec.ts`) and `setCsrfToken("csrf")`: `initiateUpload(10, "application/zip")` POSTs `/api/uploads` with the JSON body; `appendChunk("u1", 0, blob)` PATCHes `/api/uploads/u1` with `Upload-Offset: 0`, `Content-Type: application/octet-stream`, `X-CSRF-Token: csrf`, and returns the response's `Upload-Offset` (or offset+size when absent); a non-2xx PATCH rejects with the status; `finalizeUpload` POSTs `/finalize`; `abortUpload` DELETEs. `run-chunked-upload.spec.ts` with mocked gateway functions: a 20 MiB `File` (use `new File([new Uint8Array(0)], …)` and override `size`/`slice` via a small fake object typed as `File`) yields three chunks, `onProgress` reports `{chunk: 1, chunks: 3, bytes: 8 MiB, total}` then 2/3, 3/3, and finalize is called once; a session that starts at `offset = 8 MiB` skips the first chunk; an aborted signal between chunks rejects with `"upload aborted"` and never calls finalize. `title.spec.ts`: `deriveTitle("MyBuilding-v2.zip") === "MyBuilding-v2"`, `deriveTitle("  pump jack .ZIP ") === "pump jack"`; `slugPreview("Refinery Block C") === "refinery-block-c"`, `slugPreview("Ünïcode & co!") === "unicode-co"`. `upload-stats.spec.ts`: two samples 1 s apart with 8 MiB delta → `bytesPerSecond ≈ 8 MiB`, eta = remaining / rate; fewer than two samples → both null; `formatEta(30) === "<1 min"`, `formatEta(190) === "~3 min"`. Implement (`upload-gateway.ts` ports the old one onto `httpPost` + raw `fetch` with `ensureCsrfToken` from `@/shared/api`; `run-chunked-upload.ts` ports the loop with the richer progress payload).

- [ ] **Step 4: create/thumbnail gateways and the counts.** `to-territory.ts`: `placementCount: d.placementCount ?? 0`; `to-model.ts`: `usageCount: d.usageCount ?? 0` (specs). `territories-gateway.ts`: `createTerritory` → `httpPost<components["schemas"]["TerritoryCreated"]>("/api/territories", input)` mapped to `{ territory: toTerritory(r.territory), job: { id: r.job.id } }`; `models-gateway.ts`: `createModel` likewise (`ModelCreated`), `setModelThumbnail` → `httpPatch("/api/models/{slug}", { thumbnailBlobHash })`. Specs assert URL, method, body and the mapped shape. Export from the barrels. Fix any fixture/spec that builds a `Territory`/`Model` literal without the new field (grep `sourceBlobHash:` in specs and fixtures).

- [ ] **Step 5: `stageLabel`** — spec with the table from the spec §4; implement as a `Record` + regex for `lod-N`.

- [ ] **Step 6: Lint, tests, live smoke, commit.** `yarn lint && yarn test:coverage`. Live: sign in, open `/territories` — the shell renders (placeholder), `/console` back link goes to `/territories`, a `/console/content` link click stays in-app. 

```bash
git add frontend-v2
git commit --no-verify -m "feat(frontend-v2): the catalog shell, four routes, and the upload and create entities

Frontend-only; the backend gate is skipped with --no-verify because
nothing under backend/ changes.

A sidebar-free shell under /territories and /models, gated on the
session like the console; the click delegate keeps those links in v2
while /territories/<slug> still leaves to the old SPA's viewer.
entities/upload ports the 8 MB chunked upload with byte, chunk and
speed progress; territory and model gain create, the model a thumbnail
PATCH, both the new list counts; stageLabel names the worker's tokens.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 4: Territory Catalog page — `/territories`

**Files:** `frontend-v2/src/pages/territory-catalog/{index.ts, model/catalog.ts (+spec), model/use-territory-catalog.ts (+spec), ui/territory-catalog-page.tsx (+spec), ui/territory-catalog-screen.tsx (+spec), territory-catalog-page.fixture.tsx}`; `routes.tsx` leaf → `TerritoryCatalogScreen`.

**Interfaces:**
```ts
export type TerritoryTab = "all" | "ready" | "converting";
export type TerritoryCardModel = { slug: string; title: string; description?: string; status: ConversionStatus; chips: CatalogChip[]; progress?: { value: number; stage: string }; trailing: { label: string; tone }; openable: boolean; panorama: boolean };
export function toTerritoryCard(t: Territory, artifacts: Artifact[], job?: TargetJob): TerritoryCardModel
export function tabCounts(cards: TerritoryCardModel[]): Record<TerritoryTab, number>
export function matchesTerritory(card: TerritoryCardModel, tab: TerritoryTab, query: string): boolean  // keys state:, panorama:, free text on title/slug
export type TerritoryCatalogPageProps = { cards: TerritoryCardModel[]; tab: TerritoryTab; counts; onTabChange; query; onQueryChange; canUpload: boolean; canDelete: boolean; canReplace: boolean; onUpload: () => void; onOpen: (slug) => void; onReplace: (slug) => void; onDelete: (slug) => void; emptyHint?: string };
```
Behaviour per spec §5.1: status via `toContentItem`'s rule (reuse it through a thin adapter, or port the rule with the same spec cases); chips `N placement(s)` from `placementCount`, size (`formatBytes(totalSize(artifacts))` when converted), `panorama` (ok) when `externalPanoramaUrl`, `LOD 0-1` (warn) while converting from `lodLabel`; progress `{ value: Math.round(job.progress*100), stage: stageLabel(job.stage) }`; trailing `Open →` accent when ready, `converting` muted, `unavailable` muted when failed, `pending` muted. Hook: `territoriesQuery`, `jobsQuery`, `useQueries(artifactsQuery)` as `use-content.ts` does (`combine` inline), `deleteTerritory` mutation with `ConfirmDialog` state (`ask/confirm/dismiss/pending/busy`), toasts `Territory deleted` / gateway message, invalidates `["territories"]`; `onOpen` → `leaveTo(territoryPath(slug))`; `onReplace` → `leaveTo(`/territories/${slug}/replace`)`; `onUpload` → router `navigate({ to: "/territories/new" })`. Page: `PageHeader size="xl" eyebrow="Territory catalog" title="Scenes to walk through" description="Sites you have access to. Open one to inspect it in 3D, measure distances and place models." back={{ label: "← Home", href: "/territories" }} action={<div className="flex items-center gap-[9px]"><ThemeToggle variant="compact" />{canUpload && <Button variant="primary" shape="pill" onClick={onUpload}>+ Upload</Button>}</div>}`; filter row `flex flex-wrap items-center gap-2.5`: `FilterBar` (`flex-1 basis-[18rem]`, label `Filter territories`, placeholder `filter: state:ready panorama:yes`) + `Segmented tone="soft" fill={false} mono ariaLabel="Show" className="bg-panel"` items `All · N`, `Ready · N`, `Converting · N`; grid `grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]` of `CatalogCard` with overlay actions (`Button shape="icon" size="sm"` with `Icon refresh` named `Replace source of <title>` and `Icon trash` named `Delete <title>`, each gated); footer `EmptyState layout="row" icon="plus" title="Add another territory" description="ZIP with OBJ + MTL + textures — conversion starts automatically." action={<Button variant="accent" shape="pill" size="sm">Upload territory</Button>}` when `canUpload`. Screen: skeleton grid while loading, bad callout when unavailable, `ConfirmDialog` (`Delete <title>?`, "Its placements, panoramas and documents go with it. This cannot be undone.", `Delete`, danger).

Specs (write first): `catalog.spec.ts` — the card mapping for ready/converting/failed/pending, the chips, `tabCounts`, `matchesTerritory` on `state:`/`panorama:`/text; `use-territory-catalog.spec.tsx` — loading→ready with cards, delete asks/confirms/toasts/invalidates, refusal keeps the card; `territory-catalog-page.spec.tsx` — header copy, tabs with counts, N unique `Delete <title>` names, actions hidden without grants, empty hint; `territory-catalog-screen.spec.tsx` — dialog wiring. Live check both themes beside the mock; note deviations. Commit `feat(frontend-v2): the Territory catalog, live` (body per the pattern).

---

### Task 5: Model Library page — `/models`

Same shape as Task 4 in `pages/model-library/`. Differences: `ModelTab = "all" | "inUse" | "noImage"` (`In use` = `usageCount > 0`, `No image` = no thumbnail); filter keys `thumbnail:` (`none|yes`), `used:` (number), `lod:`; card `size="sm"`, `thumbnailUrl(model)` else `noImageLabel="no image"`; badge only when converting/failed; trailing `in N territories` accent (`in 1 territory`), `unused` muted, `queued` warn (converting), `unavailable` bad (failed); overlay only Delete (`model:delete`); header `eyebrow="Model catalog"`, title `Models for placement`, lede `Reusable equipment you can drop onto any territory. Thumbnails come from the model detail page.`; FilterBar placeholder `filter: thumbnail:none used:0 lod:2`; grid `minmax(216px,1fr)` gap 3; footer CTA `Add models in bulk` / `Pick several ZIP archives at once — titles autofill from filenames.` / `Upload models` → `/models/new`; `ConfirmDialog` copy `Delete <title>?` / "This cannot be undone." (the gateway refuses a placed model on its own; its message reaches the toast — the card already says `in N territories`, so a placed model's Delete button is disabled with the title `Remove its placements first`). Commit `feat(frontend-v2): the Model library, live`.

---

### Task 6: Upload Territory page — `/territories/new`

**Files:** `pages/upload-territory/{index.ts, model/upload-form.ts (+spec), model/use-upload-territory.ts (+spec), ui/upload-territory-page.tsx (+spec), ui/upload-territory-screen.tsx (+spec), upload-territory-page.fixture.tsx}`; route leaf.

**Interfaces:**
```ts
export type UploadPhase = "idle" | "picked" | "uploading" | "finalizing" | "creating" | "failed";
export type UploadForm = { title: string; description: string; panoramaUrl: string };
export const canSubmit = (phase: UploadPhase, file: File | null, form: UploadForm) => phase === "picked" && !!file && form.title.trim() !== "";
export const fileMeta = (file: File) => `${formatBytes(file.size)} · ZIP`;
export function stagesFor(phase: UploadPhase): (ConversionStage & { hint: string })[]   // the five mocked stages; upload active while uploading, finalize active while finalizing, rest pending; both done once creating
export function progressLine(p: UploadProgress, stats): { header: string; stats: string[] }  // "64% · 1.54 GB / 2.4 GB · ~3 min", ["chunk 197 / 308", "8 MB chunks", "24.6 MB/s", "resumable"]
export type UploadTerritoryPageProps = { phase; file: File | null; form; onForm(patch); onFiles(files); onReplace(); slug: string; progress?: { value: number; header: string; stats: string[] }; onSubmit(); onCancel(); canUpload: boolean; checks: ChecklistItem[]; stages };
```
Hook: state machine; `onFiles([f])` → `picked`; submit → `uploading` with an `AbortController`, samples pushed on each `onProgress` for `uploadStats`; `finalizing` from `onStage`; then `creating` → `createTerritory` → `leaveTo(`/territories/${slug}?jobId=${job.id}`)`; a throw toasts and returns to `picked` (the file is kept); cancel aborts → `picked`. `slug = slugPreview(form.title)`. Page per mock summary (`PageHeader size="lg" eyebrow="Upload · single territory" title="New territory" back={{label:"← Territory catalog", href:"/territories"}}`, lede verbatim; grid `lg:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)] gap-5 items-start`; left: `DropZone`/`FileCard`, Details panel (`SectionHeading title="Details" count="slug is generated from the title"`, `TextField label="Title" required`, slug line `<p className="mt-[7px] flex gap-[7px] font-mono text-[11px]"><span className="text-dim">slug</span><span className="text-accent">{slug}</span></p>`, `Textarea label="Description"`, `TextField label="Panorama tour URL" mono hint="Optional. Link to an externally-hosted 360° tour — shown as a button in the viewer."`), progress panel while uploading/finalizing (`border-accent-line`), buttons row (`Button variant="primary"` `Upload territory` / `Uploading…` loading, `Button` `Cancel`); right aside `lg:sticky lg:top-6`: "What happens next" card (`Card overline="What happens next" title="Upload → convert → viewer"` head on panel-2 + `StageList activeTone="accent"` with hints), Checklist card (overline `Archive checklist`, the four items: first three ok, last not), `Callout tone="warn" icon="info"` verbatim). No `territory:write` → `Callout tone="warn"`: "Uploading a territory needs territory:write." Specs: `upload-form.spec.ts` (canSubmit, fileMeta, stagesFor per phase, progressLine), hook spec with mocked `runChunkedUpload`/`createTerritory` (picked→uploading→creating→leaveTo with jobId; failure returns to picked and toasts; cancel aborts), page/screen specs on labels and disabled states. Live: upload a real ≥ 8 MB ZIP (a zipped OBJ from the fixtures or any file renamed `.zip` — the gateway accepts any bytes) and land on the old SPA's conversion screen. Commit `feat(frontend-v2): Upload territory, live`.

---

### Task 7: Upload Models page — `/models/new`

**Files:** `pages/upload-models/{index.ts, model/batch.ts (+spec), model/use-upload-models.ts (+spec), ui/upload-models-page.tsx (+spec), ui/queue-row.tsx (+spec), ui/upload-models-screen.tsx (+spec), upload-models-page.fixture.tsx}`; route leaf; remove the `Soon` placeholder from the shell route file.

**Interfaces:**
```ts
export type RowStatus = "queued" | "uploading" | "finalizing" | "creating" | "done" | "failed";
export type QueueRow = { id: string; file: File; title: string; status: RowStatus; progress: number /*0–1*/; error?: string; thumbnail?: File };
export const makeRow = (file: File): QueueRow
export const isBusy = (s: RowStatus) => s === "uploading" || s === "finalizing" || s === "creating";
export function batchMix(rows): CoverageSegment[]       // done ok / uploading (busy) accent / queued neutral / failed bad
export function batchStats(rows): { archives: string; total: string; failed: number }
export const canRun = (rows, running) => !running && rows.some(r => r.status === "queued" || r.status === "failed") && rows.filter(r => r.status !== "done").every(r => r.title.trim() !== "")
export function currentRowStages(row: QueueRow): ConversionStage[]   // Chunked upload / Finalize blob / Upload thumbnail / Create model + queue job
export type UploadModelsPageProps = { rows; onFiles; onTitle(id, title); onRemove(id); onThumbnail(id, file|null); onClearDone; onRun; onCancel; running: boolean; current?: { row, progress: UploadProgress, stats }; mix; stats; checks; canUpload; failedNames: string[] };
```
Hook: rows in state; `run` loops sequentially over rows not `done` (queued and failed alike — a re-run retries failures), per row `runChunkedUpload(file)` (status uploading/finalizing, progress), then thumbnail upload if any, then `createModel({ title, sourceBlobHash, thumbnailBlobHash })` → done; a throw marks the row failed with the message, toasts `<file>: <message>`, continues; `cancel` aborts the current row (it becomes failed "cancelled") and stops the loop; finish: one processed row and one created → `leaveTo(`/models/${slug}?jobId=`)`, several created → `navigate("/models")`, none → stay. Page per mock summary: `PageHeader size="lg" eyebrow="Upload · batch" title="New models" back="← Model library"`; stat row `grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]` with `CoverageMeter label="Batch progress" detail="k of n done" detailTone="accent"` + three `StatTile size="lg"`; body grid `lg:grid-cols-[minmax(440px,1fr)_minmax(300px,360px)]`; left `DropZone multiple`, Queue (`SectionHeading title="Queue" count="5 archives · 1.14 GB total"` + `clear done` link button), rows (`QueueRow` component: article with `border-l-[3px]` tone rail, 32px cube thumb, file name mono 11px, title `TextField` (locked when busy/done), `Badge` status chip, `×` icon button `Remove <file>` (disabled while busy), progress row while uploading, error line, footer `thumbnail · attached` / `thumbnail (optional) · add image` as a label over a hidden `image/*` input + size); action row (`Upload N models` / `Uploading k of n…` loading, `Cancel batch`, the mono note verbatim); right aside: `Current row` card (`border-accent-line`, head on accent-soft, title/file · size, `StageList activeTone="accent"`, key/value grid chunk/speed/thumbnail), `Checklist` card `Before you submit` (items verbatim; first two ok), `Callout tone="bad"` listing failed files verbatim pattern `<file> failed — a failed row doesn't stop the rest of the batch. Fix the archive and re-add it.`; no `model:write` → warn callout. Keep each file ≤ 200 lines: the page composes `QueueRow` and an `UploadAside` sub-component if needed (same slice, spec each). Specs: `batch.spec.ts` (makeRow title, mix, stats, canRun, stages per status), hook spec with mocked entities (sequential order, thumbnail before create, a failing row does not stop the next, cancel, redirect rules), page/row specs (locked title, unique `Remove <file>` names, chip text, progress only while uploading). Live: two real ZIPs, one with a thumbnail image; watch the sequence and the redirect. Commit `feat(frontend-v2): Upload models, live`.

---

### Task 8: Final whole-package review

Review `git diff <plan-commit>..HEAD -- proto backend frontend-v2` against the spec and the mock summaries; Critical/Important → one fix wave + one scoped re-review; Minor → ledger. Then update `frontend-v2/CLAUDE.md` ("What is wired": the four catalog pages and the shell; the upload entity; the counts) and the PR body in a closing docs commit.
