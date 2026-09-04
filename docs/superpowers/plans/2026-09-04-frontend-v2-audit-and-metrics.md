# frontend-v2 Audit and Metrics — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/console/audit` and `/console/metrics` render the finished `AuditPage` and `MetricsPage` against the live gateway — the company journal with cursor paging, actor/action/entity/date filters, a 24-hour activity strip, refs-aware diffs and CSV export; the owner-only dashboard with per-service health, twenty panels polled every 30 s over a URL-held range, and the firing alerts — inside the console shell. The last two placeholders go.

**Architecture:** Same shape as Parts 2–3. Each screen gets a container hook in `pages/<screen>/model/use-*.ts` (queries, mutations, UI state), pure functions beside it for every decision (filter grammar, day grouping, bucketing, series alignment, service synthesis), and a `*-screen.tsx` mapping the hook onto the page. Gateways live in `entities/<entity>/api/`. Pages and widgets change only where a prop had no honest data behind it (`budget`, `delta`, `onSilence`, `expr`, `ip`/`digest`). One small backend task adds the `services-up` panel the health list needs.

**Tech Stack:** Vite 8, React 19, TypeScript 7, TanStack Router (typed search) + Query 5.102 (`useInfiniteQuery`, `useQueries`), vitest 4, Tailwind 4, oxlint; Go 1.27 for the one gateway change (oapi-codegen, `make openapi-gen`).

**Spec:** `docs/superpowers/specs/2026-09-02-frontend-v2-gateway-wiring-design.md` (step 4 of its Order of work). Contested decisions, every recommendation approved by the user on 2026-09-03: `docs/superpowers/specs/2026-09-03-frontend-v2-parts-3-4-survey.md` (Parts 4a/4b). The rulings below restate them so this plan stands alone.

## Global Constraints

- **yarn, never npm.** All frontend commands run from `frontend-v2/`.
- **`yarn lint` is `tsc -b --noEmit && oxlint`. Keep the `-b`.**
- **`src/architecture.spec.ts` fails the build:** sibling `*.spec.ts(x)` per non-barrel, non-fixture file; a `*.fixture.tsx` per JSX slice; imports inward only (`shared → entities → features → widgets → pages → app`); cross-slice imports on `index.ts`; nothing loose in a layer root. `src/fixtures.spec.tsx` renders every fixture. **No cycles between entity slices** (`entities/audit` ↔ `entities/metric` etc.) — the spec cannot see them but Vite can.
- **Wiring with no decision joins `EXEMPT_MODULES`**; every decision is a pure function with a spec.
- **A page draws no chrome.** `status` is `"loading"` while any enabled query pends (`isLoading` for a query that may be disabled), `"unavailable"` only when a query errored with no data (`shared/lib/unanswered`), `"ready"` only with data; a disabled query is neither.
- **Never a confident wrong value:** unknown renders "—", never 0/"No"; a filter that only sees loaded pages is not offered.
- **A control with no endpoint is not rendered** (optional callback → button drawn only when handed).
- **Dialogs reset by unmounting; every mutation toasts; every busy control gets `busy` from its mutation.**
- **Accessible names unique on screen; state never on colour alone.**
- **No `Authorization` header; `X-CSRF-Token` on mutations only.** 403 → "You don't have permission to do this".
- **Mapper rule:** an array/object field on a DTO is defended (`?? []`, `?? {}`); every exported gateway function gets a URL/method assertion.
- **Links into the old SPA go through `shared/lib/leave.ts` `leaveTo`.**
- **Coverage thresholds** 90/85/90/90 (`yarn test:coverage`).
- **Stage by path** (`git add frontend-v2`, plus the paths a task names); never `.claude/settings.json`. Frontend-only commits `--no-verify` and say so; the Go commit runs the gate: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` on this machine (shell env only), no `--no-verify`. Trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Dev stack: gateway `localhost:8080`, `yarn dev` on 3001; Root `admin` / `change-me-now` (owner — Metrics and the whole company journal); Company Owner `cotest` / `Passw0rd!2026` (`audit:read` for its company; no Metrics); login JSON field `identifier`; CSRF token in `/api/auth/me` as `csrfToken`. Prometheus scrapes every 15 s; `ops/prometheus/rules.yml` defines TargetDown, HighGrpcErrorRate, HighHttp5xxRate, HighLatencyP99.

## Rulings

**Audit**

1. **`live` means "following":** the first page refetches every 30 s while it is the only page loaded, never in a hidden tab; once older pages are loaded the badge goes off and polling stops (refetching N pages every 30 s is not "live", it is a load test).
2. **Activity strip and counters come from a separate 24-hour window query** (`from = now − 24h`, `limit = 200`, no other filter): 24 hourly buckets oldest→newest, `dimFrom` = the current hour; detail "peak N/h at HH:00", or "from 200 loaded events" when the cap was hit. Counters: **Events · 24h** (`"200+"` when capped), **Failed · 24h** (tone bad when > 0), **Actors** (`/api/audit/actors` length, tone accent). No "Today".
3. **`AuditDay.total` is not passed** — nothing counts a day.
4. **Inspector details:** actor, at, company, territory, result. No ip, no digest; `recordId` = the entry id as text. The "Append-only · tamper-evident" eyebrow stays — true of the backend.
5. **Filter grammar:** `entity:<x>`, `action:<x>` (exact, passed through), `actor:<login>` (resolved to an id through the actors list — an unknown login shows an empty journal with the sentence "No actor named <login>" and sends nothing), `from:YYYY-MM-DD`, `to:YYYY-MM-DD` (widened to `T00:00:00Z` / `T23:59:59Z`). Unknown keys and free text are **ignored and not sent** — the gateway has no text search and a client-side match over loaded pages would lie at page two. The placeholder names the five keys. `failed:` is gone.
5a. **The date range also has a picker.** Two `DatePicker`s (`shared/ui/date-picker`, labels "From" and "To") sit in a row beside the filter bar, drawn by the screen (the page stays chrome-free and only receives the chip). A chosen range becomes one chip in `extraFilters` — "1 Sep – 2 Sep", "from 1 Sep", "until 2 Sep" — whose × clears both dates. It feeds the same `from`/`to` as the tokens; when a token and the picker disagree, the token wins (it is the one the reader can see in the query).
6. **Days are grouped client-side by UTC date** over the flattened infinite query (amended during execution: `formatAt` prints the stored UTC instant, so a local heading could contradict its own timestamps; the activity strip says "(UTC)"); labels "Today · 1 September", "Yesterday · 31 August", else "29 August" (plus the year when it is not the current one). `nextCursor` **0 or absent means last page** — normalised to `null` before `getNextPageParam`, or the journal loops forever.
7. **`onLoadOlder` is `fetchNextPage`, absent when `!hasNextPage`; `loadingOlder` is `isFetchingNextPage`.**
8. **Export** is `GET /api/audit.csv` with the same filters and never the cursor, fetched and saved as a blob (`shared/lib/download.ts`), because a plain link gives neither a filename nor a surfaced 403. Toasts on failure; the button is busy while it runs.
9. **`onCopyJson`** writes the entry as pretty JSON to the clipboard and toasts "Copied".
10. **`onOpenEntity`** is a `leaveTo` link to `/territories/{entityLabel}` or `/models/{entityLabel}`, absent for any other entity, for an empty label, or for a `.delete` action.
11. **`eventKind` learns the real vocabulary:** the journal writes `<entity>.insert|update|delete` and `auth.*`; `insert` is a creation. The v2 fixture's `territory.create` / `model.upload` / `user.role_change` are fiction and get rewritten to real actions.
12. **`AuditEntry` gains `companyId`, `companyLogin`, `territorySlug`** (the DTO carries them; the inspector shows two of them). `refs` from every page are merged and threaded into `RecordInspector` as one optional prop so `role_id: 9b75…` reads as its title; `labelFor`/`shortId` are ported.
13. **`summary`** for a timeline event: `auth.*` → the action tail ("login"), `.insert` → "created", `.delete` → "deleted", `.update` → "N fields changed" (from `diffRows`), any `failed` result → "failed".
14. **Screen gate** stays `audit:read`; no fallback to `/api/audit/mine`.

**Metrics**

15. **A `services-up` panel is added to the gateway registry** (`up{job="services"}`, instant) — the only way to say "down". Names come from its `service` label (the scrape config relabels every target).
16. **`ServiceHealth` is synthesised** from four panels: `services-up` (name, up/down — a service scraped as several replicas yields several series with one label; they collapse to one row that is up when any replica is), `red-errors` (degraded when > 0), `red-rate` (samples = the last 18 points, `meta` = "N.N rps · N errors/s"), `red-latency` (matched by `grpc_service` containing the service name case-insensitively, else "—"). A service missing from `services-up` is not listed. `meta` for a down service is "scrape failed".
17. **`Series.values` becomes `(number | null)[]`** in `shared/ui/line-chart`: co-plotted series are aligned on the union of their timestamps and a missing sample is a gap the line breaks at, never a slope. `sharedMax` ignores nulls; a single series with a gap is not filled.
18. **Panel catalogue** (`entities/metric/model/panel-catalog.ts`): title, `meta`, unit per panel id; sections "Services (RED)" (`red-rate`, `red-errors`, `red-latency`, `red-http` as "HTTP requests"), "Domain" (`domain-conversions`, `domain-conversion-p95`, `domain-queue`, `domain-upload`, `domain-auth`, `domain-twofa`), "Go runtime" (`runtime-memory`, `runtime-goroutines`, `runtime-gc`, `runtime-fds`). No "Active sessions". `last` = the latest value of the first series formatted by unit; `lastTone` bad for errors when > 0.
19. **Stats** are the five instant panels: Up ("N", hint "of M services"), Requests (rps), Errors (%), p99 (ms), Queue (count). **No `delta`.** Hints describe the unit, never an SLO.
20. **`budget` is not rendered** (`MetricsPageProps.budget?` optional; the meter draws only when handed).
21. **Alerts** come from the `alerts` panel: one `AlertSummary` per series — `name` = `alertname`, `meta` = "<service> · severity: <severity>", `state` = `alertstate`. `firingCount` counts firing ones. The inspector opens for the first firing alert (or on click) with details limited to what exists: alert, service, severity, state, `since` unknown → not listed; `firingFor`, `series`, `threshold`, `contributors`, `expr`/`for` are **not rendered** (`FiringAlert.firingFor?`, `series?`, `contributors?` become optional; the inspector degrades). `onSilence`, `onOpenInAudit`, `onCopyPromQl` are optional on both page and inspector and never passed.
22. **Filter bar is client-side over what is on screen:** `service:<text>` narrows the health list by name, `state:up|degraded|down` by state, `group:<key>` narrows sections, free text narrows panel titles. Unknown keys match nothing.
23. **Range lives in the URL** (`?range=1h`, default `1h`, validated against `METRIC_RANGES`) and is part of every panel's query key.
24. **One query per panel**, key `["metrics", panel, range]`, `refetchInterval` 30 s, `refetchIntervalInBackground: false`. A panel whose query failed with no data renders `last: "—"`, `lastTone: "bad"`, `meta: "unavailable — <gateway message>"` and no series — a 502 kills one card. The screen is "unavailable" only when **every** panel query failed with no data (Prometheus down).
25. **Screen gate** stays `isOwner` (Root).

---

### Task 1: gateway — the `services-up` panel

**Files:**
- Modify: `backend/services/gateway-service/internal/metrics/registry.go`, its test if one exists (`registry_test.go` — check), `backend/services/gateway-service/api/openapi.yaml` (the `panel` enum); regenerate `internal/transport/httpapi/openapi_spec_gen.go`
- Regenerate: `frontend/src/shared/infrastructure/api/dto.ts`, `frontend-v2/src/shared/api/dto.ts`

**Interfaces:**
- Produces: panel id `services-up` → one instant series per scraped service, `label` = the `service` label, `v` 1 or 0.

- [ ] **Step 1: The registry entry — test first if the package has tests**

`ls backend/services/gateway-service/internal/metrics/*_test.go`. If a test enumerates panel ids against the OpenAPI enum (the desktop's "every path is addressed" shape), extend it; otherwise add to the existing test file (or create `registry_test.go` in-package) :

```go
func (s *RegistrySuite) TestServicesUpIsAnInstantPerServiceQuery() {
	p, ok := lookup("services-up")
	assert.Assert(s.T(), ok)
	assert.Assert(s.T(), p.instant)
	assert.Equal(s.T(), p.expr, `up{job="services"}`)
}
```

(Mirror the file's suite name and imports — testify `suite` + gotest.tools `assert`, as everywhere in the gateway.) Run: `cd backend/services/gateway-service && go test ./internal/metrics/ -run Registry` — expected FAIL.

- [ ] **Step 2: Add the panel**

In `registry.go` under `// Stat tiles`:

```go
	// One row per scraped service, 1 or 0 — the only reading that can say
	// "down". Named by the `service` label the scrape config relabels onto
	// every target (ops/prometheus/prometheus.yml).
	"services-up": {expr: `up{job="services"}`, instant: true},
```

In `openapi.yaml`, add `services-up` after `stat-queue` in the `panel` enum of `/api/metrics/query`. Run `make -C backend openapi-gen`, then `cd frontend && yarn openapi:generate && yarn lint` and `cd frontend-v2 && yarn openapi:generate && yarn lint` (both green; the change is one enum member).

Run the test — expected PASS.

- [ ] **Step 3: Gate, live, commit**

`CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` — green. `docker compose up -d --build gateway`; as `admin`: `GET http://localhost:8080/api/metrics/query?panel=services-up&range=15m` → 200 with one series per service (`label` = `gateway`, `catalog`, …, `points[0].v` 1). Record the labels you saw. Commit (hook runs the gate):

```bash
git add backend/services/gateway-service frontend/src/shared/infrastructure/api/dto.ts frontend-v2/src/shared/api/dto.ts
git diff --cached --name-only
git commit -m "feat(gateway): a services-up metrics panel, one row per scraped service

up{job=\"services\"} as an instant query, labelled by the service label the
scrape config relabels onto every target. It is the only reading that can
say a service is down; the RED panels only ever show who is answering.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: audit entities — the journal gateway, refs, the real vocabulary

**Files:**
- Modify: `frontend-v2/src/entities/audit/model/audit-entry.ts` (+ spec), `event-kind.ts` (+ spec); every `AuditEntry` literal `yarn lint` then flags (fixtures/specs under `entities/audit`, `widgets/event-timeline`, `widgets/record-inspector`, `pages/audit`) — add the three fields, and rewrite the page fixture's fictional actions to real ones (`territory.update`, `placement.insert`, `auth.login`, `model.delete`, `model.insert` (failed), `user_role.update`, `territory.insert`)
- Create: `frontend-v2/src/entities/audit/model/refs.ts`, `refs.spec.ts`
- Create: `frontend-v2/src/entities/audit/api/to-audit-entry.ts`, `to-audit-entry.spec.ts`, `audit-gateway.ts`, `audit-gateway.spec.ts`, `audit-queries.ts`, `audit-queries.spec.ts`
- Create: `frontend-v2/src/shared/lib/download.ts`, `download.spec.ts`
- Modify: `frontend-v2/src/widgets/record-inspector/model/inspector-value.ts` (+ spec), `frontend-v2/src/widgets/record-inspector/ui/record-inspector.tsx` (+ spec), `frontend-v2/src/entities/audit/index.ts`

**Interfaces:**
- Consumes: `httpGet` (`@/shared/api`), `HttpError`, `components["schemas"]["AuditEntry" | "AuditPage" | "AuditActor"]`.
- Produces: `AuditEntry` + `companyId`, `companyLogin`, `territorySlug`; `Refs = Record<string, string>`, `labelFor(refs, field, value): string | null`, `shortId(value)`; `eventKind("x.insert") === "create"`; `AuditFilters = { actor?; action?; entity?; from?; to? }`; `toBound(date, "from" | "to")`; `AuditPageResult = { entries: AuditEntry[]; nextCursor: number | null; refs: Refs }`; `listAudit(filters, cursor, limit?)`; `listAuditActors(): Promise<AuditActor[]>` (`{ id; login }`); `exportAuditCsv(filters): Promise<Blob>`; `auditQuery(filters)` (infinite, key `["audit", filters]`, 30 s poll while one page, no background), `auditActorsQuery` (`["audit", "actors"]`), `auditWindowQuery(from)` (`["audit", "window", from]`); `saveBlob(blob, filename)`; `RecordInspectorProps.refs?`; `inspectorValue(field, refs?)`.

- [ ] **Step 1: The model grows and the vocabulary is corrected — specs first**

`entities/audit/model/event-kind.spec.ts` — replace the creation case with:

```ts
  it("reads the journal's own verbs: insert creates, delete deletes, update and everything else update", () => {
    expect(eventKind("territory.insert")).toBe("create");
    expect(eventKind("model.delete")).toBe("delete");
    expect(eventKind("placement.update")).toBe("update");
    expect(eventKind("auth.login")).toBe("auth");
    expect(eventKind("something.odd")).toBe("update");
  });
```

`entities/audit/model/refs.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { labelFor, shortId } from "./refs";

describe("refs", () => {
  it("names an id the page could name, and nothing else", () => {
    const refs = { "role_id:9b75ebfc-1": "Editor" };
    expect(labelFor(refs, "role_id", "9b75ebfc-1")).toBe("Editor");
    expect(labelFor(refs, "role_id", "unknown")).toBeNull();
    expect(labelFor(refs, "role_id", { nested: true })).toBeNull();
  });

  it("shortens long ids and leaves short ones alone", () => {
    expect(shortId("9b75ebfc-1234-5678-9abc-def012345678")).toBe("9b75ebfc");
    expect(shortId(42)).toBe("42");
  });
});
```

Run both — expected FAIL.

- [ ] **Step 2: Implement the model**

`event-kind.ts`: change the verb branch to

```ts
  const verb = action.split(".").pop();
  if (verb === "insert") return "create";
  if (verb === "delete") return "delete";
  return "update";
```

and its doc to say the journal writes `insert|update|delete`. `audit-entry.ts`: add to `AuditEntry`:

```ts
  /** Empty for a Root or system change. */
  companyId: string;
  /** The owning user's login behind companyId; empty under the same conditions as actorLogin. */
  companyLogin: string;
  /** The parent territory's slug for placements, panoramas, documents and assignments; empty otherwise. */
  territorySlug: string;
