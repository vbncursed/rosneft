# frontend-v2 Parts 3–4 — contested decisions (survey, 2026-09-03)

Draft input for the Part 3 (Content + Territory access) and Part 4 (Audit + Metrics) plans.
Format mirrors the Rulings section of `docs/superpowers/plans/2026-09-03-frontend-v2-users-and-roles.md`.
Tags: **[NR]** no endpoint → not rendered (spec "Actions with no endpoint" rule) · **[BE:size]** needs a backend change · **[FE]** pure frontend choice.
Not yet approved — every item below is a question for the user before a plan is written.

## Part 3a — Content (`src/pages/content/`)

**C1. `ContentItem.status: "ready"|"converting"|"failed"`** (`entities/content/model/content-item.ts:9-24`) — drives `ContentGroups` grouping, `pipelineCounts` (:73-79) and the CoverageMeter.
*Gateway:* `GET /api/territories` (openapi.yaml:937) and `GET /api/models` (:1383) return no status field; `catalog.proto:75-95` has none either. Job state exists only via `GET /api/jobs/{id}/events` (:2181); mesh exposes `SubmitConversion` + `GetJob` by id only — no list, no by-slug. Artifacts (`:1100`, `:1462`) return an array; empty is indistinguishable between never-converted, converting, and failed.
*Options:* (a) `ready` iff artifacts non-empty, else `converting`; (b) two states — `ready` / `pending` — with `converting` only for a job this session started (jobId in URL search + SSE); (c) **[BE:M]** add `conversionStatus` to catalog Territory/Model (proto field, worker write-back, gateway mapper, openapi).
*Recommend (b), file (c).* (a) prints "converting" forever for a failed conversion — the confident-wrong-value the plan's constraints forbid. **[FE]**
*Consequence:* the pipeline meter loses its `failed` segment; `status:failed` stops matching.

**C2. Stat tiles** (`content-page.fixture.tsx:53-57`). Counts are free from list lengths. "Storage 184 GB" = sum of artifact sizes (N+1). "3 shared with guests" needs Root-only `/admins` per territory.
*Recommend:* Territories + Models with honest hints; Storage only if C1 already fetches artifacts, else dropped. `ContentPageStat.hint` is required (`content-page.tsx:16`) — pass real text, never an SLO-style claim. **[FE]**

**C3. `item.lods` / `item.size` / inspector `details`** ("source / artifacts / lods / job", `widgets/content-inspector/ui/content-inspector.tsx:10`).
*Gateway:* artifacts give lod numbers + `size` + `vertices`/`faces` (openapi:88-119). No source filename, no source size, no job id after the fact.
*Recommend:* lazy — rows show "—", the inspector fetches `/artifacts` on select (spec, "absent until its data has arrived"). The "job" detail draws only while an SSE subscription is live. **[FE]**

**C4. `onReplaceSource` for a model.** `POST /api/territories/{slug}/source` (openapi:1051); no `/api/models/{slug}/source`. **[NR]** for `kind:"model"`. `ContentInspectorProps.onReplaceSource` (`content-inspector.tsx:18`) becomes optional; the row menu omits the item. **[BE:S]** alternative — mirror the territory handler; file, don't build.

**C5. `onCancelJob`** — spec: deferred; no cancel RPC in mesh proto. Already optional (`content-page.tsx:49`). **[NR]**

**C6. Rename / edit title** — `TerritoryUpdate` = `externalPanoramaUrl` only (openapi:309-316), `ModelUpdate` = `thumbnailBlobHash` only (:297-307). No control in the mock, so nothing is lost — recorded so nobody adds one. Contradicts the spec's "`PATCH`…on each" reading.

**C7. `onUploadTerritory` / `onUploadModel` / drop zone.** No v2 upload form (spec Deferred); upload is `POST /api/uploads` → PATCH → finalize → `POST /api/territories`.
*Recommend:* absolute links to `/territories/new` and `/models/new` (prod route paths). `ContentGroups.onDropZoneClick` (`content-groups.tsx:23`) gets the same navigation; the zone cannot accept a real drop. **[FE]**

**C8. `canManage`.** `POST /api/territories`→`territory:create`, `DELETE`→`territory:delete`, models→`model:write`/`model:delete` (`route_permissions.go:31-36`). `POST …/source` is in **no** route-perm entry — session only.
*Recommend:* header `canManage` = the screen-level OR (matches `guard.ts:50-54`); the row menu builds items from per-kind grants so a hidden control beats a 403. **[FE]** (Flag the unguarded `/source` route to the backend — **[BE:S]**.)

**C9. Group keys.** With C1 there is no "Needs attention" bucket. *Recommend:* "Converting" (only while a live job exists) / "Territories" / "Models". **[FE]**

