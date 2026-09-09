# Account activity pager — `total` from the gateway, six rows a page

Date: 2026-09-09. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Mock: Claude Design project `b5fa4afe-…`, file `Account v2.dc.html`,
"My activity" section as redrawn (digest: the "Account v2 — My activity"
part of `.superpowers/sdd/2026-09-08-home-v2/mock-digest.md`).

## Goal

The account page's "My activity" section shows six rows a page with a
numbered pager and a `1–6 of 184 events` summary, as the mock draws it. The
gateway does not know the total today; it learns to count.

## Decisions (user, 2026-09-09)

- **The total comes from the gateway**, not from a client-side cap: a
  numbered pager with an honest "of N" needs the number. (Alternatives
  refused: pages over the loaded set with `49+`; one 200-row fetch.)
- **The count is computed only when asked.** `ListEntriesRequest` gains
  `include_total`; `GET /api/audit/mine` asks, `GET /api/audit` does not — the
  company journal is polled every 30 s and a `COUNT(*)` over a company's slice
  with a date filter has no index to answer it.
- **Six a page, pages of the API stay 50.** The account keeps the shared
  `myAuditQuery` (cursor pages of 50; Home reads the same cache). A page the
  cache does not hold yet is reached by fetching cursor pages in sequence
  until it does — the API pages sequentially, so a jump to page 31 costs the
  cursors in between, once. The pager is disabled while that runs.
- **The back link stays `← Home`** though the redrawn mock says
  `← Back to site` (round three's decision).

## What the backend actually does

- Both JSON routes end in `Gateway.ListAudit` → gRPC `audit-service
  ListEntries` → `storage.List` (`SELECT … FROM audit_log WHERE …` with the
  predicates appended only when set, `ORDER BY id DESC LIMIT n+1`; the extra
  row is the cursor signal). The scope (`All` / `Company` / `Actor`) is written
  over the query by the service layer, never taken from the request.
- Indexes: `(company_id, id DESC)`, `(id DESC)`, `(actor_id, id DESC)`. A
  count of one actor's rows is an index scan; adding `company_id` (the
  non-Root own scope) is a filter over that slice. Action/entity/date filters
  have no index — fine over one actor's rows.
- `X-Next-Cursor` is set nowhere; paging is JSON-body only. `total` goes in the
  body too.
- The `/mine` handler test stubs `Service.ListAudit`; the gateway service tests
  drive `mocks.AuditMock.ListEntriesMock` at eight sites; the audit-service
  `Store` is a minimock (`go generate ./internal/service`); no storage test of
  `List` exists — the integration suites (testcontainers, `postgres:18.6`,
  build tag `integration`) live in `internal/migrate/`.

## 1. audit-service