```

`refs.ts`:

```ts
/** "<field>:<value>" → human name, as GET /api/audit's `refs` sends them. */
export type Refs = Record<string, string>;

export function labelFor(refs: Refs, field: string, value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return refs[`${field}:${String(value)}`] ?? null;
}

/** The first eight characters of a long id — enough to tell two apart. */
export const shortId = (value: string | number): string => {
  const s = String(value);
  return s.length > 12 ? s.slice(0, 8) : s;
};
```

Export both from `entities/audit/index.ts`. Run `yarn lint`; add the three fields (all `""`) to every flagged `AuditEntry` literal; in `pages/audit/audit-page.fixture.tsx` also replace the actions per the ruling. Run `yarn vitest run src/entities/audit src/widgets/event-timeline src/widgets/record-inspector src/pages/audit` — expected PASS (fix any spec that asserted the old `create` verb).

- [ ] **Step 3: Mapper and gateway — specs first**

`entities/audit/api/to-audit-entry.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toAuditEntry } from "./to-audit-entry";

describe("toAuditEntry", () => {
  it("parses the row snapshots and defaults every optional string to empty", () => {
    expect(
      toAuditEntry({
        id: 7, at: "2026-09-01T09:14:00Z", action: "territory.update", entity: "territory", result: "ok",
        actorId: "u-1", actorLogin: "a.ivanova", companyId: "c-1", companyLogin: "cotest",
        entityId: "t-1", entityLabel: "refinery-block-c", territorySlug: "",
        oldRow: '{"title":"Old"}', newRow: '{"title":"New"}',
      }),
    ).toEqual({
      id: 7, at: "2026-09-01T09:14:00Z", action: "territory.update", entity: "territory", result: "ok",
      actorId: "u-1", actorLogin: "a.ivanova", companyId: "c-1", companyLogin: "cotest",
      entityId: "t-1", entityLabel: "refinery-block-c", territorySlug: "",
      oldRow: { title: "Old" }, newRow: { title: "New" },
    });
    const bare = toAuditEntry({ id: 8, at: "2026-09-01T00:00:00Z", action: "auth.login", entity: "session", result: "failed" });
    expect(bare).toMatchObject({ actorId: "", actorLogin: "", companyId: "", companyLogin: "", entityId: "", entityLabel: "", territorySlug: "", oldRow: null, newRow: null });
  });

  it("treats an empty or malformed snapshot as no snapshot", () => {
    expect(toAuditEntry({ id: 1, at: "x", action: "a.insert", entity: "a", result: "ok", oldRow: "", newRow: "{not json" }).newRow).toBeNull();
  });
});
```

`entities/audit/api/audit-gateway.spec.ts` (mirror the fetch-factory pattern of `entities/territory/api/territories-gateway.spec.ts`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { exportAuditCsv, listAudit, listAuditActors, toBound } from "./audit-gateway";

const entry = { id: 7, at: "2026-09-01T09:14:00Z", action: "territory.update", entity: "territory", result: "ok" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json({ entries: [entry], nextCursor: 6, refs: { "role_id:1": "Editor" } })));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const url = (n = 0) => fetchMock.mock.calls[n][0] as string;

describe("audit gateway", () => {
  it("builds the query from the filters and the cursor, and maps the page", async () => {
    const page = await listAudit({ actor: "u-1", entity: "territory", from: "2026-09-01T00:00:00Z" }, 40);
    expect(url()).toBe("/api/audit?actor=u-1&entity=territory&from=2026-09-01T00%3A00%3A00Z&cursor=40&limit=50");
    expect(page.entries[0].id).toBe(7);
    expect(page.nextCursor).toBe(6);
    expect(page.refs).toEqual({ "role_id:1": "Editor" });
  });

  it("sends only what is set, honours a limit, and reads 0 or absent nextCursor as the last page", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [] }));
    const page = await listAudit({}, null, 200);
    expect(url()).toBe("/api/audit?limit=200");
    expect(page).toEqual({ entries: [], nextCursor: null, refs: {} });
    fetchMock.mockResolvedValueOnce(json({ entries: [], nextCursor: 0 }));
    expect((await listAudit({}, null)).nextCursor).toBeNull();
  });

  it("widens a date to the edges of its day", () => {
    expect(toBound("2026-09-01", "from")).toBe("2026-09-01T00:00:00Z");
    expect(toBound("2026-09-01", "to")).toBe("2026-09-01T23:59:59Z");
  });

  it("lists actors with an empty login for a deleted account", async () => {
    fetchMock.mockResolvedValueOnce(json([{ id: "u-1", login: "a.ivanova" }, { id: "u-2" }]));
    await expect(listAuditActors()).resolves.toEqual([{ id: "u-1", login: "a.ivanova" }, { id: "u-2", login: "" }]);
    expect(url()).toBe("/api/audit/actors");
  });

  it("exports the same filters as CSV, never the cursor, and refuses with the status", async () => {
    fetchMock.mockResolvedValueOnce(new Response("at,actor\n", { status: 200, headers: { "Content-Type": "text/csv" } }));
    const blob = await exportAuditCsv({ entity: "model" });
    expect(url()).toBe("/api/audit.csv?entity=model");
    expect(await blob.text()).toBe("at,actor\n");
    fetchMock.mockResolvedValueOnce(json({ code: "forbidden", message: "You don't have permission to do this" }, 403));
    await expect(exportAuditCsv({})).rejects.toMatchObject({ status: 403 });
  });
});
```

`entities/audit/api/audit-queries.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("./audit-gateway", () => ({
  listAudit: vi.fn(async () => ({ entries: [], nextCursor: null, refs: {} })),
  listAuditActors: vi.fn(async () => []),
}));
const { auditActorsQuery, auditQuery, auditWindowQuery, followInterval } = await import("./audit-queries");

describe("audit queries", () => {
  it("keys the journal by its filters, pages by nextCursor, and follows only the first page", () => {
    const q = auditQuery({ entity: "territory" });
    expect(q.queryKey).toEqual(["audit", { entity: "territory" }]);
    expect(q.getNextPageParam({ entries: [], nextCursor: 12, refs: {} }, [], null, [])).toBe(12);
    expect(q.getNextPageParam({ entries: [], nextCursor: null, refs: {} }, [], null, [])).toBeNull();
    expect(q.refetchIntervalInBackground).toBe(false);
    expect(followInterval(1)).toBe(30000);
    expect(followInterval(2)).toBe(false);
    expect(followInterval(0)).toBe(30000);
  });

  it("keys the actors and the 24h window", () => {
    expect(auditActorsQuery.queryKey).toEqual(["audit", "actors"]);
    expect(auditWindowQuery("2026-09-01T00:00:00Z").queryKey).toEqual(["audit", "window", "2026-09-01T00:00:00Z"]);
  });
});
```

`shared/lib/download.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveBlob } from "./download";

describe("saveBlob", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hands the blob to the browser as a named download and releases the URL", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    saveBlob(new Blob(["a"]), "audit.csv");
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });
});
```

Run all four — expected FAIL.

- [ ] **Step 4: Implement mapper, gateway, queries, download**

`entities/audit/api/to-audit-entry.ts`:

```ts
import type { components } from "@/shared/api/dto";
import type { AuditEntry } from "../model/audit-entry";

type AuditEntryDto = components["schemas"]["AuditEntry"];

/** A snapshot is JSON text or empty; anything unparseable reads as none. */
function parseRow(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const toAuditEntry = (d: AuditEntryDto): AuditEntry => ({
  id: d.id,
  at: d.at,
  actorId: d.actorId ?? "",
  actorLogin: d.actorLogin ?? "",
  companyId: d.companyId ?? "",
  companyLogin: d.companyLogin ?? "",
  action: d.action,
  entity: d.entity,
  entityId: d.entityId ?? "",
  entityLabel: d.entityLabel ?? "",
  territorySlug: d.territorySlug ?? "",
  oldRow: parseRow(d.oldRow),
  newRow: parseRow(d.newRow),
  result: d.result,
});
```

`entities/audit/api/audit-gateway.ts`:

