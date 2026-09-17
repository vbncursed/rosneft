# Conversion follow-ups and the Part 4 deferred minors

Date: 2026-09-04. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). Follows `2026-09-03-conversion-visibility-design.md` ("Things found
on the way, not fixed here") and the Part 4 ledger's deferred minors.

## Goal

Close the two backend gaps the conversion-visibility spec left open — the
submit/reconciler race and the never-shrinking target index — and clear the
frontend-v2 minors the Part 4 reviews deferred. No new endpoints, no new
screens.

## Part A — mesh-service

### A1. The target lock moves into `SubmitConversion`

Today only the reconciler claims `andrey:mesh:inflight:{kind}:{slug}`
(`reconcile_missing_artifacts.go`); a gateway-initiated submit (create
territory, create model, replace source) never looks at it, so two jobs for
one target can run at once and the later terminal write — which may belong to
the older job — wins the index.

`SubmitConversion(ctx, kind, slug) (job domain.Job, created bool, err error)`:

1. Validate as today.
2. `TryLockTarget(kind, slug, TargetLockTTL)`. `ReconcileLockTTL` is renamed
   `TargetLockTTL`; the value and its doc comment stay — the TTL is now the
   recovery bound for every conversion, not only the reconciler's.
3. Lock taken → save Pending, enqueue, `GetJob`, return `created = true`. If
   save or enqueue fails, `UnlockTarget` before returning the error (the
   reconciler used to do this; now every caller gets it).
4. Lock held by someone else → find the target's latest job through the
   existing `ListTargetJobs` and pick the entry with matching kind and slug.
   - Status pending or running → return it, `created = false`. The gateway
     answers with a job the client can subscribe to, exactly as before.
   - Terminal, or no entry → the lock is stale (a crash between the terminal
     `SaveJob` and `UnlockTarget`, or the reconciler's sub-millisecond window
     between claim and submit). Save and enqueue a new job anyway, as today,
     `created = true`. No new error, no gateway change.

   `// ponytail: ListTargetJobs is O(catalog) per contended submit; an HGET
   on the index field if submits ever contend at scale.`

`ProcessJob` keeps releasing the lock on both exits; its two comments that
say a user-initiated conversion holds no claim are rewritten — every job holds
one now. The gRPC handler ignores `created`.

**Added after the final review — a source replaced mid-conversion is
re-queued.** Handing back the in-flight job has a cost the 409 discussion
below did not consider: `runConversion` reads the target's
`source_blob_hash` once, at its start, so a replace-source that lands while a
conversion runs would be answered with a job converting the *old* bytes, and
once its LOD0 is published the reconciler has no reason to retry. After
`markSucceeded`, `ProcessJob` therefore re-reads the target and, when the
hash differs from the one it converted, submits a new job through
`SubmitConversion` (the claim is already released, so it is created). A
target deleted mid-conversion is skipped; any other error is logged and does
not fail the job — its outcome is already decided. Two replacements during
one conversion converge over two conversions. `requeue_if_replaced.go`.

The stale-lock fallthrough releases the claim on a save or enqueue failure
only when this call took it — inside the one-round-trip window it could
otherwise release another submitter's fresh claim.

### A2. The reconciler stops locking and sweeps the index

`ReconcileMissingArtifacts`:

- For each target without LOD0: call `SubmitConversion`, count only
  `created`. The `TryLockTarget`/`UnlockTarget` calls leave this function.
  `queued` keeps its meaning: jobs this pass put on the queue.
- After the loop: build the set of live `{kind}:{slug}` from the
  `ListTargets` result already in hand, read `ListTargetJobs`, and call the
  new `Queue.ForgetTarget(ctx, kind, slug)` for every job whose target is not
  in the set. A sweep error is logged at Warn and does not fail the tick — the
  queueing half already happened. The sweep is skipped when the loop returned
  early on error.

`ForgetTarget` is `HDEL andrey:mesh:targets {kind}:{slug}`. The job hash is
left alone: `GetJob` by id must keep answering an SSE subscriber whose
territory was deleted mid-conversion, and job hashes already live forever.

Consequence accepted: a deleted target's last job stays in `GET /api/jobs`
for up to one reconcile tick (5 minutes), visible to Root only — scoped
callers never saw it, the tenant filter drops slugs outside their list.

### A3. `["jobs"]` invalidation — no code

frontend-v2 has no upload or replace-source flow (its links go to the old
SPA), and the console never ships to production beside the old SPA — it
ships when the rewrite is complete. The note stands for that day: **the v2
mutation that submits a conversion must invalidate `["jobs"]`**, because
polling arms only on an answer that already holds a live job.

### Testing (Go)

- `SubmitConversionSuite`: lock held + running job in the index → same job
  returned, `SaveJob` not called, `created = false`; lock held + failed job →
  new job saved, `created = true`; lock held + no index entry → new job; lock
  taken + save fails → `UnlockTarget` called; lock taken + enqueue fails →
  `UnlockTarget` called.
- `ReconcileSuite`: stubs move from `TryLockTarget` to `SubmitConversion`'s
  fan-out; `queued` excludes targets whose submit returned someone else's
  running job; a target present in the index but absent from the catalog is
  forgotten; a target in both is not; a `ForgetTarget` error does not fail
  the tick; the sweep does not run after a loop error.
- Storage: one case added to `list_target_jobs_integration_test.go` — after
  `ForgetTarget` the entry is gone from `ListTargetJobs` and `GetJob` still
  answers.
- Mocks regenerated with `go generate` (minimock).
- `make -C backend check` with `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path)`.

## Part B — frontend-v2 deferred minors

Verified against the code on 2026-09-04. Four of the ledger's deferred items
are already closed (object-URL revoke, refetch on tab visible, export toast
and unknown-actor disable, gateway-spec methods) and are not listed. Two are
dropped: the `useSearch` cast in `metrics-screen.tsx` is documented and a
runtime guard would exist only to satisfy a type; a guard test for
react-query's default `refetchOnWindowFocus` tests the library.

### B1. Audit

| # | Defect | Fix |
|---|---|---|
| 1 | `windowStart = floor(now, hour) − 24h`, so `countersOf` counts up to 25 hours while `activityOf` draws 24 buckets (`pages/audit/model/journal.ts`). | `countersOf` counts only entries that land in the strip's 24 buckets; bucket once, count from the buckets. |
| 2 | `exportAuditCsv` uses raw `fetch` (`entities/audit/api/audit-gateway.ts`): no `API_BASE`, no 401 bounce. | `shared/api/client.ts` gains a blob-returning variant of the existing request (same base URL, same 401 handling, no JSON parse); the gateway calls it. |
| 5 | Empty window prints "peak 0/h at HH:00". | `peak === 0` → the summary says there were no events in the last 24 h. |
| 14 | `live` ignores `isPlaceholderData`, so the badge stays lit over the previous filter's page. | `live` requires `!isPlaceholderData`. |
| 15 | Comment on `windowStart` claims it advances once an hour; nothing re-renders an idle tab. | Keep the behaviour, fix the comment: it advances on the next render. |
| 16 | The three callouts render above the `<h1>` (`audit-screen.tsx`). | `AuditPage` takes a `notice` slot rendered after its header; the screen passes the callouts there. The slot is a persistent `role="status"` live region, so a refusal typed into the filter is announced; `Callout` itself keeps `alert` for `bad` only. |
| 11 | `audit-screen.spec.tsx` compares `closest("div").parentElement` chains — DatePicker's wrapper DOM. | Delete the structural assertion; the `compareDocumentPosition` one beside it already carries the intent. |

### B2. Metrics

| # | Defect | Fix |
|---|---|---|
| 4 | A degraded row prints "0 errors/s": the state comes from `err > 0`, the label from `round(err)`. | `formatValue` for rates prints `<0.1/s` for a non-zero value that rounds to 0; the state and the label agree again. The same guard covers `percent` (`<0.1%`), because `stat-errors` is toned on the same `> 0` rule. |
| 7 | `LineChart`'s spoken summary reads raw `toFixed(2)` values with a bare unit ("0.0523 seconds"). | The panel passes its formatter down; the summary uses the same `formatValue` as the tile. |
| 8 | The no-budget grid is `lg:grid-cols-5` for a fifth tile `statsOf` never returns; the spec's five-tile case cannot occur. | `lg:grid-cols-4`; the spec case becomes "four tiles, no meter". |
| 10 | `StatTile` puts `aria-label` on a `<p>` (name-prohibited role). | Visually-hidden text inside the element instead of the attribute. |
| 12 | `servicesOf` matches one way (`label.includes(name)`), `focusSeries` either way, and the comment claims they agree. | One exported `matchesService(label, name)` in `entities/metric/model`, used by both. |
| 13 | `red-latency` sits in `GRPC_PANELS`, so an empty p99 panel says "no gRPC traffic in range". | Remove it from the set; a quantile panel with no data uses the generic empty wording. |
| 17 | `[null, 5, null]` emits a lone `M` and draws nothing (`shared/ui/line-chart/path.ts`). | A point with no drawn neighbour gets the same tiny flat `L` the single-value case already emits. |
| 18 | `metrics-gateway.spec.ts` sets a CSRF token for a GET and asserts "the gateway's message" against `client.ts`'s fallback text. | Drop the token line; make the 502 body the gateway's JSON shape so the asserted message is really the gateway's. |
| 19 | `use-metrics.ts` prefers data over error; no test covers a panel that had data and then failed a refetch. | One test: data then a failed refetch keeps the value on screen. The behaviour is kept — stale data beats an empty panel — and the test pins it. |

### B3. Content

| # | Defect | Fix |
|---|---|---|
| 9 | Every row's kebab is named "Row actions". | `Row actions for <title>`; the row specs that scope with `within(row)` update their names. |

### Testing (frontend-v2)

Every fix lands with its spec change first (TDD). `yarn lint`,
`yarn test:coverage` with the existing thresholds. Live check of Audit
(counters, empty window, filter change badge) and Metrics (degraded row
label, quantile panel wording) against the compose stack.

## Order of work

1. A1 — lock in `SubmitConversion` (Go).
2. A2 — reconciler sweep + `ForgetTarget` (Go). One `make check` for both.
3. B1 — Audit minors.
4. B2 + B3 — Metrics and Content minors.
5. Final whole-branch review of the four commits.

## Out of scope

- A `ForgetTarget` RPC called from the gateway on delete: three layers and
  two mocks to save five minutes of a Root-only phantom row, and the sweep
  would still be needed for the mesh-down-during-delete case.
- A 409 from `SubmitConversion` while a job is in flight: `POST
  /api/territories` right after an upload would be the first caller to hit it
  when the reconciler tick lands in between.
- The per-row artifact fan-out on the Content screen and the "jobs failure
  is a screen failure" ruling — recorded in the conversion spec, unchanged.