## Part 3b — Territory access (`src/pages/territory-access/`)

**A1. Three-way `Visibility` switch** (`entities/territory/model/access.ts:2`; `AccessInspector` RadioCards). Spec already rules it out; confirmed — `TerritoryAdmins` is `{userIds: string[]}` and nothing else (openapi:318-325). **[NR]**
*Cost:* `ManagedTerritory.visibility` and `onVisibilityChange` (`territory-access-page.tsx:20,41`) plus the same two on `AccessInspector` become optional — a **widget edit**, which the spec's "the pages themselves are not touched" does not cover. The alternative (a constant `"assigned"` with a live-looking switch) is the lying control the spec forbids. Take the widget edit.

**A2. `AccessGroup` grouping by visibility** (`fixture:63-73`) — no key to group on.
*Options:* (a) one group; (b) "Shared" (userIds non-empty) / "Not shared"; (c) alphabetical.
*Recommend (b)* — the only distinction the data carries, and it keeps the `mix` CoverageMeter meaningful (two segments). Cost: one `/admins` call per territory; fetch lazily, render notes as "—" until resolved, fall back to (a) if it bites. **[FE]**

**A3. `AccessGrant.via: "direct"|"role"|"owner"`** (`access.ts:5`, `isRevocable`/`grantAction` :46-53). The gateway has one grant kind — a `territory_assignments` row. *Recommend:* everything is `direct`. `hasInheritedGrants` is then always false and the INHERITED_NOTE never draws; no widget change needed. **[FE]**

**A4. `roleTitle` / `username` / `inactive`.** Named via `GET /api/auth/users` + `/api/auth/roles`. *Recommend:* `roleTitle` = first role title else "—"; a userId missing from the users list renders as the bare id with `inactive: true` — do not drop the row, the grant is real. **[FE]**

**A5. `TerritoryAccess.meta` / `faces` / `peopleLabel`** (`access.ts:17-27`, all required). `faces` = up to 4 usernames from `/admins`; `peopleLabel` = "N people". The mock's "14 placements" needs `GET …/placements` per territory (openapi:1144).
*Recommend:* `meta = "${slug} · upd. ${updatedAt}"`, placements dropped; `updatedAt` is optional on Territory (openapi:45-56) → omit the segment rather than print a wrong date. **[FE]**

**A6. Stats tiles** (`fixture:42-46`). Derivable from the same `/admins` fan-out. "via role" is meaningless (A3). *Recommend:* "Territories" / "Not shared" (tone `warn`) / "People with access". **[FE]**

**A7. `onBulkAssign`** — `PUT …/admins` is per territory; bulk = N PUTs with partial failure. **[NR]**; `TerritoryAccessPageProps.onBulkAssign` (:47) becomes optional and the header action draws only when handed.

**A8. `onAddPerson`** — no picker behind the mock's control. *Recommend:* a dialog over `GET /api/auth/users`, as prod's `AssignAdminsDrawer` does (`assign-admins-drawer.tsx:11-33`) — but **without** prod's filter on role *titles* "Company Owner"/"Guest" (fragile string matching). Root may assign anybody; let the PUT decide. **[FE]**

**A9. Save.** `PUT …/admins` replaces the whole set — the dirty/cancel/save panel maps exactly. On success invalidate that territory's admins query only. **[FE]**

**A10. Screen gate.** `guard.ts:55` gates on `p.isOwner`, and `IsOwner` is **Root** (`principal.go:58-62`) — consistent with the handler (`territory_admins.go:17,33`). Correct as written.

## Part 4a — Audit (`src/pages/audit/`)

**D1. `live` badge** (`audit-page.tsx:51`) — no SSE, no long-poll; `/api/audit` is cursor-paged (openapi:770-822).
*Options:* (a) **[NR]**; (b) render while a `refetchInterval` is active — the badge then means "following".
*Recommend (b)*: 15–30s interval on the first page only, paused on hidden tab (prod does this in `use-panel-series.ts:40-51`). **[FE]**

**D2. `activity` sparkline, 24 hourly buckets** (`fixture:75-80`) — no aggregate endpoint.
*Options:* (a) **[NR]**; (b) bucket the loaded page (50 rows — describes the page, not the day); (c) a separate `from=now-24h&limit=200` query, bucketed, `dimFrom` marking the incomplete hour, detail reading "from N loaded events" when capped.
*Recommend (c)*; (b) is the confident-wrong-value trap. **[BE:M]** alternative: an aggregate RPC in audit-service.