```ts
import { HttpError, httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { AuditEntry } from "../model/audit-entry";
import type { Refs } from "../model/refs";
import { toAuditEntry } from "./to-audit-entry";

type AuditPageDto = components["schemas"]["AuditPage"];
type AuditActorDto = components["schemas"]["AuditActor"];

/** What the gateway filters on. `actor` is a user id, never a login. */
export type AuditFilters = { actor?: string; action?: string; entity?: string; from?: string; to?: string };
export type AuditActor = { id: string; login: string };
export type AuditPageResult = { entries: AuditEntry[]; nextCursor: number | null; refs: Refs };

const DEFAULT_LIMIT = 50;

/** Widens a calendar date to the edge of its day, in UTC, as the gateway compares instants. */
export const toBound = (date: string, edge: "from" | "to"): string =>
  `${date}T${edge === "from" ? "00:00:00" : "23:59:59"}Z`;

function toQuery(filters: AuditFilters, cursor: number | null, limit: number | null): string {
  const q = new URLSearchParams();
  for (const key of ["actor", "action", "entity", "from", "to"] as const) {
    const v = filters[key];
    if (v) q.set(key, v);
  }
  if (cursor !== null) q.set("cursor", String(cursor));
  if (limit !== null) q.set("limit", String(limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** One page of the company journal. A nextCursor of 0 or absent is the last page. */
export async function listAudit(filters: AuditFilters, cursor: number | null, limit = DEFAULT_LIMIT): Promise<AuditPageResult> {
  const page = await httpGet<AuditPageDto>(`/api/audit${toQuery(filters, cursor, limit)}`);
  return {
    entries: (page.entries ?? []).map(toAuditEntry),
    nextCursor: page.nextCursor && page.nextCursor > 0 ? page.nextCursor : null,
    refs: page.refs ?? {},
  };
}

export const listAuditActors = async (): Promise<AuditActor[]> =>
  ((await httpGet<AuditActorDto[] | null>("/api/audit/actors")) ?? []).map((a) => ({ id: a.id, login: a.login ?? "" }));

/**
 * The same journal as CSV. A raw fetch: the client helper parses JSON, and a
 * plain <a download> would surface neither a filename nor a 403. Same
 * origin, so the session cookie rides along; no header is set.
 */
export async function exportAuditCsv(filters: AuditFilters): Promise<Blob> {
  const res = await fetch(`/api/audit.csv${toQuery(filters, null, null)}`);
  if (!res.ok) throw new HttpError(res.status, null, `Export failed (${res.status})`);
  return res.blob();
}
```

(Check `HttpError`'s constructor in `shared/api/http-error.ts` — `(status, body, message)` per Part 1; adapt the argument order if it differs. If a 403 body carries the gateway's own sentence, prefer it: read `res.json()` in a try and pass its `message`.)

`entities/audit/api/audit-queries.ts`:

```ts
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { listAudit, listAuditActors, type AuditFilters } from "./audit-gateway";

const FOLLOW_MS = 30_000;
const WINDOW_LIMIT = 200;

/** Follow only while the first page is the only one: refetching N pages every 30 s is not "live". */
export const followInterval = (pages: number): number | false => (pages <= 1 ? FOLLOW_MS : false);

export const auditQuery = (filters: AuditFilters) =>
  infiniteQueryOptions({
    queryKey: ["audit", filters],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => listAudit(filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: (query) => followInterval(query.state.data?.pages.length ?? 0),
    refetchIntervalInBackground: false,
    // A new filter key starts with no data; without this the screen's loading
    // guard would unmount the filter bar on every keystroke.
    placeholderData: keepPreviousData,
  });

export const auditActorsQuery = queryOptions({ queryKey: ["audit", "actors"], queryFn: listAuditActors });

/** The last 24 hours, unfiltered, capped — feeds the activity strip and the counters. */
export const auditWindowQuery = (from: string) =>
  queryOptions({ queryKey: ["audit", "window", from], queryFn: () => listAudit({ from }, null, WINDOW_LIMIT) });
```

`shared/lib/download.ts`:

```ts
/** Saves a blob through a synthetic download link and releases the object URL. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

Add to `entities/audit/index.ts`:

```ts
export { exportAuditCsv, listAudit, listAuditActors, toBound, type AuditActor, type AuditFilters, type AuditPageResult } from "./api/audit-gateway";
export { auditActorsQuery, auditQuery, auditWindowQuery, followInterval } from "./api/audit-queries";
```

Run: `yarn vitest run src/entities/audit src/shared/lib/download.spec.ts` — expected PASS.

- [ ] **Step 5: Refs in the inspector — spec first**

`widgets/record-inspector/model/inspector-value.spec.ts`, add:

```ts
  it("names an id the refs know on either side of the arrow", () => {
    const refs = { "role_id:1": "Editor", "role_id:2": "Viewer" };
    expect(inspectorValue({ field: "role_id", before: "1", after: "2", kind: "changed" }, refs)).toBe("Editor → Viewer");
    expect(inspectorValue({ field: "role_id", before: undefined, after: "9", kind: "added" }, refs)).toBe('+ "9"');
  });
```

`widgets/record-inspector/ui/record-inspector.spec.tsx`, add a case rendering an entry whose `newRow` is `{ role_id: "1" }` with `refs={{ "role_id:1": "Editor" }}` and asserting the text "Editor" is on screen. Run — expected FAIL.

- [ ] **Step 6: Implement**

`inspector-value.ts`:

```ts
import { formatValue, labelFor, type DiffField, type Refs } from "@/entities/audit";

const name = (refs: Refs | undefined, field: string, value: unknown) =>
  (refs && labelFor(refs, field, value)) ?? formatValue(value);

export function inspectorValue(field: DiffField, refs?: Refs): string {
  if (field.kind === "added") return `+ ${name(refs, field.field, field.after)}`;
  if (field.kind === "removed") return `− ${name(refs, field.field, field.before)}`;
  return `${name(refs, field.field, field.before)} → ${name(refs, field.field, field.after)}`;
}
```

`record-inspector.tsx`: `refs?: Refs` on the props (doc: "Names for the ids inside the snapshots, merged from every loaded page."), threaded to `inspectorValue(field, refs)`. Run: `yarn vitest run src/widgets/record-inspector` — expected PASS.

- [ ] **Step 7: Lint, suite, commit**

`yarn lint && yarn test`. Commit (`--no-verify`, `frontend-v2` only):

```
feat(frontend-v2): the audit gateway, refs, and the journal's real verbs

listAudit pages by nextCursor and reads 0 or absent as the last page;
listAuditActors, exportAuditCsv as a blob with a surfaced status. AuditEntry
gains the company and territory the DTO already carried; refs name the ids
inside a diff. eventKind now knows the journal writes insert/update/delete
— every creation used to render as an update.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 3: The Audit screen

**Files:**
- Create: `frontend-v2/src/pages/audit/model/journal.ts`, `journal.spec.ts`, `use-audit.ts`, `use-audit.spec.tsx`
- Create: `frontend-v2/src/pages/audit/ui/audit-screen.tsx`, `audit-screen.spec.tsx`
- Modify: `frontend-v2/src/pages/audit/ui/audit-page.tsx` (placeholder text only), `frontend-v2/src/pages/audit/index.ts`, `frontend-v2/src/app/router/routes.tsx`

**Interfaces:**
- Consumes: Task 2's gateway/queries/refs; `diffRows`, `eventKind`, `actorName`, `formatAt`; `notify`, `messageOf`, `unanswered`, `leaveTo`, `saveBlob`.
- Produces: `parseAuditFilters(query, actors, range?): { filters: AuditFilters; unknownActor: string | null }` (`range = { from: IsoDate | ""; to: IsoDate | "" }`, tokens win); `rangeChip(range): string | null`; `groupByDay(entries, now)`; `summaryOf(entry)`; `activityOf(entries, now)`; `countersOf(entries, capped, actorCount)`; `inspectorDetails(entry)`; `entityHref(entry)`; `windowStart(now)`; `useAudit(): AuditState`; `AuditScreen` on `/console/audit`.

- [ ] **Step 1: Pure journal functions — spec first**

`pages/audit/model/journal.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AuditEntry } from "@/entities/audit";
import {
  activityOf, countersOf, entityHref, groupByDay, inspectorDetails, parseAuditFilters, rangeChip, summaryOf, windowStart,
} from "./journal";

const NOW = new Date("2026-09-01T10:30:00Z");
const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1, at: "2026-09-01T09:14:00Z", actorId: "u-1", actorLogin: "a.ivanova", companyId: "c-1", companyLogin: "cotest",
  action: "territory.update", entity: "territory", entityId: "t-1", entityLabel: "refinery", territorySlug: "",
  oldRow: { title: "Old", x: 1 }, newRow: { title: "New", x: 2 }, result: "ok", ...over,
});
const ACTORS = [{ id: "u-1", login: "a.ivanova" }, { id: "u-2", login: "" }];

describe("parseAuditFilters", () => {
  it("passes entity and action through, resolves an actor login, widens dates, ignores the rest", () => {
    expect(parseAuditFilters("entity:territory action:territory.update actor:a.ivanova from:2026-09-01 to:2026-09-02 colour:blue free text", ACTORS)).toEqual({
      filters: { entity: "territory", action: "territory.update", actor: "u-1", from: "2026-09-01T00:00:00Z", to: "2026-09-02T23:59:59Z" },
      unknownActor: null,
    });
    expect(parseAuditFilters("", ACTORS)).toEqual({ filters: {}, unknownActor: null });
  });

  it("names an actor nobody has, and sends nothing for them", () => {
    expect(parseAuditFilters("actor:ghost", ACTORS)).toEqual({ filters: {}, unknownActor: "ghost" });
  });

  it("takes the picked range when no token names a bound, and lets a token win", () => {
    expect(parseAuditFilters("", ACTORS, { from: "2026-09-01", to: "" }).filters).toEqual({ from: "2026-09-01T00:00:00Z" });
    expect(parseAuditFilters("to:2026-09-03", ACTORS, { from: "2026-09-01", to: "2026-09-02" }).filters).toEqual({
      from: "2026-09-01T00:00:00Z", to: "2026-09-03T23:59:59Z",
    });
  });
});

describe("rangeChip", () => {
  it("words the picked range, or nothing when nothing is picked", () => {
    expect(rangeChip({ from: "2026-09-01", to: "2026-09-02" })).toBe("1 Sep – 2 Sep");
    expect(rangeChip({ from: "2026-09-01", to: "" })).toBe("from 1 Sep");
    expect(rangeChip({ from: "", to: "2026-09-02" })).toBe("until 2 Sep");
    expect(rangeChip({ from: "", to: "" })).toBeNull();
  });
});

describe("groupByDay", () => {
  it("labels today, yesterday and older days, newest first, in local dates", () => {
    const days = groupByDay(
      [entry({ id: 3, at: "2026-09-01T09:14:00Z" }), entry({ id: 2, at: "2026-08-31T22:00:00Z" }), entry({ id: 1, at: "2025-12-24T10:00:00Z" })],
      NOW,
    );
    expect(days.map((d) => [d.key, d.label, d.events.map((e) => e.entry.id)])).toEqual([
      ["2026-09-01", "Today · 1 September", [3]],
      ["2026-08-31", "Yesterday · 31 August", [2]],
      ["2025-12-24", "24 December 2025", [1]],
    ]);
    expect(days[0].total).toBeUndefined();
  });
});

describe("summaryOf", () => {
  it("says what moved in one line", () => {
    expect(summaryOf(entry())).toBe("2 fields changed");
    expect(summaryOf(entry({ newRow: { title: "New", x: 1 } }))).toBe("1 field changed");
    expect(summaryOf(entry({ action: "placement.insert" }))).toBe("created");
    expect(summaryOf(entry({ action: "model.delete" }))).toBe("deleted");
    expect(summaryOf(entry({ action: "auth.login", entity: "session" }))).toBe("login");
    expect(summaryOf(entry({ result: "failed" }))).toBe("failed");
  });
});

describe("activityOf and countersOf", () => {
  it("buckets the last 24 hours oldest first and dims the running hour", () => {
    const a = activityOf([entry({ at: "2026-09-01T10:05:00Z" }), entry({ at: "2026-09-01T10:20:00Z" }), entry({ at: "2026-08-31T11:30:00Z" })], NOW, false);
    expect(a.values).toHaveLength(24);
    expect(a.values[23]).toBe(2);
    expect(a.values[0]).toBe(1);
    expect(a.dimFrom).toBe(23);
    expect(a.label).toBe("Events · last 24h");
    expect(a.detail).toBe("peak 2/h at 10:00");
    expect(activityOf([], NOW, true).detail).toBe("from 200 loaded events");
  });

  it("counts events and failures in the window and the actors the journal knows", () => {
    expect(countersOf([entry(), entry({ result: "failed" })], false, 9)).toEqual([
      { label: "Events · 24h", value: "2" },
      { label: "Failed · 24h", value: "1", tone: "bad" },
      { label: "Actors", value: "9", tone: "accent" },
    ]);
    expect(countersOf([], true, 0)[0].value).toBe("200+");
    expect(countersOf([], false, 0)[1]).toEqual({ label: "Failed · 24h", value: "0" });
  });
});

describe("inspectorDetails and entityHref", () => {
  it("lists actor, at, company, territory and result, dashes when unknown", () => {
    expect(inspectorDetails(entry({ territorySlug: "yard", result: "failed" }))).toEqual([
      { label: "Actor", value: "a.ivanova" },
      { label: "At", value: "2026-09-01 09:14" },
      { label: "Company", value: "cotest" },
      { label: "Territory", value: "yard" },
      { label: "Result", value: "failed", tone: "bad" },
    ]);
    expect(inspectorDetails(entry({ actorId: "", actorLogin: "", companyId: "", companyLogin: "" }))).toMatchObject([
      { value: "system" }, {}, { value: "—", tone: "dim" }, { value: "—", tone: "dim" }, { value: "ok", tone: "ok" },
    ]);
  });

  it("links a territory or model that still exists, and nothing else", () => {
    expect(entityHref(entry())).toBe("/territories/refinery");
    expect(entityHref(entry({ entity: "model", entityLabel: "pump" }))).toBe("/models/pump");
    expect(entityHref(entry({ action: "territory.delete" }))).toBeNull();
    expect(entityHref(entry({ entity: "placement" }))).toBeNull();
    expect(entityHref(entry({ entityLabel: "" }))).toBeNull();
  });
});

describe("windowStart", () => {
  it("is 24 hours before now, as an instant", () => {
    expect(windowStart(NOW)).toBe("2026-08-31T10:30:00.000Z");
  });
});
```