- `proto/rosneft/audit/v1/audit.proto`: `bool include_total = 10;` on
  `ListEntriesRequest`; `int64 total = 3;` on `ListEntriesResponse`
  ("how many rows the same filters match, paging aside; 0 unless
  include_total"). `make -C backend proto-gen`.
- `domain.Filter` gains `IncludeTotal bool`. New `domain.Page{Entries []Entry;
  NextCursor int64; Total int64}`; `Service.List` returns `(Page, error)`.
- `Store` gains `Count(ctx, f Filter) (int64, error)`. `storage/filter.go`
  holds the one predicate builder both `List` and `Count` use
  (`filterWhere(f) (string, []any)` — company, actor, action, entity, from,
  to); `List` appends cursor and limit, `Count` appends nothing — the count
  is "everything the caller could page through", so `id < cursor` is paging,
  not filtering.
- `Service.List` calls `Count` only when `f.IncludeTotal`; it is called with
  the validated filter (the same company/actor checks apply).
- Tests: `list_test.go` — existing cases move to the `Page` shape; new:
  count requested → `CountMock` called with the cursor-free filter and its
  value lands in `Page.Total`; not requested → `CountMock` never called
  (minimock fails on an unexpected call). Integration
  (`internal/migrate/list_storage_integration_test.go`): record five rows
  for two actors, `List` with `Limit 2` for actor A returns two and a cursor,
  `Count` for actor A returns 3 whatever the cursor, for actor B 2.

## 2. gateway-service

- `domain.AuditQuery.IncludeTotal bool`; new `domain.AuditPage{Entries
  []AuditEntry; NextCursor int64; Total int64}`.
- `Audit.ListEntries(ctx, q) (AuditPage, error)`; `Gateway.ListAudit(ctx, q,
  sc, token, wantRefs) (AuditPage, map[string]string, error)` — the labelled
  entries live in the page. Mocks regenerated (`go generate
  ./internal/service`); the eight `ListEntriesMock.Return` sites and the
  `mineServiceStub` / CSV stub follow.
- `ListMyAudit` sets `q.IncludeTotal = true` and writes `page.Total` into the
  JSON; `ListAudit` leaves it false and writes no `total`; the CSV export
  leaves it false.
- `openapi.yaml` `AuditPage.total` (int64, `minimum: 0`, optional): "How many
  entries the same filters match in all, paging aside — what a numbered pager
  needs. Present on `GET /api/audit/mine`; the company journal is polled and
  does not pay for the count." `make -C backend openapi-gen`.
- Tests: `audit_mine_test.go` — the stub returns `Total: 184` and the test
  reads `Total == 184` off the 200 body and `seen.IncludeTotal == true`; a new
  `audit_test.go` (the company route had none) pins `seen.IncludeTotal ==
  false` and `Total == nil` in its body, with the same stub shape.
- Gate: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend
  check` green; commits without `--no-verify`.

## 3. frontend — the entity

- `yarn openapi:generate` (the pinned classic compiler); the `dto.ts` diff is
  `total?: number` on `AuditPage` and nothing else.
- `AuditPageResult.total: number | null` (`page.total ?? null`) in both
  `listAudit` and `listMyAudit`; the two query specs' page literals carry
  `total: null`.
- `myAuditQuery` unchanged (key, cursor, 50 a page). Home's `useHome` reads
  `pages[0].entries.slice(0, 4)` as before.

## 4. frontend — `shared/ui/pager`

- `pages.ts`: `pageList(page, count): (number | "gap")[]` — keeps
  `{1, count−1, count, page−1, page, page+1}` clipped to `1..count`, in order,
  one `"gap"` wherever two kept pages are not adjacent. `(1, 31)` →
  `[1, 2, "gap", 30, 31]`; `(5, 31)` → `[1, "gap", 4, 5, 6, "gap", 30, 31]`;
  `(31, 31)` → `[1, "gap", 30, 31]`; `(2, 3)` → `[1, 2, 3]`; `(1, 1)` → `[1]`.
- `pager.tsx`: `Pager({ page, pageCount, onPage, busy?, label = "Pages" })`
  → `<nav aria-label={label}>` with `Prev` and `Next` (`Button size="sm"` —
  radius 6, padding 6/12, 12 px; the shared sm control is 600 where the mock
  draws 500, recorded), page chips `<button aria-label="Page N">` 28×28,
  radius 6, `border-line-2 bg-panel-2 text-fg` mono 11 px, the current one
  `border-accent bg-accent-soft text-accent font-semibold` with
  `aria-current="page"`, gaps `…` as `aria-hidden` spans of the same box in
  `text-muted`; gap 6. Prev is disabled on page 1, Next on the last, every
  control while `busy`. Fixture: page 1 of 31, page 5 of 31, page 2 of 3,
  busy. Measured in Cosmos.

## 5. frontend — the account section

- `pages/account/model/paging.ts` (pure): `PAGE_SIZE = 6`; `pageCount(total)`
  (`0` events → `1` page — the section then draws the empty state, not a
  pager); `pageSlice(entries, page)`; `pageSummary(page, total)` →
  `1–6 of 184 events` (en dash; the last page `181–184 of 184 events`; the
  range form always, so a single event prints `1–1 of 1 events` — the
  formula, not a special case); `rowsNeeded(page) = page · PAGE_SIZE`.
- `useAccount`: `page` state (1-based); `total = pages[0].total ?? null`;
  `loaded = flattened.length`; an effect: while `rowsNeeded(page) > loaded &&
  hasNextPage && !isFetching` → `fetchNextPage()`. The page never exceeds
  `pageCount(total)`: the render clamps it, so a feed that shrank after an
  invalidation lands on its new last page. Returned: `activity` (the current
  page's slice, `null` when unanswered), `activityTotal: number | null`,
  `activityPage`, `activityPageCount`, `activityBusy: isFetching`,
  `onPage(n)`. `activityHasMore` and `onLoadMore` go away.
  **(as built)** The effect's guard is
  `rowsNeeded(page) > loaded && hasNextPage && !isFetching &&
  !isFetchNextPageError` — without the last clause a refused cursor page
  loops (960 requests in 50 ms measured), because the effect keeps seeing the
  rows it still needs and asking again. `activityBusy` is
  `activity.isPending || activity.isFetchingNextPage || walking`, not bare
  `isFetching`: `walking` is the effect's own guard, read a second time here
  so the frame between a chip click and the effect's fetch reads busy, never
  `stalled` — a background refetch (the feed is invalidated on every account
  change) still leaves the pager live, and the very first load draws the
  skeleton instead of flashing the empty state. Walking
  to a far page costs one cursor request per `defaultLimit` (50) rows in
  between, in order — `rowsNeeded(page)` divided by the store's page size,
  not by `PAGE_SIZE`.
- `ActivitySection` props: `entries: AuditEntry[] | null`, `page`,
  `pageCount`, `summary: string`, `busy`, `onPage`. Header meta `newest first
  · 6 per page`. Rows: `ActivityRow` with `px-[22px] py-3.5` (the mock's
  14/22), the second line is `summaryOf` as before. Footer (`border-t
  border-line px-[22px] py-3.5`, flex between, wrap): summary mono 10 px muted
  left, `Pager` right. `null` → the warn callout; `[]` (total 0) → the empty
  state, no footer. A page whose rows are still on the wire (`busy` and the
  slice is empty) draws two skeleton lines where the rows go and the pager
  disabled.
  **(as built)** An empty slice is told apart by `busy` and `pageCount`
  into three, not two, states: `waiting` (`busy && nothing`) draws six
  skeleton lines, not two — so the footer does not jump ~120px while the walk
  lands its rows; `stalled` (`!busy && nothing && pageCount > 1`) is a fourth
  section state, not covered above — the journal demonstrably holds more
  pages than this one but the cursor walk to it failed, so it draws the warn
  callout "This page could not be loaded." and **keeps the footer**, so a
  pager chip can get the reader back to a page that did load; `empty`
  narrows to `!busy && nothing && pageCount <= 1`, the true zero-row case,
  which alone draws the empty state with no footer.
- Page props: `activity`, `activityTotal`, `activityPage`,
  `activityPageCount`, `activityBusy`, `onPage`; the page computes
  `pageSummary` and hands the section its props. Fixture states: `ready`
  (page 1 of 2 over nine rows), `page 2` (the short last page), `empty
  activity`, `activity unavailable`, `loading`.

## 6. Tests

- Go: §1 and §2 name theirs. The integration suite runs with
  `go test -tags=integration ./internal/migrate/...` in `audit-service`
  (Docker up) — run once by the implementer and quoted; `make check` does not
  run it.
- `pages.spec.ts` — the five lists above plus `page` outside `1..count`
  clamped. `pager.spec.tsx` — Prev/Next disabled at the edges and while busy,
  `Page N` names, `aria-current` on the current chip, a click calls `onPage(n)`,
  gaps are not buttons. `paging.spec.ts` — `pageCount(0/1/6/7/184)`,
  `pageSlice` on the last short page, `pageSummary(1, 184)`, `(31, 184)`,
  `(1, 1)`. `use-account.spec.tsx` — the 403 → `null`; page 1 shows six of
  nine loaded; `onPage(2)` shows the remaining three with no fetch; with the
  stub answering a `nextCursor`, `onPage(4)` over a 6-row first page fetches
  until 24 rows are loaded (assert the fetch calls' `cursor` values) and then
  shows page 4; `activityTotal` reads the first page's `total`; a page past
  the count clamps. `activity-section.spec.tsx` — the meta line, six rows,
  the summary text, the pager present, disabled while busy, no footer on
  `[]`, the callout on `null`. `account-page.spec.tsx` — the summary computed
  from the props.
- Live: `admin` on :3001 — `/account` shows `1–6 of N events` with N equal
  to `curl /api/audit/mine | jq .total`; page 2 shows rows 7–12; the last
  page shows the remainder; `guest1` → the warn callout.

## Recorded deviations

- `Prev`/`Next` at weight 600 (the shared `Button size="sm"`), mock 500.
- The mock's second line (`session started · passkey`) is invented; the real
  one is `summaryOf`, empty for most auth rows — as today.
- `← Home`, not `← Back to site`.

## Out of scope

- `GET /api/audit` gets no total (the flag is false there); the console
  journal keeps its infinite scroll.
- `auditWindowQuery`'s 200-row window could become a `total` later; not now.