**D3. `counters`** (`fixture:82-86`). `Actors` = `/api/audit/actors` length (openapi:873), exact and free. `Today`/`Failed` have no count endpoint, and `result` is not even a filter (`audit.proto:37-51`). *Recommend:* keep Actors; recompute the other two over D2's 24h window and label them "last 24h", not "Today"; drop both if D2 lands as (a). **[FE]**

**D4. `AuditDay.total`** (`audit-page.tsx:16-18`) — no count. Pass `undefined`; `EventTimeline` already omits it (`event-timeline.tsx:31-35`). **[NR]**

**D5. `recordId` + `ip` / `digest` details** (`fixture:130-138`). `AuditEntry` (openapi:653-698) carries neither. audit-service keeps a hash chain (`internal/digest/`) that nothing exposes; the proto has `request_id` (`audit.proto:33`) and the gateway never maps it.
*Recommend:* `recordId` = the entry id; details = actor / at / company / result / territorySlug. File **[BE:S]** to surface `request_id`; **[BE:M+]** for the digest — do not block on it. Leave the "tamper-evident" header copy (`audit-page.tsx:84-86`); true of the backend, must not be dressed up with a fake digest row.

**D6. Filters** (`FILTER_PLACEHOLDER`, `audit-page.tsx:60`). Gateway takes `actor` = **user id**, `action`/`entity` = **exact** strings (openapi:788-800). `failed:` has no parameter; free text has no field.
*Rulings:* `actor:<login>` → id via `/api/audit/actors`; an unknown login yields an empty result with a sentence, never an unfiltered list. `entity:`/`action:` pass through verbatim. `failed:true` — **drop it**; a filter that only sees loaded pages lies at page 2. Free text not sent, placeholder updated. Date range chip → `from`/`to`, porting `toBound` verbatim (`audit-gateway.ts:55-58`). **[FE]**

**D7. `days`** — client-side by local date over the flattened infinite query. Port `getNextPageParam` **with** the `nextCursor > 0 ? … : null` normalisation (`audit-gateway.ts:79`, `use-audit-log.ts:20-27`) — a `0` cursor means last page and loops forever otherwise.

**D8. `onLoadOlder` / `loadingOlder`** → `fetchNextPage` / `isFetchingNextPage`; absent when `!hasNextPage`.

**D9. `onExport`** — `GET /api/audit.csv` (openapi:896). Port the blob download verbatim (`export-button.tsx:9-23`). Same filters, never the cursor. **[FE]**

**D10. `onOpenEntity`** — absolute link to `/territories/{entityLabel}` or `/models/{entityLabel}`, absent otherwise; port `pathFor` (`entity-link.tsx:8-13`) incl. its no-link-on-delete rule.

**D11. `eventKind` is wrong about the vocabulary.** `entities/audit/model/event-kind.ts:10-15` maps a trailing `create`; the journal writes `<entity>.insert|update|delete` (`frontend/src/audit/domain/vocabulary.ts:36`) plus `auth.*`. Every insert currently renders as an update. One-line fix. The v2 fixture's `territory.create` / `model.upload` / `user.role_change` / `placement.create` are fiction. **[FE, bug]**

**D12. `refs`** (openapi:715-728) — the page dictionary naming ids inside snapshots. v2's `diffRows`/`formatValue` know nothing of it, so `role_id: 9b75…` renders raw.
*Recommend:* port `labelFor`/`shortId` (`ref-label.ts`) and thread merged refs into `RecordInspector` as one optional prop. ~20 lines, already tested in prod. **[FE]**

**D13. Screen gate** — `audit:read` (`guard.ts:56`) matches `routePerms` (`route_permissions.go:26`). Do **not** fall back to `/api/audit/mine` on 403.

## Part 4b — Metrics (`src/pages/metrics/`)

**M1. `services: ServiceHealth[]`** (`metrics-page.tsx:22`, `entities/metric/model/service.ts:4-15`).
*Gateway:* `stat-up` is `sum(up{job="services"})` — one scalar (`registry.go:18`). `red-rate`/`red-errors` are `sum by (service)`; `red-latency` is `by (grpc_service)`. Nothing gives per-service `up`.
*Options:* (a) **[NR]** the whole list; (b) synthesise — services = `red-rate`'s label set, `degraded` when `red-errors` non-zero, a vanished service simply absent (never "down"); (c) **[BE:S]** add `"services-up": {expr: 'up{job="services"}', instant: true}` to `registry.go:16-46` plus one enum entry at openapi.yaml:2199-2230 and regenerate.
*Recommend (c); (b) only until it lands.* (b) can never say "down".
*Notes:* `latency` ← `red-latency`, but `grpc_service` ≠ `service`; render "—" on a miss.