Run — expected FAIL.

- [ ] **Step 2: Implement `journal.ts`**

```ts
import {
  actorName, diffRows, formatAt, toBound,
  type AuditActor, type AuditEntry, type AuditFilters,
} from "@/entities/audit";
import { parseFilters } from "@/features/audit-filter";
import type { Detail } from "@/shared/ui/detail-list";
import type { AuditCounter, AuditDay, AuditPageProps } from "../ui/audit-page";

const DAY_MS = 86_400_000;
const WINDOW_LIMIT = 200;

export type DateRange = { from: string; to: string };

/**
 * The five keys the gateway filters on; free text and unknown keys are not
 * sent. The picked range fills a bound no token names — a token wins because
 * it is the one the reader can see in the query.
 */
export function parseAuditFilters(
  query: string,
  actors: AuditActor[],
  range: DateRange = { from: "", to: "" },
): { filters: AuditFilters; unknownActor: string | null } {
  const filters: AuditFilters = {};
  if (range.from) filters.from = toBound(range.from, "from");
  if (range.to) filters.to = toBound(range.to, "to");
  let unknownActor: string | null = null;
  for (const { key, value } of parseFilters(query)) {
    if (key === "entity") filters.entity = value;
    else if (key === "action") filters.action = value;
    else if (key === "from") filters.from = toBound(value, "from");
    else if (key === "to") filters.to = toBound(value, "to");
    else if (key === "actor") {
      const actor = actors.find((a) => a.login === value);
      if (actor) filters.actor = actor.id;
      else unknownActor = value;
    }
  }
  return { filters: unknownActor ? {} : filters, unknownActor };
}

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The chip for a picked range; null when nothing is picked. */
export function rangeChip(range: DateRange): string | null {
  if (range.from && range.to) return `${shortDay(range.from)} – ${shortDay(range.to)}`;
  if (range.from) return `from ${shortDay(range.from)}`;
  if (range.to) return `until ${shortDay(range.to)}`;
  return null;
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function dayLabel(d: Date, now: Date): string {
  const long = d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const withYear = d.getFullYear() === now.getFullYear() ? long : `${long} ${d.getFullYear()}`;
  const key = dayKey(d);
  if (key === dayKey(now)) return `Today · ${long}`;
  if (key === dayKey(new Date(now.getTime() - DAY_MS))) return `Yesterday · ${long}`;
  return withYear;
}

/** Newest day first, entries in the order the journal sent them (descending id). */
export function groupByDay(entries: AuditEntry[], now = new Date()): AuditDay[] {
  const days = new Map<string, AuditDay>();
  for (const entry of entries) {
    const d = new Date(entry.at);
    const key = dayKey(d);
    const day = days.get(key) ?? { key, label: dayLabel(d, now), events: [] };
    day.events.push({ entry, summary: summaryOf(entry) });
    days.set(key, day);
  }
  return [...days.values()];
}

export function summaryOf(entry: AuditEntry): string {
  if (entry.result === "failed") return "failed";
  if (entry.action.startsWith("auth.")) return entry.action.slice("auth.".length);
  const verb = entry.action.split(".").pop();
  if (verb === "insert") return "created";
  if (verb === "delete") return "deleted";
  const n = diffRows(entry.oldRow, entry.newRow).length;
  return `${n} ${n === 1 ? "field" : "fields"} changed`;
}

export const windowStart = (now = new Date()): string => new Date(now.getTime() - DAY_MS).toISOString();

const hourOf = (now: Date, i: number) => new Date(now.getTime() - (23 - i) * 3_600_000);

/** 24 buckets, oldest first; the last is the hour still running. */
export function activityOf(entries: AuditEntry[], now: Date, capped: boolean): AuditPageProps["activity"] {
  const values = Array.from({ length: 24 }, () => 0);
  const startOf = (d: Date) => Math.floor(d.getTime() / 3_600_000);
  const firstHour = startOf(hourOf(now, 0));
  for (const e of entries) {
    const i = startOf(new Date(e.at)) - firstHour;
    if (i >= 0 && i < 24) values[i] += 1;
  }
  const peak = Math.max(...values);
  const at = hourOf(now, values.indexOf(peak));
  const detail = capped
    ? `from ${WINDOW_LIMIT} loaded events`
    : `peak ${peak}/h at ${String(at.getHours()).padStart(2, "0")}:00`;
  return { values, label: "Events · last 24h", detail, dimFrom: 23 };
}

export function countersOf(entries: AuditEntry[], capped: boolean, actorCount: number): AuditCounter[] {
  const failed = entries.filter((e) => e.result === "failed").length;
  return [
    { label: "Events · 24h", value: capped ? `${WINDOW_LIMIT}+` : String(entries.length) },
    { label: "Failed · 24h", value: String(failed), ...(failed > 0 ? { tone: "bad" as const } : {}) },
    { label: "Actors", value: String(actorCount), tone: "accent" },
  ];
}

const dash = (label: string, value: string): Detail => (value ? { label, value } : { label, value: "—", tone: "dim" });

export function inspectorDetails(entry: AuditEntry): Detail[] {
  return [
    { label: "Actor", value: actorName(entry) },
    { label: "At", value: formatAt(entry.at) },
    dash("Company", entry.companyLogin || entry.companyId),
    dash("Territory", entry.territorySlug),
    { label: "Result", value: entry.result, tone: entry.result === "failed" ? "bad" : "ok" },
  ];
}

/** The old SPA's viewer for a territory or model that still exists. */
export function entityHref(entry: AuditEntry): string | null {
  if (!entry.entityLabel || entry.action.endsWith(".delete")) return null;
  if (entry.entity === "territory") return `/territories/${encodeURIComponent(entry.entityLabel)}`;
  if (entry.entity === "model") return `/models/${encodeURIComponent(entry.entityLabel)}`;
  return null;
}
```

`activityOf`'s "peak … at HH:00" uses the local hour; the spec's `NOW` is UTC 10:30 — if the test machine's zone shifts the printed hour, format with `getUTCHours()` and label the strip "Events · last 24h (UTC)" instead; pick one, say which, and keep the spec consistent. Run the spec — expected PASS.

- [ ] **Step 3: The container — spec first**

`pages/audit/model/use-audit.spec.tsx` — same harness as `pages/content/model/use-content.spec.tsx` (real `QueryClient`, `fetch` stub by URL, `PRINCIPAL` with `audit:read`). Stub: `/api/audit/actors` → `[{id:"u-1",login:"a.ivanova"}]`; `/api/audit?…limit=200` (the window) → `{entries:[E1], nextCursor: 0}`; `/api/audit?…` first page → `{entries:[E1,E2], nextCursor: 5, refs:{"role_id:1":"Editor"}}`; `cursor=5` → `{entries:[E3], nextCursor: 0}`; `/api/audit.csv…` → a CSV `Response`. Cases:

```tsx
  it("is loading, then ready with the flattened journal, merged refs, actors and the window", …)
    // status "ready"; entries ids [1,2]; refs {"role_id:1":"Editor"}; actors length 1; window.entries length 1; live true
  it("loads older pages through nextCursor and stops following once it has", …)
    // act(loadOlder) → entries [1,2,3]; loadOlder undefined afterwards (nextCursor 0); live false
  it("resolves an actor login into the filter and refuses an unknown one without a request", …)
  it("sends a picked range as from/to and lets a typed token win", …)
     // setRange({from:"2026-09-01",to:""}) → next journal GET has from=2026-09-01T00%3A00%3A00Z; then setQuery("to:2026-09-02") → both bounds
    // setQuery("actor:a.ivanova") → the next journal GET has actor=u-1; setQuery("actor:ghost") → unknownActor "ghost", no new /api/audit GET with actor=
  it("selects an entry and exposes it", …)
  it("exports the current filters as CSV and toasts on refusal", …)
    // exportCsv(): fetch called with /api/audit.csv?entity=territory (after setQuery("entity:territory")); saveBlob stubbed via vi.mock("@/shared/lib/download"); 403 → notices[0] error with the standing sentence; exporting flips
  it("copies the selected entry as JSON", …)
    // navigator.clipboard.writeText stubbed; notice "Copied"
  it("is unavailable when the journal is refused", …)
  it("stays ready when a follow refetch fails on top of a loaded page", …)
```

Write these out in full in the file (the harness lines are the same as `use-content.spec.tsx`; the assertions are as sketched). Run — expected FAIL.

- [ ] **Step 4: The container**

`pages/audit/model/use-audit.ts`:

```ts
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  auditActorsQuery, auditQuery, auditWindowQuery, exportAuditCsv,
  type AuditActor, type AuditEntry, type AuditFilters, type Refs,
} from "@/entities/audit";
import { messageOf } from "@/shared/api";
import { saveBlob } from "@/shared/lib/download";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { parseAuditFilters, windowStart, type DateRange } from "./journal";

export type AuditState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  entries: AuditEntry[];
  refs: Refs;
  actors: AuditActor[];
  window: { entries: AuditEntry[]; capped: boolean } | null;
  query: string;
  setQuery: (q: string) => void;
  range: DateRange;
  setRange: (range: DateRange) => void;
  filters: AuditFilters;
  unknownActor: string | null;
  selected: AuditEntry | null;
  select: (id: number | null) => void;
  live: boolean;
  loadOlder?: () => void;
  loadingOlder: boolean;
  exportCsv: () => void;
  exporting: boolean;
  copyJson: () => void;
};

const WINDOW_LIMIT = 200;

/**
 * Everything the Audit screen decides. The journal is an infinite query keyed
 * by the parsed filters; the 24-hour window and the actors are their own
 * queries so a filter never changes the counters above the list.
 */
export function useAudit(): AuditState {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Captured once per mount: a window that moved every render would refetch every render.
  const [from] = useState(() => windowStart());

  const actors = useQuery(auditActorsQuery);
  const { filters, unknownActor } = useMemo(
    () => parseAuditFilters(query, actors.data ?? [], range),
    [query, actors.data, range],
  );
  const journal = useInfiniteQuery({ ...auditQuery(filters), enabled: unknownActor === null && !!actors.data });
  const window = useQuery(auditWindowQuery(from));

  const entries = journal.data?.pages.flatMap((p) => p.entries) ?? [];
  const refs = Object.assign({}, ...(journal.data?.pages.map((p) => p.refs) ?? [])) as Refs;

  const exporting = useMutation({
    mutationFn: () => exportAuditCsv(filters),
    onSuccess: (blob) => saveBlob(blob, "audit.csv"),
    onError: (err) => notify.error(messageOf(err, "Export failed")),
  });

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const failed = unanswered(journal) ?? unanswered(actors) ?? unanswered(window);
  const loading = journal.isLoading || actors.isPending || window.isPending;

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    entries,
    refs,
    actors: actors.data ?? [],
    window: window.data ? { entries: window.data.entries, capped: window.data.entries.length >= WINDOW_LIMIT } : null,
    query,
    setQuery,
    range,
    setRange,
    filters,
    unknownActor,
    selected,
    select: setSelectedId,
    live: (journal.data?.pages.length ?? 0) <= 1 && unknownActor === null,
    ...(journal.hasNextPage ? { loadOlder: () => void journal.fetchNextPage() } : {}),
    loadingOlder: journal.isFetchingNextPage,
    exportCsv: () => exporting.mutate(),
    exporting: exporting.isPending,
    copyJson: () => {
      if (!selected) return;
      void navigator.clipboard.writeText(JSON.stringify(selected, null, 2)).then(
        () => notify.success("Copied"),
        () => notify.error("Could not copy"),
      );
    },
  };
}
```

Notes for the implementer: `useInfiniteQuery` with a spread of `infiniteQueryOptions` plus `enabled` is the documented v5 shape; `journal.isLoading` (not `isPending`) because the query is disabled while actors load or the actor is unknown. Run: `yarn vitest run src/pages/audit/model` — expected PASS.

- [ ] **Step 5: The screen — spec first, then wiring**