**M2. `Series` shape mismatch.** `MetricPanel.series` is `{label, values: number[]}` (`shared/ui/line-chart`, index-based); the gateway returns `{label, points:[{t,v}]}` (openapi:626-652); gaps are real (`series.go:91`).
*Options:* (a) `points.map(p => p.v)`; (b) align on the union of timestamps (port `toRows`, `series.ts:17-27`); (c) widen `Series.values` to `(number|null)[]`.
*Recommend (b)+(c)*; without (c) the chart draws a line through an outage. **[FE]**

**M3. Panel catalogue.** Port `panel-catalog.ts` + `formatValue(v, unit)` (`series.ts:34-52`). `meta` static per panel id.
*Fixture panels with no registry id:* **`sessions`** → **[NR]**; **`protocol`** → render `red-http` as "HTTP requests". *Free additions:* `domain-upload`, `domain-twofa`. **[FE]**

**M4. `stats` deltas** (`metrics-page.tsx:12-19`). `stat-*` are instant. *Recommend:* `delta` not passed **[NR]**; **[BE:M]** alternative is an `offset`. `hint` = unit description, **not** the fixture's "SLO 0.5% breached".

**M5. `budget` (SLO budget · 30d)** — no error-budget query, no SLO, 30d outside the allow-list (`query.go:17-22`, max `7d`). **[NR]**; `MetricsPageProps.budget` (:24) becomes optional.

**M6. `alert` / `firingCount`** (`FiringAlert`, `alert-inspector.tsx:17-29`).
*Available* from `alerts` (`registry.go:45`): `name`, `meta` ← `service`/`severity`, `firingCount`, firing-vs-pending ← `alertstate`.
*Unavailable:* `firingFor` (needs `ALERTS_FOR_STATE`), `details.expr` (PromQL never leaves the server by design), `details.for`, `details.since`, `threshold`, `contributors`.
*Options:* (a) badge + plain list only; (b) inspector reduced to existing labels, no `threshold`, `contributors: []`; (c) **[BE:S]** register `alerts-for-state` for `firingFor`/`since` — and **[BE:M, reject]** a rules endpoint for `expr`.
*Recommend (b)*, file (c)'s first half. Make `series`/`contributors`/`firingFor` optional if the inspector does not degrade.

**M7. `onSilence`** — needs Alertmanager, not deployed. **[NR]**; optional on both prop types.

**M8. `onOpenInAudit` / `onCopyPromQl`** — nothing to copy; not an audited entity. Both **[NR]**, both optional.

**M9. `query` FilterBar** — client filter over what is on screen. `service:` → name substring; `group:` → section key; `state:` → service state; free text → panel title. **[FE]**

**M10. `range`.** `MetricsRange` matches the server allow-list (15m shipped in `abd7117`). Range lives in URL search and is a query-key input. **[FE]**

**M11. Polling.** 30s `refetchInterval`, `refetchIntervalInBackground: false`; `cache: "no-store"` (route answers `Cache-Control: no-store`). **[FE]**

**M12. One query per panel.** `["metrics", panelId, range]` per card; a 502 kills one card, not the screen. `MetricPanel` has no error state — consider a `MetricState`-shaped prop (`entities/metric/model/metric.ts:6-9`). **[FE]**

## Facts the spec states that the code contradicts

1. "`PATCH`…on each" — true as routes, but `TerritoryUpdate` is `externalPanoramaUrl` only and `ModelUpdate` is `thumbnailBlobHash` only. Neither renames.
2. "`POST /api/territories/{slug}/source`" — territories only; models have no source-replace route.
3. The spec implies a conversion stage is showable. Nothing lists jobs; a job id exists client-side only for an upload made in the same session.
4. "Metrics is owner-only" — correct, but *owner* means **Root** (`principal.go:58-62`), not Company Owner. Both v2 fixtures render Metrics and Territory access with `roleTitle: "Company Owner"` — unreachable states.
5. The spec lists the 15m range as awaiting the companion spec. It shipped (`abd7117`).
6. `nextCursor` is *absent or 0* on the last page; a naive `getNextPageParam` loops forever.
7. `event-kind.ts:10-15` expects `…create`; the journal writes `…insert`. Every creation renders as an update.

## Not-rendered roll-up

Content: model *Replace source*, *Cancel job*, `failed` status filter. Access: visibility switch, *Bulk assign*, inherited-grant note. Audit: `AuditDay.total`, `failed:` filter, `digest`/`ip` rows, free-text search. Metrics: `budget`, stat `delta`s, *Silence*, *Open in audit*, *Copy PromQL*, `expr`/`for`/`threshold`/`contributors`, the "Active sessions" panel.