`pages/audit/ui/audit-screen.spec.tsx` (mock `../model/use-audit` via `vi.hoisted`, mock `@/shared/lib/leave`): loading skeleton with `role="status"` "Loading journal"; unavailable → `alert` with the message; ready → days grouped (two `EventTimeline` headings for two dates), `live` badge present when `live`, absent otherwise; two date fields named "From" and "To" (the `DatePicker` trigger is a `button` named by its label — see `date-picker.spec.tsx`), a picked range (`range: {from:"2026-09-01", to:"2026-09-02"}`) shows the chip "1 Sep – 2 Sep" whose × calls `setRange({from:"",to:""})`; picking a day through the calendar calls `setRange` with the ISO date; "Load older events" only when `loadOlder` handed; unknown actor → the sentence "No actor named ghost" (a `Callout` tone warn) and no timeline; selecting → `inspected` with details and refs; "Open entity" leaves for `/territories/refinery`; Export calls `exportCsv`; the placeholder reads `filter: entity:territory action:territory.update actor:a.ivanova from:2026-09-01 to:2026-09-02`.

`audit-screen.tsx`:

```tsx
import { Callout } from "@/shared/ui/callout";
import { DatePicker } from "@/shared/ui/date-picker";
import { Skeleton } from "@/shared/ui/skeleton";
import { leaveTo } from "@/shared/lib/leave";
import { activityOf, countersOf, entityHref, groupByDay, inspectorDetails, rangeChip } from "../model/journal";
import { useAudit } from "../model/use-audit";
import { AuditPage } from "./audit-page";

/** Maps the container onto the page. */
export function AuditScreen() {
  const s = useAudit();

  if (s.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading journal" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable" || !s.window) {
    return <Callout tone="bad">The journal is unavailable: {s.error}</Callout>;
  }

  const now = new Date();
  const href = s.selected ? entityHref(s.selected) : null;
  const chip = rangeChip(s.range);

  return (
    <>
      {s.unknownActor ? <Callout tone="warn">No actor named {s.unknownActor}.</Callout> : null}
      {/* The pickers are the screen's, not the page's: the page stays chrome-free and only receives the chip. */}
      <div className="flex flex-wrap items-end gap-3">
        <DatePicker label="From" value={s.range.from} onChange={(from) => s.setRange({ ...s.range, from })} />
        <DatePicker label="To" value={s.range.to} onChange={(to) => s.setRange({ ...s.range, to })} />
      </div>
      <AuditPage
        days={s.unknownActor ? [] : groupByDay(s.entries, now)}
        activity={activityOf(s.window.entries, now, s.window.capped)}
        counters={countersOf(s.window.entries, s.window.capped, s.actors.length)}
        query={s.query}
        onQueryChange={s.setQuery}
        extraFilters={chip ? [{ label: chip, onRemove: () => s.setRange({ from: "", to: "" }) }] : []}
        selectedId={s.selected?.id ?? null}
        onSelect={s.select}
        onCloseInspector={() => s.select(null)}
        inspected={s.selected && { entry: s.selected, recordId: String(s.selected.id), details: inspectorDetails(s.selected), refs: s.refs }}
        live={s.live}
        onExport={s.exportCsv}
        exporting={s.exporting}
        onCopyJson={s.copyJson}
        onOpenEntity={href ? () => leaveTo(href) : undefined}
        onLoadOlder={s.loadOlder}
        loadingOlder={s.loadingOlder}
      />
    </>
  );
}
```

Page edits this needs (all additive, keep the page chrome-free): `InspectedRecord.refs?: Refs` threaded to `RecordInspector refs`; `AuditPageProps.exporting?: boolean` → the export `Button loading={exporting}`; `FILTER_PLACEHOLDER` rewritten per ruling 5. Update `audit-page.spec.tsx` for the placeholder and add one case each for `refs` and `exporting`. Two `EventTimeline` groups with the empty-`days` state: check what the page renders when `days` is empty (it may render nothing between the strip and the inspector) — if it renders nothing, the `Callout` above carries the sentence, which is the ruling.

Add `export { AuditScreen } from "./ui/audit-screen";` to `pages/audit/index.ts`; in `routes.tsx` set `consoleAuditRoute`'s `component: AuditScreen` (keep the `gate`).

Run: `yarn vitest run src/pages/audit` — expected PASS.

- [ ] **Step 6: Lint, suite, coverage, live, commit**

`yarn lint && yarn test && yarn test:coverage`. Live as `admin`: `/console/audit` shows the journal grouped by day with real actions (`territory.update`, `auth.login`, …), the activity strip and three counters; `entity:territory` narrows; picking From/To in the calendars puts a chip beside the query and narrows the journal, the chip's × clears it; `actor:cotest` narrows to that login; `actor:ghost` shows the sentence and no rows; "Load older events" pages until it disappears; the live dot goes off after paging; selecting a role change shows the role's title via refs; Export downloads `audit.csv`; Copy JSON toasts. As `cotest`: the journal is the company's own. Record what you saw. Commit (`--no-verify`, `frontend-v2` only):

```
feat(frontend-v2): the Audit journal, live

An infinite query keyed by the parsed filters, following the first page
every 30 s until older pages are loaded; a separate 24-hour window feeds
the activity strip and the counters so a filter never changes them; refs
from every page name the ids inside a diff. Actor logins resolve through
the actors list, an unknown one sends nothing and says so; free text is
not sent because the gateway has no text search.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 4: metrics entities — the panel gateway, the catalogue, series with gaps, honest widgets

**Files:**
- Modify: `frontend-v2/src/shared/ui/line-chart/line-chart.tsx` (`Series.values: (number | null)[]`, summary/legend over present values), `path.ts` (+ spec: gaps), any `Series` literal lint flags
- Create: `frontend-v2/src/entities/metric/model/panel-catalog.ts`, `panel-catalog.spec.ts`, `series.ts`, `series.spec.ts`, `service-health.ts`, `service-health.spec.ts`, `alerts.ts`, `alerts.spec.ts`
- Create: `frontend-v2/src/entities/metric/api/metrics-gateway.ts`, `metrics-gateway.spec.ts`, `panel-query.ts`, `panel-query.spec.ts`
- Modify: `frontend-v2/src/entities/metric/index.ts`
- Modify: `frontend-v2/src/widgets/alert-inspector/ui/alert-inspector.tsx` (+ spec, fixture), `frontend-v2/src/pages/metrics/ui/metrics-page.tsx` (+ spec, fixture)

**Interfaces:**
- Produces: `MetricSeries = { label: string; points: { t: number; v: number }[]; labels: Record<string, string> }`; `fetchPanel(panel: PanelId, range: MetricsRange): Promise<MetricSeries[]>`; `panelQuery(panel, range)` (key `["metrics", panel, range]`, 30 s, no background); `PanelId` union (21 ids), `PANELS: Record<PanelId, { title; meta; unit: Unit }>`, `SECTIONS`, `STAT_IDS`, `formatValue(v, unit)`; `alignSeries(series: MetricSeries[]): Series[]`, `lastOf(series: MetricSeries[]): number | null`; `servicesOf(up, rate, errors, latency): ServiceHealth[]`; `AlertSummary = { name; meta; state: "firing" | "pending"; service: string; severity: string }`, `alertsOf(series): AlertSummary[]`; `FiringAlert.firingFor?`, `series?`, `contributors?`; `AlertInspectorProps.onSilence?`, `onOpenInAudit?`, `onCopyPromQl?`; `MetricsPageProps.budget?`, `onSilence?`, `onOpenInAudit?`, `onCopyPromQl?`; `MetricsRange`/`METRIC_RANGES`/`isRange` move to `entities/metric/model/range.ts` (re-exported from `pages/metrics/model/range.ts` for existing importers).

- [ ] **Step 1: Gaps in the line chart — spec first**

`shared/ui/line-chart/path.spec.ts`, add:

```ts
  it("breaks the line at a gap and never draws across it", () => {
    expect(toLinePath([1, null, 3, 4], 4, { width: 300, height: 88, padTop: 12, padBottom: 6 })).toBe("M0 65.0 M200.0 30.0 L300.0 12.0");
  });
  it("shares the maximum over present values only and fills nothing with a gap", () => {
    expect(sharedMax([{ values: [1, null, 5] }])).toBe(5);
    expect(toAreaPath([1, null, 3], 3)).toBe("");
  });
```

(Compute the expected `y` values from `scaleY` for the geometry given; adjust the literal to what `scaleY` yields — the shape that matters is a new `M` after the gap and no `L` across it.) Run — expected FAIL to compile.

- [ ] **Step 2: Implement gaps**

`Series.values: (number | null)[]`. `toLinePath`: iterate; on `null` set `pen = false`; on a number emit `M` when `!pen` else `L`, then `pen = true`; a single present value still draws the flat segment only when it is the sole element (keep the existing branch for `values.length === 1 && values[0] !== null`). `toAreaPath`: return `""` when any value is `null`. `sharedMax`: filter nulls. In `line-chart.tsx`, wherever `values` feed the spoken summary (min/max/last), filter nulls first; `ChartLegend` untouched. Run `yarn lint` — fix any `Series` literal it flags (fixtures still pass numbers, which remain valid). Run: `yarn vitest run src/shared/ui/line-chart src/widgets` — expected PASS.

- [ ] **Step 3: Catalogue, series, services, alerts — specs first**

`entities/metric/model/panel-catalog.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatValue, PANELS, SECTIONS, STAT_IDS } from "./panel-catalog";

describe("panel catalogue", () => {
  it("covers every id the gateway registers, once", () => {
    const ids = Object.keys(PANELS).sort();
    expect(ids).toEqual([
      "alerts", "domain-auth", "domain-conversion-p95", "domain-conversions", "domain-queue", "domain-twofa", "domain-upload",
      "red-errors", "red-http", "red-latency", "red-rate", "runtime-fds", "runtime-gc", "runtime-goroutines", "runtime-memory",
      "services-up", "stat-errors", "stat-p99", "stat-queue", "stat-rps", "stat-up",
    ]);
    const inSections = SECTIONS.flatMap((s) => s.panelIds);
    expect(new Set(inSections).size).toBe(inSections.length);
    expect(STAT_IDS).toEqual(["stat-up", "stat-rps", "stat-errors", "stat-p99", "stat-queue"]);
  });

  it("formats by unit", () => {
    expect(formatValue(142.3, "rps")).toBe("142/s");
    expect(formatValue(0.0082, "percent")).toBe("0.8%");
    expect(formatValue(0.452, "seconds")).toBe("452ms");
    expect(formatValue(184, "seconds")).toBe("184s");
    expect(formatValue(1.4 * 1024 ** 3, "bytes")).toBe("1.4 GB");
    expect(formatValue(24.6, "mbps")).toBe("24.6 MB/s");
    expect(formatValue(6.2, "cpm")).toBe("6.2/min");
    expect(formatValue(412, "count")).toBe("412");
    expect(formatValue(null, "count")).toBe("—");
  });
});
```

`entities/metric/model/series.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { alignSeries, lastOf } from "./series";

const s = (label: string, pts: [number, number][]) => ({ label, points: pts.map(([t, v]) => ({ t, v })), labels: {} });

describe("series", () => {
  it("aligns co-plotted series on the union of timestamps, gaps as null", () => {
    expect(alignSeries([s("a", [[1, 10], [3, 30]]), s("b", [[1, 1], [2, 2], [3, 3]])])).toEqual([
      { label: "a", values: [10, null, 30] },
      { label: "b", values: [1, 2, 3] },
    ]);
    expect(alignSeries([])).toEqual([]);
  });

  it("reads the latest value of the first series, null when there is none", () => {
    expect(lastOf([s("a", [[1, 10], [3, 30]])])).toBe(30);
    expect(lastOf([s("a", [])])).toBeNull();
    expect(lastOf([])).toBeNull();
  });
});
```

`entities/metric/model/service-health.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { servicesOf } from "./service-health";

const one = (label: string, v: number, labels: Record<string, string> = {}) => ({ label, points: [{ t: 1, v }], labels });
const run = (label: string, vs: number[]) => ({ label, points: vs.map((v, t) => ({ t, v })), labels: {} });

describe("servicesOf", () => {
  it("names services from the up panel, reads state from up and errors, samples from the rate", () => {
    const out = servicesOf(
      [one("gateway", 1), one("audit", 0), one("catalog", 1), one("mesh-worker", 0), one("mesh-worker", 1)],
      [run("gateway", Array.from({ length: 30 }, (_, i) => i)), run("catalog", [3, 4])],
      [one("gateway", 1.2), one("catalog", 0)],
      [one("rosneft.catalog.v1.CatalogService", 0.024)],
    );
    expect(out.map((s) => [s.name, s.state, s.latency, s.errors])).toEqual([
      ["gateway", "degraded", "—", "1.2/s"],
      ["audit", "down", "—", "—"],
      ["catalog", "up", "24ms", "0/s"],
      ["mesh-worker", "up", "—", "—"],
    ]);
    expect(out[0].samples).toHaveLength(18);
    expect(out[0].samples[17]).toBe(29);
    expect(out[0].meta).toBe("29/s · 1.2 errors/s");
    expect(out[1].meta).toBe("scrape failed");
    expect(out[1].samples).toEqual([]);
  });
});
```

`entities/metric/model/alerts.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { alertsOf } from "./alerts";

describe("alertsOf", () => {
  it("summarises each alert series by its labels", () => {
    expect(alertsOf([
      { label: "HighErrorRate", points: [{ t: 1, v: 1 }], labels: { alertname: "HighErrorRate", alertstate: "firing", service: "gateway", severity: "critical" } },
      { label: "TargetDown", points: [{ t: 1, v: 1 }], labels: { alertname: "TargetDown", alertstate: "pending", severity: "warning" } },
    ])).toEqual([
      { name: "HighErrorRate", meta: "gateway · severity: critical", state: "firing", service: "gateway", severity: "critical" },
      { name: "TargetDown", meta: "severity: warning", state: "pending", service: "", severity: "warning" },
    ]);
  });
});
```

Run — expected FAIL.

- [ ] **Step 4: Implement the models**

`entities/metric/model/range.ts` — move the content of `pages/metrics/model/range.ts` here and add `export const isRange = (v: unknown): v is MetricsRange => typeof v === "string" && (METRIC_RANGES as string[]).includes(v);`; `pages/metrics/model/range.ts` becomes `export { isRange, METRIC_RANGES, RANGE_SECONDS, type MetricsRange } from "@/entities/metric";` (pages may import entities).

`entities/metric/model/panel-catalog.ts`:

```ts
export type Unit = "rps" | "cpm" | "percent" | "seconds" | "bytes" | "mbps" | "count";

export type PanelId =
  | "stat-up" | "stat-rps" | "stat-errors" | "stat-p99" | "stat-queue" | "services-up"
  | "red-rate" | "red-errors" | "red-latency" | "red-http"
  | "domain-conversions" | "domain-conversion-p95" | "domain-queue" | "domain-upload" | "domain-auth" | "domain-twofa"
  | "runtime-memory" | "runtime-goroutines" | "runtime-gc" | "runtime-fds"
  | "alerts";

/** Title, subtitle and unit per panel. The PromQL lives only in the gateway's registry. */
export const PANELS: Record<PanelId, { title: string; meta: string; unit: Unit }> = {
  "stat-up": { title: "Up", meta: "services answering", unit: "count" },
  "stat-rps": { title: "Requests", meta: "per second · all HTTP", unit: "rps" },
  "stat-errors": { title: "Errors", meta: "5xx share of HTTP", unit: "percent" },
  "stat-p99": { title: "p99", meta: "gRPC handling", unit: "seconds" },
  "stat-queue": { title: "Queue", meta: "conversion jobs waiting", unit: "count" },
  "services-up": { title: "Services", meta: "1 up · 0 down", unit: "count" },
  "red-rate": { title: "Requests by service", meta: "rps · gRPC", unit: "rps" },
  "red-errors": { title: "Errors by service", meta: "rps · non-OK gRPC", unit: "rps" },
  "red-latency": { title: "Latency p99 by service", meta: "seconds · gRPC", unit: "seconds" },
  "red-http": { title: "HTTP requests", meta: "rps · gateway", unit: "rps" },
  "domain-conversions": { title: "Conversions by status", meta: "per minute", unit: "cpm" },
  "domain-conversion-p95": { title: "Conversion duration p95", meta: "seconds · mesh-worker", unit: "seconds" },
  "domain-queue": { title: "Queue depth", meta: "count · mesh", unit: "count" },
  "domain-upload": { title: "Upload throughput", meta: "MB/s", unit: "mbps" },
  "domain-auth": { title: "Logins by status", meta: "per minute", unit: "cpm" },
  "domain-twofa": { title: "2FA verifications by status", meta: "per minute", unit: "cpm" },
  "runtime-memory": { title: "Resident memory", meta: "bytes · by service", unit: "bytes" },
  "runtime-goroutines": { title: "Goroutines", meta: "count · by service", unit: "count" },
  "runtime-gc": { title: "GC pause (max)", meta: "seconds · by service", unit: "seconds" },
  "runtime-fds": { title: "Open file descriptors", meta: "count · by service", unit: "count" },
  alerts: { title: "Alerts", meta: "firing or pending", unit: "count" },
};

export const STAT_IDS = ["stat-up", "stat-rps", "stat-errors", "stat-p99", "stat-queue"] as const satisfies readonly PanelId[];

export const SECTIONS: { key: string; title: string; panelIds: PanelId[] }[] = [
  { key: "red", title: "Services (RED)", panelIds: ["red-rate", "red-errors", "red-latency", "red-http"] },
  { key: "domain", title: "Domain", panelIds: ["domain-conversions", "domain-conversion-p95", "domain-queue", "domain-upload", "domain-auth", "domain-twofa"] },
  { key: "go", title: "Go runtime", panelIds: ["runtime-memory", "runtime-goroutines", "runtime-gc", "runtime-fds"] },
];

const round = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));

/** "—" for nothing; otherwise the unit's own shape. */
export function formatValue(v: number | null, unit: Unit): string {
  if (v === null || !Number.isFinite(v)) return "—";
  switch (unit) {
    case "rps": return `${round(v)}/s`;
    case "cpm": return `${round(v)}/min`;
    case "percent": return `${round(v * 100)}%`;
    case "seconds": return v < 1 ? `${Math.round(v * 1000)}ms` : `${round(v)}s`;
    case "bytes": return v >= 1024 ** 3 ? `${round(v / 1024 ** 3)} GB` : `${round(v / 1024 ** 2)} MB`;
    case "mbps": return `${round(v)} MB/s`;
    case "count": return String(round(v));
  }
}
```

`entities/metric/model/series.ts`:

```ts
import type { Series } from "@/shared/ui/line-chart";

export type MetricPoint = { t: number; v: number };
export type MetricSeries = { label: string; points: MetricPoint[]; labels: Record<string, string> };

/**
 * Co-plotted series need one x axis. Aligning on the union of timestamps and
 * leaving a missing sample as null is what lets the chart break the line
 * where a scrape was missed instead of drawing a slope through an outage.
 */
export function alignSeries(series: MetricSeries[]): Series[] {
  const ts = [...new Set(series.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b);
  return series.map((s) => {
    const at = new Map(s.points.map((p) => [p.t, p.v]));
    return { label: s.label, values: ts.map((t) => at.get(t) ?? null) };
  });
}

/** The latest value of the first series — what the panel prints large. */
export function lastOf(series: MetricSeries[]): number | null {
  const pts = series[0]?.points ?? [];
  return pts.length > 0 ? pts[pts.length - 1].v : null;
}
```

`entities/metric/model/service-health.ts`:

```ts
import { formatValue } from "./panel-catalog";
import type { MetricSeries } from "./series";
import type { ServiceHealth } from "./service";

const SAMPLES = 18;
const last = (s: MetricSeries | undefined) => (s && s.points.length > 0 ? s.points[s.points.length - 1].v : null);
const byLabel = (series: MetricSeries[], name: string) => series.find((s) => s.label === name);

/**
 * One row per service name the up panel knows. Down comes only from up; degraded
 * from a non-zero error rate; latency is matched by the gRPC service name
 * containing the scrape name, which is a convention, so a miss reads "—".
 */
export function servicesOf(up: MetricSeries[], rate: MetricSeries[], errors: MetricSeries[], latency: MetricSeries[]): ServiceHealth[] {
  // A service scraped as several replicas (mesh-worker) is several series with
  // one label; it is up when any replica answers.
  const names = [...new Set(up.map((u) => u.label))];
  return names.map((name) => {
    const isUp = up.filter((u) => u.label === name).some((u) => last(u) === 1);
    const rps = last(byLabel(rate, name));
    const err = last(byLabel(errors, name));
    const lat = last(latency.find((s) => s.label.toLowerCase().includes(name.toLowerCase())));
    const state = !isUp ? "down" : err !== null && err > 0 ? "degraded" : "up";
    return {
      name,
      state,
      meta: isUp ? `${formatValue(rps, "rps")} · ${formatValue(err, "rps").replace("/s", "")} errors/s` : "scrape failed",
      samples: isUp ? (byLabel(rate, name)?.points ?? []).slice(-SAMPLES).map((p) => p.v) : [],
      latency: isUp ? formatValue(lat, "seconds") : "—",
      errors: isUp ? formatValue(err, "rps") : "—",
    };
  });
}
```

(Adjust `meta`'s exact string to make the spec's `"29/s · 1.2 errors/s"` hold — `formatValue(1.2,"rps")` is `"1.2/s"`; strip the `/s` before appending " errors/s". Check `ServiceHealth.samples` type (`number[]`) — points are numbers, fine.)

`entities/metric/model/alerts.ts`:

```ts
import type { AlertSeverity } from "./metric";
import type { MetricSeries } from "./series";

export type AlertSummary = { name: string; meta: string; state: AlertSeverity; service: string; severity: string };

/** One summary per ALERTS series; firing vs pending is the alertstate label. */
export function alertsOf(series: MetricSeries[]): AlertSummary[] {
  return series.map((s) => {
    const service = s.labels.service ?? "";
    const severity = s.labels.severity ?? "";
    return {
      name: s.labels.alertname ?? s.label,
      meta: [service, severity ? `severity: ${severity}` : ""].filter(Boolean).join(" · "),
      state: s.labels.alertstate === "firing" ? "firing" : "pending",
      service,
      severity,
    };
  });
}
```

Run: `yarn vitest run src/entities/metric` — expected PASS for the four model specs.

- [ ] **Step 5: Gateway and query — specs, then code**

`entities/metric/api/metrics-gateway.spec.ts` (fetch factory; the DTO is `MetricSeries[]` with `labels?`): `fetchPanel("red-rate", "1h")` requests `/api/metrics/query?panel=red-rate&range=1h` and maps `labels ?? {}`, `points ?? []`; a 502 rejects with `status: 502` and the gateway's message. `entities/metric/api/panel-query.spec.ts`: `panelQuery("alerts", "15m").queryKey` is `["metrics", "alerts", "15m"]`, `refetchInterval` 30000, `refetchIntervalInBackground` false, `staleTime` 0.

```ts
// metrics-gateway.ts
import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { PanelId } from "../model/panel-catalog";
import type { MetricsRange } from "../model/range";
import type { MetricSeries } from "../model/series";

type SeriesDto = components["schemas"]["MetricSeries"];

export const fetchPanel = async (panel: PanelId, range: MetricsRange): Promise<MetricSeries[]> =>
  ((await httpGet<SeriesDto[] | null>(`/api/metrics/query?panel=${panel}&range=${range}`)) ?? []).map((s) => ({
    label: s.label,
    points: s.points ?? [],
    labels: s.labels ?? {},
  }));

// panel-query.ts
import { queryOptions } from "@tanstack/react-query";
import type { PanelId } from "../model/panel-catalog";
import type { MetricsRange } from "../model/range";
import { fetchPanel } from "./metrics-gateway";

const POLL_MS = 30_000;

/** One cache entry per panel and range; polled while the tab is visible. The route answers no-store, so there is no ETag to lose. */
export const panelQuery = (panel: PanelId, range: MetricsRange) =>
  queryOptions({
    queryKey: ["metrics", panel, range],
    queryFn: () => fetchPanel(panel, range),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
```

Export from `entities/metric/index.ts`: everything new (`PANELS, SECTIONS, STAT_IDS, formatValue, type PanelId, type Unit`, `alignSeries, lastOf, type MetricSeries, type MetricPoint`, `servicesOf`, `alertsOf, type AlertSummary`, `isRange, METRIC_RANGES, RANGE_SECONDS, type MetricsRange`, `fetchPanel`, `panelQuery`). Run: `yarn vitest run src/entities/metric` — expected PASS.

- [ ] **Step 6: Honest widgets — specs first, then the edits**

`widgets/alert-inspector`: `FiringAlert.firingFor?`, `series?`, `contributors?` optional; `AlertInspectorProps.onSilence?`, `onOpenInAudit?`, `onCopyPromQl?` optional. Rendering: the "Firing · 14m" line shows "Firing" alone without `firingFor`; the chart block draws only with `series`; the contributors block only with a non-empty list; each of the three buttons only when handed. Spec cases: an alert with only `name`, `meta`, `details` and no handlers renders the name, the details, no chart, no contributors, no buttons. Fixture: add a `Reduced` variant.

`pages/metrics`: `MetricsPageProps.budget?` (meter drawn only when handed), `onSilence?`, `onOpenInAudit?`, `onCopyPromQl?` passed through; `MetricsPageStat.delta?` stays optional and is simply not passed. Spec: a case without `budget` renders no `CoverageMeter` and the stat tiles still; a case without the three handlers passes an `alert` and asserts no Silence button. Fixture: keep as is (it passes everything).

Run: `yarn lint && yarn vitest run src/widgets/alert-inspector src/pages/metrics` — expected PASS.

- [ ] **Step 7: Commit**

```
feat(frontend-v2): metrics entities — panel gateway, catalogue, series with gaps, honest widgets

fetchPanel/panelQuery over GET /api/metrics/query, polled every 30 s in a
visible tab; a catalogue mirroring the gateway's registry ids (title, meta,
unit — the PromQL stays server-side); alignSeries puts co-plotted series on
one axis with null gaps, and the line chart now breaks a line at a gap
instead of drawing a slope through an outage; servicesOf and alertsOf
synthesise the health list and the alert summaries. The alert inspector
and the page stop drawing what nothing serves: budget, silence, PromQL,
contributors, firing-for.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 5: The Metrics screen, docs and the live pass

**Files:**
- Create: `frontend-v2/src/pages/metrics/model/dashboard.ts`, `dashboard.spec.ts`, `use-metrics.ts`, `use-metrics.spec.tsx`
- Create: `frontend-v2/src/pages/metrics/ui/metrics-screen.tsx`, `metrics-screen.spec.tsx`
- Modify: `frontend-v2/src/pages/metrics/index.ts`, `frontend-v2/src/app/router/routes.tsx` (`validateSearch` + component)
- Modify: `frontend-v2/README.md`, `frontend-v2/CLAUDE.md`, root `CLAUDE.md` ("Two frontends")

**Interfaces:**
- Consumes: Task 4's models/gateway/query; `useSearch`, `useNavigate` from `@tanstack/react-router`; `unanswered`, `messageOf`.
- Produces: `matchesService(service, query)`, `matchesSection(section, query)`, `matchesPanel(title, query)`, `panelEntry(id, result)`, `statsOf(results, serviceCount)`, `alertDetails(alert)`; `useMetrics(range): MetricsState`; `MetricsScreen` on `/console/metrics?range=`.

- [ ] **Step 1: Pure dashboard functions — spec first**

`pages/metrics/model/dashboard.spec.ts` covering: `matchesService` (`service:gate` matches "gateway"; `state:down` matches only down; unknown key matches nothing; free text ignored for services), `matchesSection` (`group:red`; no `group:` chip → every section), `matchesPanel` (free text "latency" matches "Latency p99 by service" case-insensitively; a `service:` chip does not narrow panels), `panelEntry("red-errors", { kind: "value", series })` → `{ key, title, meta, unit, last: "1.6/s", lastTone: "bad", series: aligned }`, `panelEntry(id, { kind: "unavailable", message })` → `last: "—"`, `lastTone: "bad"`, `meta: "unavailable — <message>"`, `series: []`, `panelEntry(id, { kind: "loading" })` → `last: "…"`, `statsOf` five tiles (Up "3", hint "of 4 services"; Errors "0.8%"; unknown → "—"), `alertDetails(summary)` → `[Alert, Service, Severity, State]` with "—" for empty. Write the literal cases in full (mirror the style of Part 3's `catalog.spec.ts`). Run — expected FAIL.

- [ ] **Step 2: Implement `dashboard.ts`**

```ts
import {
  alignSeries, formatValue, lastOf, PANELS, STAT_IDS,
  type AlertSummary, type MetricSeries, type PanelId, type ServiceHealth,
} from "@/entities/metric";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { Detail } from "@/shared/ui/detail-list";
import type { MetricPanelEntry } from "@/widgets/metric-panels";
import type { MetricsPageStat } from "../ui/metrics-page";

/** What one panel query is in, as the screen reads it. */
export type PanelResult =
  | { kind: "loading" }
  | { kind: "value"; series: MetricSeries[] }
  | { kind: "unavailable"; message: string };

export function matchesService(service: ServiceHealth, query: string): boolean {
  for (const { key, value } of parseFilters(query)) {
    if (key === "service" && !service.name.toLowerCase().includes(value.toLowerCase())) return false;
    else if (key === "state" && service.state !== value) return false;
    else if (key !== "service" && key !== "state" && key !== "group") return false;
  }
  return true;
}

export function matchesSection(section: { key: string }, query: string): boolean {
  const groups = parseFilters(query).filter((f) => f.key === "group");
  return groups.length === 0 || groups.some((g) => g.value === section.key);
}

export function matchesPanel(title: string, query: string): boolean {
  const text = freeText(query).trim().toLowerCase();
  return text === "" || title.toLowerCase().includes(text);
}

const errorTone = (id: PanelId, last: number | null) =>
  (id === "red-errors" || id === "stat-errors") && last !== null && last > 0 ? ("bad" as const) : undefined;

export function panelEntry(id: PanelId, result: PanelResult): MetricPanelEntry {
  const { title, meta, unit } = PANELS[id];
  if (result.kind === "loading") return { key: id, title, meta, unit, last: "…", series: [] };
  if (result.kind === "unavailable")
    return { key: id, title, meta: `unavailable — ${result.message}`, unit, last: "—", lastTone: "bad", series: [] };
  const last = lastOf(result.series);
  const tone = errorTone(id, last);
  return { key: id, title, meta, unit, last: formatValue(last, unit), ...(tone ? { lastTone: tone } : {}), series: alignSeries(result.series) };
}

const stat = (id: PanelId, result: PanelResult | undefined): string => {
  if (!result || result.kind === "loading") return "…";
  if (result.kind === "unavailable") return "—";
  return formatValue(lastOf(result.series), PANELS[id].unit);
};

export function statsOf(results: Partial<Record<PanelId, PanelResult>>, serviceCount: number | null): MetricsPageStat[] {
  const hints: Record<(typeof STAT_IDS)[number], string> = {
    "stat-up": serviceCount === null ? "services answering" : `of ${serviceCount} services`,
    "stat-rps": "per second · all HTTP",
    "stat-errors": "5xx share of HTTP",
    "stat-p99": "gRPC handling",
    "stat-queue": "conversion jobs waiting",
  };
  return STAT_IDS.map((id) => {
    const value = stat(id, results[id]);
    const bad = id === "stat-errors" && value !== "—" && value !== "…" && value !== "0%";
    return { label: PANELS[id].title, value, hint: hints[id], ...(bad ? { tone: "bad" as const } : {}) };
  });
}

const dash = (label: string, value: string): Detail => (value ? { label, value } : { label, value: "—", tone: "dim" });

export function alertDetails(a: AlertSummary): Detail[] {
  return [
    { label: "Alert", value: a.name },
    dash("Service", a.service),
    dash("Severity", a.severity),
    { label: "State", value: a.state, tone: a.state === "firing" ? "bad" : "warn" },
  ];
}
```

Run the spec — expected PASS.

- [ ] **Step 3: The container — spec first**

`pages/metrics/model/use-metrics.spec.tsx` — harness like `use-content.spec.tsx`, `PRINCIPAL` with `isOwner: true`; `fetch` stub keyed by `panel=`: `services-up` → two series (`gateway` v 1, `audit` v 0), `red-rate`/`red-errors`/`red-latency` → small series, `alerts` → one firing series, every other panel → one series with two points, `stat-errors` → 502 with `{message: "Prometheus unreachable"}`. Cases:

```
  it("is loading, then ready with services, sections, stats and alerts", …)
     // services names ["gateway","audit"], states; sections 3 with entries; stats[0].value "1"; firingCount 1; alert open with details
  it("keeps the screen ready when one panel fails and marks that card", …)
     // status "ready"; results["stat-errors"].kind "unavailable"; statsOf(...)[2].value "—"
  it("is unavailable only when every panel failed", …)
     // fetch → 502 for all: status "unavailable", error "Prometheus unreachable"
  it("re-keys every panel on a range change", …)
     // renderHook with range "1h" then rerender with "6h": fetch calls contain range=6h for each panel id
  it("opens and closes the alert panel", …)
```

Run — expected FAIL.

- [ ] **Step 4: The container**

`pages/metrics/model/use-metrics.ts`:

```ts
import { useQueries } from "@tanstack/react-query";
import { useState } from "react";
import {
  alertsOf, PANELS, panelQuery, servicesOf,
  type AlertSummary, type MetricsRange, type PanelId, type ServiceHealth,
} from "@/entities/metric";
import { messageOf } from "@/shared/api";
import { unanswered } from "@/shared/lib/unanswered";
import type { PanelResult } from "./dashboard";

const ALL: PanelId[] = Object.keys(PANELS) as PanelId[];

export type MetricsState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  results: Partial<Record<PanelId, PanelResult>>;
  services: ServiceHealth[];
  alerts: AlertSummary[];
  firingCount: number;
  query: string;
  setQuery: (q: string) => void;
  selectedService: string | null;
  selectService: (name: string | null) => void;
  selectedPanel: string | null;
  selectPanel: (key: string | null) => void;
  alertOpen: boolean;
  setAlertOpen: (open: boolean) => void;
};

/**
 * Everything the Metrics screen decides. One query per panel, all keyed on
 * the range the route holds; a failed panel is one dark card, and only a
 * dashboard where every panel failed is unavailable.
 */
export function useMetrics(range: MetricsRange): MetricsState {
  const [query, setQuery] = useState("");
  const [selectedService, selectService] = useState<string | null>(null);
  const [selectedPanel, selectPanel] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(true);

  const panels = useQueries({
    queries: ALL.map((id) => panelQuery(id, range)),
    // `combine` stays inline: its closure over ALL must match the queries
    // array of the same render (see use-content.ts).
    combine: (rs) => ({
      pending: rs.some((r) => r.isPending),
      allFailed: rs.length > 0 && rs.every((r) => unanswered(r) !== null),
      firstError: rs.map(unanswered).find((e) => e !== null) ?? null,
      results: Object.fromEntries(
        rs.map((r, i): [PanelId, PanelResult] => [
          ALL[i],
          r.data ? { kind: "value", series: r.data } : r.error ? { kind: "unavailable", message: messageOf(r.error) } : { kind: "loading" },
        ]),
      ) as Partial<Record<PanelId, PanelResult>>,
    }),
  });

  const series = (id: PanelId) => {
    const r = panels.results[id];
    return r?.kind === "value" ? r.series : [];
  };
  const alerts = alertsOf(series("alerts"));

  return {
    status: panels.pending ? "loading" : panels.allFailed ? "unavailable" : "ready",
    error: panels.allFailed && panels.firstError ? messageOf(panels.firstError) : null,
    results: panels.results,
    services: servicesOf(series("services-up"), series("red-rate"), series("red-errors"), series("red-latency")),
    alerts,
    firingCount: alerts.filter((a) => a.state === "firing").length,
    query,
    setQuery,
    selectedService,
    selectService,
    selectedPanel,
    selectPanel,
    alertOpen,
    setAlertOpen,
  };
}
```

Note "loading" while any panel pends is the Part 3 rule (the page renders only with data); a panel that has answered once stays "value" through its 30 s refetches (`isPending` is false once data exists). Run: `yarn vitest run src/pages/metrics/model` — expected PASS.

- [ ] **Step 5: The screen and the route — spec first, then wiring**

`pages/metrics/ui/metrics-screen.spec.tsx` (mock `../model/use-metrics`; mock `@tanstack/react-router`'s `useSearch`/`useNavigate` via `vi.mock` returning `{ range: "1h" }` and a `navigate` spy): loading skeleton "Loading dashboard"; unavailable alert; ready → health list names, three sections, five stat tiles, no `CoverageMeter`, firing badge "1 alert"; range change calls `navigate({ search: { range: "6h" } })` (check the exact shape TanStack's `useNavigate` expects for a search update on the current route — `navigate({ to: ".", search: { range } })` — and assert that); `service:gate` narrows the list; alert panel closes through `setAlertOpen(false)`; no Silence button.

`metrics-screen.tsx`:

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
import { SECTIONS, type MetricsRange } from "@/entities/metric";
import { Callout } from "@/shared/ui/callout";
import { Skeleton } from "@/shared/ui/skeleton";
import { alertDetails, matchesPanel, matchesSection, matchesService, panelEntry, statsOf } from "../model/dashboard";
import { useMetrics } from "../model/use-metrics";
import { MetricsPage } from "./metrics-page";

/** Maps the container onto the page; the range lives in the URL. */
export function MetricsScreen() {
  const { range } = useSearch({ strict: false }) as { range: MetricsRange };
  const navigate = useNavigate();
  const s = useMetrics(range);

  if (s.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading dashboard" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable") {
    return <Callout tone="bad">Metrics are unavailable: {s.error}</Callout>;
  }

  const firing = s.alerts.find((a) => a.state === "firing") ?? s.alerts[0];
  const upCount = s.services.length > 0 ? s.services.length : null;

  return (
    <MetricsPage
      services={s.services.filter((svc) => matchesService(svc, s.query))}
      sections={SECTIONS.filter((sec) => matchesSection(sec, s.query)).map((sec) => ({
        key: sec.key,
        title: sec.title,
        panels: sec.panelIds
          .map((id) => panelEntry(id, s.results[id] ?? { kind: "loading" }))
          .filter((p) => matchesPanel(p.title, s.query)),
      }))}
      stats={statsOf(s.results, upCount)}
      range={range}
      onRangeChange={(next) => void navigate({ to: ".", search: { range: next } })}
      query={s.query}
      onQueryChange={s.setQuery}
      selectedService={s.selectedService}
      onSelectService={s.selectService}
      selectedPanel={s.selectedPanel}
      onSelectPanel={s.selectPanel}
      firingCount={s.firingCount}
      alert={s.alertOpen && firing ? { name: firing.name, meta: firing.meta, details: alertDetails(firing) } : null}
      onCloseAlert={() => s.setAlertOpen(false)}
    />
  );
}
```

`routes.tsx`: import `isRange` from `@/entities/metric` (app → entities is allowed) and `MetricsScreen` from `@/pages/metrics`; `consoleMetricsRoute` gains

```ts
  validateSearch: (search: Record<string, unknown>) => ({ range: isRange(search.range) ? search.range : ("1h" as const) }),
```

and `component: MetricsScreen` (keep the `gate`). If `useSearch({ strict: false })` types the result loosely, the cast above is the documented escape; alternatively export the route's `useSearch` — but `pages` may not import `app`, so keep the cast. Run: `yarn vitest run src/pages/metrics` — expected PASS.

- [ ] **Step 6: Docs**

- `frontend-v2/CLAUDE.md`: "What is wired" gains Audit and Metrics (one sentence each: the follow rule and the 24-hour window; one query per panel on a URL range, a failed panel is one dark card); "Not done yet" loses the placeholders sentence and lists the not-drawn controls (budget, deltas, silence, PromQL copy, contributors, firing-for, ip/digest, failed: filter, free-text search) with the reason in half a sentence each; a trap line: "`Series.values` may hold `null` — a gap, drawn as a break; never fill it."
- `frontend-v2/README.md`: the "…Audit and Metrics are placeholders" sentence becomes "every console screen is live"; features table unchanged (no new feature slice).
- Root `CLAUDE.md` "Two frontends": "…every console screen is wired against the gateway".

- [ ] **Step 7: Lint, suite, coverage, live, commit**

`yarn lint && yarn test && yarn test:coverage`. Live as `admin`: `/console/metrics` → `?range=1h` appears in the URL; the health list names every scraped service with `up`; the five stat tiles print real numbers; twenty cards fill; switching to `15m` re-queries (Network tab shows `range=15m`); after 30 s a second round of requests arrives; hide the tab for a minute — no requests; `service:gate` narrows; if an alert is firing (stop a container briefly: `docker compose stop audit` → TargetDown fires after ~1 min; `docker compose start audit` after), the badge counts it and the inspector shows Alert/Service/Severity/State with no Silence button; as `cotest` `/console/metrics` bounces to `/console`. Record what you saw, restore the stack.

Commit (`--no-verify`, stage `frontend-v2 CLAUDE.md`):

```
feat(frontend-v2): the Metrics dashboard, live — every console screen is wired

One query per panel keyed on the range the URL holds, polled every 30 s in
a visible tab; the health list is synthesised from the new services-up
panel plus the RED panels; alerts are summarised from their labels. A
failed panel is one dark card; only a dashboard where every panel failed
is unavailable. Nothing is drawn that nothing serves.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 6: Mock parity — Metrics, Audit and Content against `* v2.dc.html`

Added 2026-09-04 after the user compared the live screens with the Claude
Design mocks (`Metrics v2`, `Audit Journal v2`, `Content v2`). Users, Roles,
Territory access and Login match their mocks within the rulings already made;
nothing there changes. Every item below is a visual/contract delta the mock
draws and the screen does not, or a lie the screen tells that the mock does
not. Rulings 26–33 govern.

**Files:**
- Modify: `frontend-v2/src/pages/metrics/model/dashboard.ts`, `dashboard.spec.ts`
- Modify: `frontend-v2/src/pages/metrics/ui/metrics-screen.tsx`, `metrics-screen.spec.tsx`
- Modify: `frontend-v2/src/pages/metrics/ui/metrics-page.tsx`, `metrics-page.spec.tsx`, `metrics-page.fixture.tsx`
- Modify: `frontend-v2/src/pages/audit/ui/audit-screen.tsx`, `audit-screen.spec.tsx`
- Modify: `frontend-v2/src/pages/audit/ui/audit-page.tsx`, `audit-page.spec.tsx`
- Modify: `frontend-v2/src/pages/content/model/catalog.ts`, `catalog.spec.ts`
- Modify: `frontend-v2/src/pages/content/ui/content-screen.tsx`, `content-screen.spec.tsx`
- Modify: `frontend-v2/src/widgets/content-groups/ui/content-groups.tsx`, `content-groups.spec.tsx`

**Interfaces:**
- Consumes: `MetricState`/`readout` (`entities/metric/model/metric.ts`), `MetricSeries` (`labels: Record<string,string>`), `CoverageMeter` segments via `MetricsPageProps.budget`, `ExtraFilter`/`FilterBar`, `Menu` (`shared/ui/menu`), `leaveTo`, `replaceHref`.
- Produces: `focusSeries`, `shortGrpcLabel`, `ZERO_FILLED` (dashboard.ts); `MetricsPageStat.state: MetricState` (replaces `value: string`); `AuditPageProps.filterTrailing?: ReactNode`; `groupContent` with a leading "Needs attention" group.

**Rulings (26–33):**
26. **Health meter in the wide slot, four tiles beside it.** The mock's top row is one wide meter plus tiles. `stat-up` leaves `STAT_IDS`; the screen builds `budget` from `s.services` — label `Service health`, segments `up`/`degraded`/`down` (tones ok/warn/bad, counts by `ServiceHealth.state`), detail `${up} of ${services.length} up`, `detailTone: "warn"` when any service is not `up`. `targetCount` and the "scraped targets" hint go away with the tile; the meter counts services, and says so. Grid with a budget becomes `lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]`.
27. **Per-service panels focus.** A panel whose series carry a `service` label shows only the selected service's series while one is selected; with none selected it shows the three series with the highest last value and appends ` · +N more` to `meta` for the rest. Pure: `focusSeries(series: MetricSeries[], selected: string | null): { series: MetricSeries[]; hidden: number }` — series without a `service` label pass through untouched, `hidden` is 0 then. Applied in `panelEntry` (new third argument `selected: string | null`, default `null`).
28. **Short gRPC labels.** `shortGrpcLabel("/rosneft.catalog.v1.CatalogService/ListTerritories")` → `Catalog.ListTerritories` (last dotted segment of the service, `Service` suffix dropped, method appended). *Amended 2026-09-04:* the gateway's `red-latency` panel groups by `grpc_service`, a bare `rosneft.catalog.v1.CatalogService`, so a bare dotted service name shortens the same way → `Catalog`; a label with no dots and no slash (`gateway`) is returned unchanged. Applied to series labels in `panelEntry` for panels in the `grpc` section only.
29. **Empty gRPC panels are quiet, not broken.** A `value` result with zero series in the `grpc` section renders `meta: "no gRPC traffic in range"`, `last: "—"`, `lastTone: "dim"`; `unavailable` keeps its red wording. Other sections keep today's behaviour.
30. **Rate panels fill gaps with 0, gauges keep the gap.** `ZERO_FILLED: ReadonlySet<PanelId>` lists every `rate()`/`increase()`-backed panel (the RPS, error-rate, gRPC-rate and job-throughput ids — read `PANELS` and include exactly those whose PromQL is a rate; the p99, queue-depth, memory and `services-up` panels are gauges). In `panelEntry`, for a zero-filled id the aligned series get `null` → `0`. Spec one of each.
31. **A failed stat tile speaks, not a glyph.** `MetricsPageStat.value: string` becomes `state: MetricState`; `statsOf` returns `{kind:"loading"}` / `{kind:"unavailable"}` / `{kind:"value", value}`; `MetricsPage` passes `state={stat.state}` and `StatTile` prints via `readout`, so the accessible name is "loading"/"unavailable", not "…"/"—". The `bad` tone test moves from string compare to `state.kind === "value" && state.value !== "0%"`.
32. **Audit date pickers live in the filter row.** `AuditPageProps.filterTrailing?: ReactNode` is rendered right of the `FilterBar` in one `flex items-center gap-3` row (`FilterBar` gets `className="flex-1 min-w-0"`); the screen passes the two `DatePicker`s there, each with its visible mono caption (`From` / `To`, `text-[9px] uppercase tracking-[0.18em] text-muted`) inline before the input. The block above the `<h1>` is deleted. The range chip stays in `extraFilters`.
33. **Content: attention first, counts that count everything, an honest drop zone, a row menu.** (a) `groupContent` prepends `{ key: "attention", label: "Needs attention", note: "${converting} converting · ${failed} failed", items }` when any item is `converting`/`failed`, removing those items from the kind groups; absent when none. (b) group `note` lists every non-zero state in the order ready · pending · converting · failed, ready always present (`"1 ready · 5 failed"`). (c) `DROP_HINT` becomes `"Upload an OBJ or GLB — opens the upload form"`. (d) `ContentScreen` passes `renderRowActions` rendering a `Menu` (kebab, `aria-label="Row actions"`) whose items mirror the inspector's existing actions for that item — Open in viewer (`leaveTo` the same href the inspector uses) and Replace source (`replaceHref`, only when non-null); no Delete unless the inspector already has one.

- [ ] **Step 1: Pure functions — specs first**

In `pages/metrics/model/dashboard.spec.ts` add:

```ts
describe("focusSeries", () => {
  const s = (service: string, last: number): MetricSeries => ({
    label: service, labels: { service }, points: [{ t: 0, v: last }],
  });
  it("keeps only the selected service", () => {
    const r = focusSeries([s("gateway", 1), s("mesh", 9)], "mesh");
    expect(r.series.map((x) => x.label)).toEqual(["mesh"]);
    expect(r.hidden).toBe(0);
  });
  it("shows the top three by last value and counts the rest", () => {
    const r = focusSeries([s("a", 1), s("b", 4), s("c", 3), s("d", 2), s("e", 5)], null);
    expect(r.series.map((x) => x.label)).toEqual(["e", "b", "c"]);
    expect(r.hidden).toBe(2);
  });
  it("passes unlabelled series through", () => {
    const plain = { label: "total", labels: {}, points: [] };
    expect(focusSeries([plain], "mesh")).toEqual({ series: [plain], hidden: 0 });
  });
});

describe("shortGrpcLabel", () => {
  it("shortens a full method path", () => {
    expect(shortGrpcLabel("/rosneft.catalog.v1.CatalogService/ListTerritories")).toBe("Catalog.ListTerritories");
  });
  it("leaves anything else alone", () => {
    expect(shortGrpcLabel("gateway")).toBe("gateway");
  });
});
```

Extend the `panelEntry` describe with: an empty `grpc` panel → `meta` "no gRPC traffic in range", `last` "—", `lastTone` "dim"; a zero-filled id turns a `null` into `0` while a gauge id keeps `null`; `statsOf` returns `state` objects (`{kind:"unavailable"}` for a failed tile, `{kind:"loading"}` for a missing one) and no longer takes `targetCount`.

In `pages/content/model/catalog.spec.ts` add: `groupContent` with one converting territory and one failed model → first group `Needs attention`, note `1 converting · 1 failed`, those two absent from the kind groups; with none → two groups only; a note for `[ready, failed×5]` reads `1 ready · 5 failed`.

Run: `yarn vitest run src/pages/metrics/model src/pages/content/model` — expected: the new cases FAIL (functions undefined / old shapes).

- [ ] **Step 2: Implement the pure functions**

`focusSeries`, `shortGrpcLabel`, `ZERO_FILLED` in `dashboard.ts`; `panelEntry(id, result, selected = null)` applies focus (meta suffix ` · +${hidden} more` when `hidden > 0`), gRPC label shortening and the empty-gRPC wording for ids in `SECTIONS.find(s => s.key === "grpc").panelIds`, and the zero fill; `statsOf(results)` returns `state`. `groupContent` and `note` per ruling 33. Keep `dashboard.ts` and `catalog.ts` under the 200-line cap — if `dashboard.ts` crosses it, move `focusSeries` and `shortGrpcLabel` to `pages/metrics/model/focus.ts` with their own spec.

Run the same command — expected: PASS.

- [ ] **Step 3: Pages and screens — specs first, then wiring**

`metrics-page.spec.tsx`: renders the meter when `budget` is given and four tiles; a stat with `state: {kind:"unavailable"}` has the accessible text "unavailable". `metrics-screen.spec.tsx`: with two services `up` and one `down` the meter reads `2 of 3 up` and the "Up" tile is gone; selecting a service narrows a per-service panel to it. `audit-page.spec.tsx`: `filterTrailing` renders inside the same row as the filter input (assert both share a parent). `audit-screen.spec.tsx`: the `From`/`To` captions render after the heading, not before it (compare `compareDocumentPosition`). `content-groups.spec.tsx`: the drop button's name is the new hint. `content-screen.spec.tsx`: a row's `Row actions` menu offers "Open in viewer" and, for an item with a replace href, "Replace source"; clicking Open in viewer calls `leaveTo` with the inspector's href.

Then wire: `metrics-screen.tsx` builds `budget` from `s.services`, drops `targets`, passes `s.selectedService` into `panelEntry`; `metrics-page.tsx` new grid class and `state` prop; `audit-page.tsx` + `audit-screen.tsx` per ruling 32; `content-groups.tsx` hint; `content-screen.tsx` row menu. Update `metrics-page.fixture.tsx` (a budget + four stats, one `unavailable`).

Run: `yarn vitest run src/pages src/widgets/content-groups` — expected: PASS.

- [ ] **Step 4: Lint, suite, live, commit**

```bash
yarn lint && yarn test
```

Live on `http://localhost:3001` as Root: `/console/metrics` shows the meter + four tiles, the gRPC panels carry `Catalog.ListTerritories`-style legends, selecting `mesh-service` narrows the per-service panels; `/console/audit` shows the pickers in the filter row and nothing above the title; `/console/content` shows "Needs attention" first with the failed rows, the drop zone's new text, and a working row menu. Zero console errors.

```bash
git add frontend-v2
git commit --no-verify -m "feat(frontend-v2): metrics, audit and content match their v2 mocks

frontend-v2 only — the Go gate does not apply, hence --no-verify."
```

## After this plan

- **Backend follow-ups filed, not built:** `request_id` on audit entries (D5); a `ALERTS_FOR_STATE` panel for "firing for" (M6c); an aggregate audit RPC if the 200-event window proves too coarse (D2); an `offset` for stat deltas (M4).
- **Deferred minors to carry:** the free-text filter on Audit is silently ignored (a hint in the placeholder is all that says so); the `red-latency` ↔ service match is a substring convention.
- Delete the SDD workspace after merge; the plan and the survey stay in `docs/`.
