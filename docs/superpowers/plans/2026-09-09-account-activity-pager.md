# Account Activity Pager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The account page's "My activity" shows six rows a page with the mock's numbered pager and a `1–6 of N events` summary; `N` comes from a new `total` the gateway computes for `GET /api/audit/mine` only.

**Architecture:** audit-service learns `Count` (same predicates as `List`, no cursor, no limit) behind an `include_total` request flag; the gateway threads it through as `domain.AuditPage` and writes `total` into the JSON of `/api/audit/mine`. The frontend keeps the shared 50-row cursor query, adds a `shared/ui/pager`, and pages the loaded rows six at a time, fetching further cursor pages only when the reader asks for a page the cache does not hold.

**Tech Stack:** Go 1.25 workspace (buf, oapi-codegen, minimock, testify/suite, gotest.tools, pgx, testcontainers), Vite 8 + React 19 + TypeScript 7, TanStack Query v5, Tailwind v4, vitest 5, React Cosmos, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-account-activity-pager-design.md` — binding. Mock digest: the "Account v2 — My activity" part of `.superpowers/sdd/2026-09-08-home-v2/mock-digest.md`.

## Global Constraints

- **Go tasks (1, 2):** run from the repo root. Gate before every Go commit: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` (fmt-check, tidy-check, `GOWORK=off` vet, golangci-lint, `go test -race -shuffle=on`, govulncheck; ~80 s, needs network). Go commits **without** `--no-verify` and with the same `CC`/`SDKROOT` env so the hook passes. `make -C backend proto-gen` after a `.proto` edit (buf), `make -C backend openapi-gen` after an `openapi.yaml` edit (both generated files). Backend 200-line cap by hand. Integration tests: `cd backend/services/audit-service && go test -tags=integration -race ./internal/migrate/...` (Docker Desktop is up).
- **Frontend tasks (3–5):** run from `frontend-v2/`; yarn only; `yarn lint` = `tsc -b --noEmit && oxlint`; gate `yarn lint && yarn test:coverage && yarn build` (90/85/90/90) + `yarn vitest run src/architecture.spec.ts src/fixtures.spec.tsx`; 200-line cap; a spec beside every module, a fixture per JSX slice; clsx: one property, one utility per element per state; `unanswered`, never `isError`; commits `--no-verify` with the frontend-only note.
- Commits by path only: `git add backend/proto backend/services/audit-service` etc. — never `-A`, never `.claude/settings.json`, never `backend/go.work.sum` (dirty from another session). Verify `git show --numstat --format="" HEAD | awk '{print $3}'`.
- Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Frontend-only commits add above it: `Frontend-only; the backend gate is skipped because no Go file changes and make -C backend check currently fails on the broken Homebrew llvm.` (Go commits do not — their gate ran.)
- Skills each implementer/reviewer loads first via the Skill tool: `ponytail:ponytail`, `clean-code`, `superpowers:test-driven-development`; Go tasks add `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to`, `cc-skills-golang:golang-testing`, `cc-skills-golang:golang-database`, `cc-skills-golang:golang-error-handling`, `cc-skills-golang:golang-grpc`; frontend tasks add `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `frontend-design:frontend-design`.
- Copy in English, exactly as the spec spells it.

---

## File map

```
backend/proto/rosneft/audit/v1/audit.proto                     (+include_total, +total) → proto-gen
backend/services/audit-service/internal/domain/entry.go        (+IncludeTotal, +Page)
backend/services/audit-service/internal/service/audit.go       (+Count on Store) → go generate
backend/services/audit-service/internal/service/list.go        (returns Page; Count when asked)
backend/services/audit-service/internal/service/list_test.go   (Page shape; two Count cases)
backend/services/audit-service/internal/storage/filter.go      (new: filterWhere)
backend/services/audit-service/internal/storage/list.go        (uses filterWhere)
backend/services/audit-service/internal/storage/count.go       (new)
backend/services/audit-service/internal/transport/grpcapi/{list.go,converters.go}
backend/services/audit-service/internal/migrate/list_storage_integration_test.go (new)
backend/services/gateway-service/internal/domain/audit.go      (+IncludeTotal, +AuditPage)
backend/services/gateway-service/internal/service/{gateway.go,audit.go} (+mocks regen)
backend/services/gateway-service/internal/service/{audit_labels_test.go,audit_refs_test.go}
backend/services/gateway-service/internal/clients/audit/{entries.go,entries_test.go}
backend/services/gateway-service/internal/transport/httpapi/{audit.go,audit_mine.go,audit_csv.go,audit_mine_test.go,audit_csv_test.go,audit_test.go (new)}
backend/services/gateway-service/api/openapi.yaml              (+total) → openapi-gen
frontend-v2/src/shared/api/dto.ts                              (regen)
frontend-v2/src/entities/audit/api/{audit-gateway.ts,audit-gateway.spec.ts,my-audit-query.spec.ts,audit-queries.spec.ts}
frontend-v2/src/shared/ui/pager/{index.ts,pages.ts,pages.spec.ts,pager.tsx,pager.spec.tsx,pager.fixture.tsx}
frontend-v2/src/pages/account/model/{paging.ts,paging.spec.ts,use-account.ts,use-account.spec.tsx}
frontend-v2/src/pages/account/ui/{activity-section.tsx,activity-section.spec.tsx,account-page.tsx,account-page.spec.tsx}
frontend-v2/src/pages/account/account-page.fixture.tsx
CLAUDE.md, frontend-v2/CLAUDE.md
```

---

### Task 1: audit-service — `Count`, `include_total`, `Page`

**Files:**
- Modify: `backend/proto/rosneft/audit/v1/audit.proto`
- Modify: `backend/services/audit-service/internal/domain/entry.go`
- Modify: `backend/services/audit-service/internal/service/audit.go`, `list.go`, `list_test.go`
- Create: `backend/services/audit-service/internal/storage/filter.go`, `count.go`
- Modify: `backend/services/audit-service/internal/storage/list.go`
- Modify: `backend/services/audit-service/internal/transport/grpcapi/list.go`, `converters.go`
- Create: `backend/services/audit-service/internal/migrate/list_storage_integration_test.go`

**Interfaces:**
- Produces (proto): `ListEntriesRequest.include_total = 10`, `ListEntriesResponse.total = 3`.
- Produces (Go): `domain.Filter.IncludeTotal bool`; `type Page struct { Entries []Entry; NextCursor int64; Total int64 }`; `Store.Count(ctx, f domain.Filter) (int64, error)`; `(*Service).List(ctx, f) (domain.Page, error)`.

- [ ] **Step 1: The proto**

```proto
message ListEntriesRequest {
  // … existing fields 1-9 unchanged …
  // include_total asks for the count of every row the other filters match,
  // cursor aside. Off by default: the company journal is polled and must not
  // pay for a COUNT on every tick; the own-actions page asks for it once.
  bool include_total = 10;
}
message ListEntriesResponse {
  repeated Entry entries = 1;
  int64 next_cursor = 2; // 0 = no further pages
  int64 total = 3;       // rows matched by the filters, paging aside; 0 unless include_total
}
```

Run `make -C backend proto-gen`; confirm `backend/proto/gen/go/rosneft/audit/v1/audit.pb.go` gained `GetIncludeTotal()` and `GetTotal()`.

- [ ] **Step 2: Failing service tests**

In `list_test.go`, change every `svc.List(...)` call to the `Page` shape (e.g. `page, err := svc.List(...)`, then `page.Entries`, `page.NextCursor`) and add:

```go
// The count is an extra query; it runs only when the caller asks, and it is
// asked about everything the filters match — never about the page.
func (s *ListSuite) TestTotalIsCountedOnlyWhenAsked() {
	var counted domain.Filter
	store := mocks.NewStoreMock(s.mc).
		ListMock.Return([]domain.Entry{{ID: 30}, {ID: 20}, {ID: 10}}, nil).
		CountMock.Set(func(_ context.Context, f domain.Filter) (int64, error) {
			counted = f
			return 184, nil
		})
	svc := service.New(store)

	page, err := svc.List(s.T().Context(), domain.Filter{AllCompanies: true, Cursor: 99, Limit: 2, IncludeTotal: true})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), page.Total, int64(184))
	assert.Equal(s.T(), counted.Cursor, int64(0), "the count must ignore the cursor")
	assert.Equal(s.T(), counted.Limit, int32(0), "the count must ignore the limit")
	assert.Equal(s.T(), counted.AllCompanies, true)
}

func (s *ListSuite) TestTotalIsNotCountedByDefault() {
	// No CountMock expectation: minimock fails the test if Count is called.
	store := mocks.NewStoreMock(s.mc).ListMock.Return([]domain.Entry{{ID: 1}}, nil)
	svc := service.New(store)

	page, err := svc.List(s.T().Context(), domain.Filter{AllCompanies: true})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), page.Total, int64(0))
}

// A count that fails must fail the read: a page that prints "of 0" beside
// real rows is a wrong number, not a degraded one.
func (s *ListSuite) TestCountErrorFailsTheRead() {
	store := mocks.NewStoreMock(s.mc).
		ListMock.Return([]domain.Entry{{ID: 1}}, nil).
		CountMock.Return(0, errors.New("boom"))
	svc := service.New(store)

	_, err := svc.List(s.T().Context(), domain.Filter{AllCompanies: true, IncludeTotal: true})

	assert.ErrorContains(s.T(), err, "boom")
}
```

(add `"errors"` to the imports.)

- [ ] **Step 3: Run to verify failure**

Run: `cd backend/services/audit-service && go test ./internal/service/...`
Expected: compile failure — `CountMock` undefined, `Page` undefined.

- [ ] **Step 4: Domain and Store**

`domain/entry.go` — append to `Filter`:

```go
	// IncludeTotal asks for the count of every row the other fields match,
	// Cursor and Limit aside. Off by default; see Service.List.
	IncludeTotal bool
```

and add:

```go
// Page is one read of the journal: the rows, the cursor for the next page
// (0 when there is none) and, when asked for, the count of every row the
// filters match.
type Page struct {
	Entries    []Entry
	NextCursor int64
	Total      int64
}
```

`service/audit.go` — add to `Store` after `List`:

```go
	// Count answers how many rows f matches, paging aside — the Cursor and
	// Limit fields are ignored.
	Count(ctx context.Context, f domain.Filter) (int64, error)
```

Run `cd backend/services/audit-service && go generate ./internal/service` (minimock regenerates `mocks/store_mock.go`).

- [ ] **Step 5: `Service.List`**

```go
// List returns one page of journal entries plus the cursor for the next page
// (0 when there is none), and — only when f.IncludeTotal — how many rows the
// filters match in all.
//
// (existing doc paragraphs on the scoped read, the actor check and the
// lookahead row stay verbatim.)
//
// The count is a second query over the same predicates minus the paging ones
// and runs only on request: the company journal is polled every 30 s and a
// COUNT on every tick would be paid for by nobody.
func (s *Service) List(ctx context.Context, f domain.Filter) (domain.Page, error) {
	if !f.AllCompanies && f.CompanyID == "" {
		return domain.Page{}, fmt.Errorf("audit.List: %w: company id required for a scoped read", domain.ErrInvalidInput)
	}
	if f.ActorID != "" {
		if _, err := uuid.Parse(f.ActorID); err != nil {
			return domain.Page{}, fmt.Errorf("audit.List: %w: actor id must be a uuid", domain.ErrInvalidInput)
		}
	}
	want := f.Limit
	if want <= 0 {
		want = defaultLimit
	}
	want = min(want, maxLimit)

	q := f
	q.Limit = want + 1
	rows, err := s.store.List(ctx, q)
	if err != nil {
		return domain.Page{}, err
	}
	page := domain.Page{Entries: rows}
	if int32(len(rows)) > want {
		page.Entries = rows[:want]
		page.NextCursor = page.Entries[len(page.Entries)-1].ID
	}
	if f.IncludeTotal {
		c := f
		c.Cursor, c.Limit = 0, 0
		if page.Total, err = s.store.Count(ctx, c); err != nil {
			return domain.Page{}, err
		}
	}
	return page, nil
}
```

Check the file's non-blank/comment count against the 200 cap after the doc comment grows.

- [ ] **Step 6: Storage — the shared predicate, `Count`, `List`**

`storage/filter.go`:

```go
package storage

import (
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// filterWhere renders the predicates List and Count share — everything in the
// filter except paging. Appended only when set, so the planner can use
// audit_log_company_idx for a scoped read, audit_log_actor_idx for one
// actor's, and audit_log_id_idx for the Root's. One builder for two queries:
// the count must answer for exactly the rows the pages walk.
func filterWhere(f domain.Filter) (string, []any) {
	q := ` WHERE 1=1`
	args := make([]any, 0, 8)
	add := func(clause string, v any) {
		args = append(args, v)
		q += fmt.Sprintf(clause, len(args))
	}
	if !f.AllCompanies {
		add(" AND company_id = $%d", f.CompanyID)
	}
	if f.ActorID != "" {
		add(" AND actor_id = $%d", f.ActorID)
	}
	if f.Action != "" {
		add(" AND action = $%d", f.Action)
	}
	if f.Entity != "" {
		add(" AND entity = $%d", f.Entity)
	}
	if !f.From.IsZero() {
		add(" AND at >= $%d", f.From)
	}
	if !f.To.IsZero() {
		add(" AND at <= $%d", f.To)
	}
	return q, args
}
```

`storage/count.go`:

```go
package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Count answers how many rows f matches, paging aside. Cursor and Limit are
// never read: the number a pager prints is "of everything", not "of the rest".
func (r *PG) Count(ctx context.Context, f domain.Filter) (int64, error) {
	where, args := filterWhere(f)
	var n int64
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM audit_log`+where, args...).Scan(&n); err != nil {
		return 0, fmt.Errorf("storage.Count: %w", err)
	}
	return n, nil
}
```

`storage/list.go` — replace the hand-built predicates with the builder; the cursor and limit stay here:

```go
func (r *PG) List(ctx context.Context, f domain.Filter) ([]domain.Entry, error) {
	where, args := filterWhere(f)
	q := `SELECT ` + entryColumns + ` FROM audit_log` + where
	if f.Cursor > 0 {
		args = append(args, f.Cursor)
		q += fmt.Sprintf(" AND id < $%d", len(args))
	}
	args = append(args, f.Limit)
	q += fmt.Sprintf(" ORDER BY id DESC LIMIT $%d", len(args))
	// … the rows loop unchanged …
```

Keep `List`'s doc comment, pointing at `filterWhere` for the index note.

- [ ] **Step 7: gRPC transport**

`converters.go` `filterFromProto`: add `IncludeTotal: req.GetIncludeTotal(),`. `list.go`:

```go
func (s *Server) ListEntries(ctx context.Context, req *auditv1.ListEntriesRequest) (*auditv1.ListEntriesResponse, error) {
	page, err := s.svc.List(ctx, filterFromProto(req))
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*auditv1.Entry, 0, len(page.Entries))
	for _, e := range page.Entries {
		out = append(out, entryToProto(e))
	}
	return &auditv1.ListEntriesResponse{Entries: out, NextCursor: page.NextCursor, Total: page.Total}, nil
}
```

Grep the module for other `svc.List(` / `.List(ctx` callers (the CLI `audit export` may use the store directly, not the service — check `cmd/`) and adapt any to `Page`.

- [ ] **Step 8: Run the unit suite**

Run: `cd backend/services/audit-service && go test -race ./...`
Expected: PASS, including the three new cases.

- [ ] **Step 9: Integration test — the count is over the filters, not the page**

`internal/migrate/list_storage_integration_test.go`:

```go
//go:build integration

package migrate_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
)

const (
	actorA = "11111111-1111-4111-8111-111111111111"
	actorB = "22222222-2222-4222-8222-222222222222"
)

type ListStorageSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *storage.PG
}

func TestListStorageSuite(t *testing.T) { suite.Run(t, new(ListStorageSuite)) }

func (s *ListStorageSuite) SetupSuite() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"), tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"), tcpostgres.BasicWaitStrategies())
	assert.NilError(s.T(), err)
	s.ctr = ctr
	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, dsn))
	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.store = storage.New(s.pool)
	for i, actor := range []string{actorA, actorA, actorB, actorA, actorB} {
		_, err := s.store.Record(s.T().Context(), domain.Entry{
			ActorID: actor, Action: "auth.login", Entity: "session", Result: "ok",
		})
		assert.NilError(s.T(), err, "row %d", i)
	}
}

func (s *ListStorageSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// The count answers for everything the filters match; the page and its cursor
// are not filters.
func (s *ListStorageSuite) TestCountIgnoresPagingAndHonoursTheActor() {
	all := domain.Filter{AllCompanies: true, ActorID: actorA}

	first, err := s.store.List(s.T().Context(), domain.Filter{AllCompanies: true, ActorID: actorA, Limit: 2})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(first), 2)

	nA, err := s.store.Count(s.T().Context(), domain.Filter{AllCompanies: true, ActorID: actorA, Cursor: first[1].ID, Limit: 2})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), nA, int64(3))

	nAll, err := s.store.Count(s.T().Context(), all)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), nAll, int64(3))

	nB, err := s.store.Count(s.T().Context(), domain.Filter{AllCompanies: true, ActorID: actorB})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), nB, int64(2))
}

// A scoped count with a company nobody wrote answers 0, not the NULL-company rows.
func (s *ListStorageSuite) TestScopedCountSeesOnlyItsCompany() {
	n, err := s.store.Count(s.T().Context(), domain.Filter{CompanyID: "33333333-3333-4333-8333-333333333333"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int64(0))
}
```

Check `storage.Record` accepts `ActorID` (read `storage/record.go`); if it writes NULL for an empty actor and a UUID otherwise, the fixture above is right. Run: `cd backend/services/audit-service && go test -tags=integration -race ./internal/migrate/ -run ListStorage -v`. Expected: PASS (quote the output).

- [ ] **Step 10: Gate and commit**

```bash
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check
git add backend/proto backend/services/audit-service
git status --short   # backend/go.work.sum must NOT be staged
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) git commit -m "feat(audit): a journal read can carry its total — Count behind include_total

The count runs over the same predicates List walks, cursor and limit aside,
and only when asked: the company journal is polled and must not pay for it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Note the gateway module does not compile against the new proto yet? It does — a new proto field is additive; the gateway's client simply does not send it until Task 2. `make check` must be green for every module.

---

### Task 2: gateway-service — `AuditPage`, the flag on `/mine`, `total` in the JSON

**Files:**
- Modify: `backend/services/gateway-service/internal/domain/audit.go`
- Modify: `backend/services/gateway-service/internal/service/gateway.go` (+ `go generate`), `audit.go`, `audit_labels_test.go`, `audit_refs_test.go`
- Modify: `backend/services/gateway-service/internal/clients/audit/entries.go`, `entries_test.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit.go`, `audit_mine.go`, `audit_csv.go`, `audit_mine_test.go`, `audit_csv_test.go`
- Create: `backend/services/gateway-service/internal/transport/httpapi/audit_test.go`
- Modify: `backend/services/gateway-service/api/openapi.yaml` (+ `make -C backend openapi-gen`)

**Interfaces:**
- Consumes: Task 1's proto fields.
- Produces: `domain.AuditQuery.IncludeTotal bool`; `type AuditPage struct { Entries []AuditEntry; NextCursor int64; Total int64 }`; `Audit.ListEntries(ctx, q) (AuditPage, error)`; `(*Gateway).ListAudit(ctx, q, sc, token, wantRefs) (AuditPage, map[string]string, error)`; JSON `AuditPage.total` (int64, optional) on `/api/audit/mine`.

- [ ] **Step 1: Failing handler tests**

`audit_mine_test.go` — the stub becomes:

```go
type mineServiceStub struct {
	Service
	seen domain.AuditQuery
	page domain.AuditPage
	err  error
}

func (m *mineServiceStub) ListAudit(
	_ context.Context, q domain.AuditQuery, sc domain.AuditScope, _ string, _ bool,
) (domain.AuditPage, map[string]string, error) {
	q.AllCompanies, q.CompanyID = sc.All, sc.Company
	if sc.Actor != "" {
		q.ActorID = sc.Actor
	}
	m.seen = q
	return m.page, nil, m.err
}
```

and two cases:

```go
// The own-actions page is the one surface that pages by number, so it is the
// one that asks the journal to count.
func (s *ListMyAuditSuite) TestAsksForTheTotalAndPrintsIt() {
	svc := &mineServiceStub{page: domain.AuditPage{Total: 184}}
	ctx := s.ctxFor(authhttp.TestPrincipal{
		UserID: "me", Perms: []string{"audit:read_own"},
		OwningAdmin: "company-1", AuditCompany: "company-1",
	})

	resp, err := New(svc).ListMyAudit(ctx, ListMyAuditRequestObject{})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), svc.seen.IncludeTotal, true)
	page, ok := resp.(ListMyAudit200JSONResponse)
	assert.Assert(s.T(), ok, "expected 200, got %T", resp)
	assert.Assert(s.T(), page.Total != nil)
	assert.Equal(s.T(), *page.Total, int64(184))
}
```

New `audit_test.go` (the company route had no handler test):

```go
package httpapi

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// ListAuditSuite covers the company journal route's one paging decision: it
// never asks for the total. It is polled every 30 s while the page follows,
// and a COUNT on every tick would be paid for by nobody.
type ListAuditSuite struct {
	suite.Suite
}

func TestListAuditSuite(t *testing.T) { suite.Run(t, new(ListAuditSuite)) }

func (s *ListAuditSuite) TestDoesNotAskForTheTotal() {
	svc := &mineServiceStub{page: domain.AuditPage{Total: 184}}
	ctx := authhttp.NewTestContextFor(s.T().Context(), authhttp.TestPrincipal{
		UserID: "owner-1", Perms: []string{"audit:read"},
		OwningAdmin: "company-1", AuditCompany: "company-1",
	})

	resp, err := New(svc).ListAudit(ctx, ListAuditRequestObject{})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), svc.seen.IncludeTotal, false)
	page, ok := resp.(ListAudit200JSONResponse)
	assert.Assert(s.T(), ok, "expected 200, got %T", resp)
	assert.Assert(s.T(), page.Total == nil, "the company journal carries no total")
}
```

(`mineServiceStub` is package-private in the same package — reuse it.) `audit_csv_test.go`'s stub follows the new signature (`domain.AuditPage{Entries: …}, nil, err`).

- [ ] **Step 2: Run to verify failure** — `cd backend/services/gateway-service && go test ./internal/transport/httpapi/...` → compile failure (`AuditPage` undefined, `IncludeTotal` undefined).

- [ ] **Step 3: Domain, interface, client, service**

`domain/audit.go` — `IncludeTotal bool` on `AuditQuery` (with the one-line why), and:

```go
// AuditPage is one read of the journal: the labelled rows, the cursor for
// the next page (0 = none) and, when the query asked, how many rows the
// filters match in all.
type AuditPage struct {
	Entries    []AuditEntry
	NextCursor int64
	Total      int64
}
```

`service/gateway.go`: `ListEntries(ctx context.Context, q domain.AuditQuery) (domain.AuditPage, error)`; then `cd backend/services/gateway-service && go generate ./internal/service`.

`clients/audit/entries.go`:

```go
// ListEntries returns one page of the journal plus the next cursor (0 = end)
// and, when q.IncludeTotal, the count of every row the filters match.
func (c *Client) ListEntries(ctx context.Context, q domain.AuditQuery) (domain.AuditPage, error) {
	resp, err := c.cc.ListEntries(ctx, &auditv1.ListEntriesRequest{
		// … existing fields …
		IncludeTotal: q.IncludeTotal,
	})
	if err != nil {
		// (existing comment)
		return domain.AuditPage{}, fmt.Errorf("audit.ListEntries: %w", grpcerr.MapStatus(err, nil))
	}
	page := domain.AuditPage{Entries: make([]domain.AuditEntry, 0, len(resp.GetEntries())), NextCursor: resp.GetNextCursor(), Total: resp.GetTotal()}
	for _, e := range resp.GetEntries() {
		page.Entries = append(page.Entries, domain.AuditEntry{ /* unchanged mapping */ })
	}
	return page, nil
}
```

`entries_test.go`: `_, err := c.ListEntries(...)` at both sites.

`service/audit.go`:

```go
func (g *Gateway) ListAudit(
	ctx context.Context, q domain.AuditQuery, sc domain.AuditScope, token string, wantRefs bool,
) (domain.AuditPage, map[string]string, error) {
	q.AllCompanies = sc.All
	q.CompanyID = sc.Company
	if sc.Actor != "" {
		q.ActorID = sc.Actor
	}
	page, err := g.audit.ListEntries(ctx, q)
	if err != nil {
		return domain.AuditPage{}, nil, err
	}
	page.Entries = g.labelAuditEntries(ctx, token, page.Entries)
	if !wantRefs {
		return page, nil, nil
	}
	return page, g.resolveRowRefs(ctx, token, page.Entries), nil
}
```

`audit_labels_test.go` / `audit_refs_test.go`: every `ListEntriesMock.Return(entries, 0, nil)` → `ListEntriesMock.Return(domain.AuditPage{Entries: entries}, nil)`; every `out, _, _, err := s.svc.ListAudit(...)` → `page, _, err := …; out := page.Entries` (keep the assertions).

- [ ] **Step 4: Handlers and the spec**

`audit_mine.go`:

```go
	q := myAuditQuery(req.Params)
	// The one surface that pages by number: it needs the count, and it is
	// read once per visit rather than polled.
	q.IncludeTotal = true
	page, refs, err := s.svc.ListAudit(ctx, q, sc, authhttp.Token(ctx), true)
	// … error switch unchanged …
	out := AuditPage{Entries: make([]AuditEntry, len(page.Entries)), Total: &page.Total}
	for i, e := range page.Entries {
		out.Entries[i] = auditEntryToAPI(e)
	}
	if page.NextCursor > 0 {
		out.NextCursor = &page.NextCursor
	}
	if len(refs) > 0 {
		out.Refs = &refs
	}
	return ListMyAudit200JSONResponse(out), nil
```

`audit.go` (`ListAudit`): the same reshaping without `Total` (the flag stays false). `audit_csv.go` lines 72 and 98: `first, next, _, err` → `page, _, err := …; first, next := page.Entries, page.NextCursor` (and the same for the loop).

`openapi.yaml` `AuditPage`, after `nextCursor`:

```yaml
        total:
          type: integer
          format: int64
          minimum: 0
          description: >
            How many entries the same filters match in all, paging aside —
            what a numbered pager needs. Present on GET /api/audit/mine; the
            company journal is polled and does not pay for the count.
```

Run `make -C backend openapi-gen`; `openapi_gen.go`'s `AuditPage` gains `Total *int64 \`json:"total,omitempty"\``.

- [ ] **Step 5: Run** — `cd backend/services/gateway-service && go test -race ./...` → PASS.

- [ ] **Step 6: Gate and commit**

```bash
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check
git add backend/services/gateway-service
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) git commit -m "feat(gateway): GET /api/audit/mine carries total — the own-actions page asks the journal to count

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: Live check** — rebuild and restart the two services in the compose stack (`docker compose up -d --build audit-service gateway-service` from the repo root — read `docker-compose.yml` for the service names first), then as `admin` (login field `identifier`, cookie jar): `curl -s -b jar 'http://localhost:8080/api/audit/mine?limit=2' | jq '{total, next: .nextCursor, n: (.entries|length)}'` → `total` ≥ `n`, and `curl … /api/audit?limit=2 | jq .total` → `null`. Quote both.

---

### Task 3: frontend entity — `total` on `AuditPageResult`

**Files:**
- Regenerate: `frontend-v2/src/shared/api/dto.ts`
- Modify: `frontend-v2/src/entities/audit/api/audit-gateway.ts`, `audit-gateway.spec.ts`, `my-audit-query.spec.ts`, `audit-queries.spec.ts` (any page literal)

**Interfaces:**
- Produces: `AuditPageResult = { entries; nextCursor: number | null; refs; total: number | null }`.

- [ ] **Step 1: Regenerate** — `yarn openapi:generate`; `git diff --stat src/shared/api/dto.ts` shows one hunk: `total?: number;` under `AuditPage`. Anything else in the diff is a finding to report, not to commit.

- [ ] **Step 2: Failing spec** — in `audit-gateway.spec.ts` (read it for its fetch-stub shape), add to the `listMyAudit` describe:

```ts
  it("carries the journal's total, and null when the route sends none", async () => {
    stub({ entries: [], nextCursor: 0, total: 184 });
    expect((await listMyAudit(null)).total).toBe(184);
    stub({ entries: [], nextCursor: 0 });
    expect((await listMyAudit(null)).total).toBeNull();
  });
```

(adapt `stub` to the file's helper name). Run: `yarn vitest run src/entities/audit` → FAIL (`total` undefined / type error under `tsc -b`).

- [ ] **Step 3: Implement** — `AuditPageResult` gains `total: number | null`; both mappers add `total: page.total ?? null`. Every `AuditPageResult` literal in the three specs gains `total: null`.

- [ ] **Step 4: Run** — `yarn vitest run src/entities/audit src/pages/account src/pages/home src/pages/audit` → PASS; `yarn lint` → clean (the literals compile).

- [ ] **Step 5: Gate and commit** — `feat(frontend-v2): the audit page result carries the journal's total`, `git add frontend-v2`, `--no-verify`, the frontend-only tail.

---

### Task 4: `shared/ui/pager`

**Files:**
- Create: `frontend-v2/src/shared/ui/pager/{index.ts,pages.ts,pages.spec.ts,pager.tsx,pager.spec.tsx,pager.fixture.tsx}`

**Interfaces:**
- Produces: `pageList(page: number, count: number): (number | "gap")[]`; `Pager({ page, pageCount, onPage, busy?, label? }: PagerProps)`.

- [ ] **Step 1: Failing `pages.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { pageList } from "./pages";

describe("pageList", () => {
  it("keeps the first, the last two and the current page's neighbours, with gaps between", () => {
    expect(pageList(1, 31)).toEqual([1, 2, "gap", 30, 31]);
    expect(pageList(5, 31)).toEqual([1, "gap", 4, 5, 6, "gap", 30, 31]);
    expect(pageList(31, 31)).toEqual([1, "gap", 30, 31]);
  });
  it("draws every page when there is no room for a gap", () => {
    expect(pageList(2, 3)).toEqual([1, 2, 3]);
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(1, 4)).toEqual([1, 2, 3, 4]);
  });
  it("clamps a page outside the count", () => {
    expect(pageList(0, 3)).toEqual([1, 2, 3]);
    expect(pageList(9, 3)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: `pages.ts`**

```ts
/** A page chip, or the "…" between two chips that are not neighbours. */
export type PageItem = number | "gap";

/**
 * Which pages a pager draws: the first, the last two, and the current page
 * with its neighbours — the mock's rule — with one gap wherever two kept pages
 * are not adjacent. `pageList(5, 31)` → `1 … 4 5 6 … 30 31`.
 */
export function pageList(page: number, count: number): PageItem[] {
  const current = Math.min(Math.max(page, 1), Math.max(count, 1));
  const keep = new Set([1, count - 1, count, current - 1, current, current + 1]);
  const out: PageItem[] = [];
  for (let i = 1; i <= count; i += 1) {
    if (!keep.has(i)) continue;
    const last = out[out.length - 1];
    if (typeof last === "number" && i - last > 1) out.push("gap");
    out.push(i);
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS. Step 5: Failing `pager.spec.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pager } from "./pager";

describe("Pager", () => {
  it("names every page chip, marks the current one and skips the gaps", () => {
    render(<Pager page={5} pageCount={31} onPage={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 5" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 30" })).not.toHaveAttribute("aria-current");
    expect(screen.getAllByRole("button", { name: /^Page \d+$/ })).toHaveLength(6);
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("disables Prev on the first page and Next on the last", () => {
    const { rerender } = render(<Pager page={1} pageCount={3} onPage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    rerender(<Pager page={3} pageCount={3} onPage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("asks for the page that was clicked, and for the neighbours from Prev and Next", async () => {
    const onPage = vi.fn();
    render(<Pager page={2} pageCount={3} onPage={onPage} />);
    await userEvent.click(screen.getByRole("button", { name: "Page 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Prev" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage.mock.calls.map(([n]) => n)).toEqual([3, 1, 3]);
  });

  it("disables every control while busy", () => {
    render(<Pager page={2} pageCount={3} onPage={vi.fn()} busy />);
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run → FAIL. Step 7: `pager.tsx`**

```tsx
import { clsx as cx } from "clsx";
import { Button } from "@/shared/ui/button";
import { pageList } from "./pages";

export type PagerProps = {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  /** A page is on its way — every control waits. */
  busy?: boolean;
  /** The navigation landmark's name. */
  label?: string;
};

const CHIP = "inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] px-1 font-mono text-[11px]";

/** Prev, the page chips with gaps, Next — the account feed's pager. */
export function Pager({ page, pageCount, onPage, busy = false, label = "Pages" }: PagerProps) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </Button>
      {pageList(page, pageCount).map((item, i) =>
        item === "gap" ? (
          <span key={`gap-${i}`} aria-hidden="true" className={cx(CHIP, "text-muted")}>
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
            disabled={busy}
            onClick={() => onPage(item)}
            className={cx(
              CHIP,
              "cursor-pointer border transition-colors duration-150 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              item === page
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-line-2 bg-panel-2 text-fg hover:border-accent-line",
            )}
          >
            {item}
          </button>
        ),
      )}
      <Button size="sm" disabled={busy || page >= pageCount} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
```

`index.ts`: `export { Pager, type PagerProps } from "./pager"; export { pageList, type PageItem } from "./pages";`. Fixture: a `p-6 flex flex-col gap-4` with `page 1 of 31`, `page 5 of 31`, `page 2 of 3`, `busy` (a local `useState` in a small `Live` component for the first).

- [ ] **Step 8: Run → PASS. Step 9: Cosmos** — restart (new fixture file); from the sdd dir `python3 measure.py "src/shared/ui/pager/pager.fixture.tsx" "" "nav button[aria-label^='Page']" "min-width,height,border-radius,font-size,border-color,background-color,color"` → 28/28/6/11px, current accent + accent-soft; `... "nav > button" "font-size,padding-top,padding-left,border-radius"` (Prev/Next) → 12px, 6/12, 6; `... "nav" "column-gap"` → 6px; both themes; rename `default-*.png` → `pager-*.png`.

- [ ] **Step 10: Gate and commit** — `feat(frontend-v2): Pager — Prev, the page chips with gaps, Next`.

---

### Task 5: the account section pages

**Files:**
- Create: `frontend-v2/src/pages/account/model/paging.ts`, `paging.spec.ts`
- Modify: `frontend-v2/src/pages/account/model/use-account.ts`, `use-account.spec.tsx`
- Modify: `frontend-v2/src/pages/account/ui/activity-section.tsx`, `activity-section.spec.tsx`, `account-page.tsx`, `account-page.spec.tsx`
- Modify: `frontend-v2/src/pages/account/account-page.fixture.tsx`

**Interfaces:**
- Consumes: `AuditPageResult.total` (Task 3), `Pager` (Task 4), `ActivityRow` (`@/entities/audit`).
- Produces: `PAGE_SIZE = 6`, `pageCount(total)`, `pageSlice(entries, page)`, `pageSummary(page, total)`, `rowsNeeded(page)`; `AccountPageProps` gains `activityTotal: number | null`, `activityPage: number`, `activityPageCount: number`, `onPage: (n: number) => void`; loses `activityHasMore`, `onLoadMore`. `ActivitySectionProps = { entries: AuditEntry[] | null; page: number; pageCount: number; summary: string; busy: boolean; onPage: (n: number) => void }`.

- [ ] **Step 1: Failing `paging.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageCount, pageSlice, pageSummary, rowsNeeded } from "./paging";

describe("paging", () => {
  it("is six a page", () => expect(PAGE_SIZE).toBe(6));
  it("counts pages, never fewer than one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(6)).toBe(1);
    expect(pageCount(7)).toBe(2);
    expect(pageCount(184)).toBe(31);
  });
  it("slices the page out of what is loaded — a short last page included", () => {
    const rows = Array.from({ length: 9 }, (_, i) => i + 1);
    expect(pageSlice(rows, 1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pageSlice(rows, 2)).toEqual([7, 8, 9]);
    expect(pageSlice(rows, 3)).toEqual([]);
  });
  it("prints the mock's range", () => {
    expect(pageSummary(1, 184)).toBe("1–6 of 184 events");
    expect(pageSummary(31, 184)).toBe("181–184 of 184 events");
    expect(pageSummary(1, 1)).toBe("1–1 of 1 events");
  });
  it("knows how many rows a page needs loaded", () => {
    expect(rowsNeeded(1)).toBe(6);
    expect(rowsNeeded(4)).toBe(24);
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: `paging.ts`**

```ts
/** The mock's page: six rows. */
export const PAGE_SIZE = 6;

/** Never fewer than one — an empty feed is one empty page, and the section draws its empty state instead. */
export const pageCount = (total: number): number => Math.max(1, Math.ceil(total / PAGE_SIZE));

export const pageSlice = <T>(rows: T[], page: number): T[] =>
  rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

/** "1–6 of 184 events" — the mock's line, en dash and all. */
export const pageSummary = (page: number, total: number): string =>
  `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} events`;

/** How many rows must be loaded before `page` can be shown in full. */
export const rowsNeeded = (page: number): number => page * PAGE_SIZE;
```

- [ ] **Step 4: Run → PASS. Step 5: Failing hook cases** — in `use-account.spec.tsx` (read its stub at line ~66: the `/api/audit/mine` branch — extend it to honour `cursor` and to send `total`), replace the "flattens the activity pages and asks for the next one on demand" case with:

```tsx
  it("shows the first six of what is loaded and reads the total off the first page", async () => {
    // stub: /api/audit/mine (no cursor) → nine entries ids 9..1, nextCursor 0, total 9
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));
    expect(ready(result).activityTotal).toBe(9);
    expect(ready(result).activityPage).toBe(1);
    expect(ready(result).activityPageCount).toBe(2);
    act(() => ready(result).onPage(2));
    expect(ready(result).activity!.map((e) => e.id)).toEqual([3, 2, 1]);
    expect(fetchCalls("/api/audit/mine")).toHaveLength(1);
  });

  it("fetches the cursor pages a far page needs, in order, then shows it", async () => {
    // stub: no cursor → ids 60..55 (6 rows), nextCursor 55, total 24;
    //       cursor=55 → 54..49, nextCursor 49; cursor=49 → 48..43, nextCursor 43;
    //       cursor=43 → 42..37, nextCursor 0
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));
    act(() => ready(result).onPage(4));
    await waitFor(() => expect(ready(result).activity!.map((e) => e.id)).toEqual([42, 41, 40, 39, 38, 37]));
    expect(cursorsAsked()).toEqual([null, 55, 49, 43]);
    expect(ready(result).activityBusy).toBe(false);
  });

  it("clamps a page past the count", async () => {
    // stub: nine entries, total 9
    const { result } = renderHook(() => useAccount(), { wrapper });
    await waitFor(() => expect(ready(result).activity).toHaveLength(6));
    act(() => ready(result).onPage(9));
    expect(ready(result).activityPage).toBe(2);
  });
```

Write `ready(result)` (narrows the union to the ready phase), `fetchCalls(path)` and `cursorsAsked()` as small helpers over the fetch mock, in the style the file already uses; keep the existing 403 → `null` case (its `activityHasMore` assertion goes).

- [ ] **Step 6: Run → FAIL. Step 7: `use-account.ts`**

```ts
  const [page, setPage] = useState(1);
  const activity = useInfiniteQuery(myAuditQuery);
  const loaded = (activity.data?.pages ?? []).flatMap((p) => p.entries);
  const total = activity.data?.pages[0]?.total ?? null;
  // The pager may ask for a page the cache does not hold yet; the API pages
  // by cursor and only forwards, so the pages in between are fetched in order
  // until the asked-for one is in. One request in flight at a time.
  const shownPage = Math.min(page, pageCount(total ?? 0));
  useEffect(() => {
    if (rowsNeeded(shownPage) > loaded.length && activity.hasNextPage && !activity.isFetching) {
      void activity.fetchNextPage();
    }
  }, [shownPage, loaded.length, activity]);
```

and in the ready return:

```ts
    activity: unanswered(activity) ? null : pageSlice(loaded, shownPage),
    activityTotal: unanswered(activity) ? null : total,
    activityPage: shownPage,
    activityPageCount: pageCount(total ?? 0),
    activityBusy: activity.isFetching,
    onPage: setPage,
```

(`activityHasMore` and `onLoadMore` deleted.) Re-check the `useEffect` deps against the exhaustive-deps rule the repo's oxlint runs; `activity` is stable per render as an object but changes identity — the rule wants it listed; that is fine since the effect's own guard stops re-runs.

- [ ] **Step 8: Run the hook spec → PASS. Step 9: Failing section and page specs**

`activity-section.spec.tsx` — replace the "counts what is on screen", the two "Show more" cases and "says nothing was recorded, and offers no footer" with:

```tsx
  it("says how the feed is paged", () => {
    render(<ActivitySection {...props()} />);
    expect(screen.getByText("newest first · 6 per page")).toBeInTheDocument();
  });

  it("prints the summary and the pager under the rows", () => {
    render(<ActivitySection {...props({ page: 1, pageCount: 31, summary: "1–6 of 184 events" })} />);
    expect(screen.getByText("1–6 of 184 events")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  });

  it("hands a page click up", async () => {
    const onPage = vi.fn();
    render(<ActivitySection {...props({ pageCount: 3, onPage })} />);
    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it("waits with the pager disabled and skeleton rows while a page is on its way", () => {
    render(<ActivitySection {...props({ entries: [], busy: true, pageCount: 3, page: 3 })} />);
    expect(screen.getByRole("status", { name: "Loading page 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("says nothing was recorded, and draws no pager", () => {
    render(<ActivitySection {...props({ entries: [], busy: false, pageCount: 1 })} />);
    expect(screen.getByText("Nothing to show yet")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });
```

with `props()` defaulting to `{ entries: ENTRIES, page: 1, pageCount: 1, summary: "1–2 of 2 events", busy: false, onPage: vi.fn() }`. The `null` case keeps its assertions minus the `/showing/` one. `account-page.spec.tsx`: the props literal drops `activityHasMore`, gains `activityTotal: 1, activityPage: 1, activityPageCount: 1, onPage: vi.fn()`; add one assertion that `1–1 of 1 events` is on screen.

- [ ] **Step 10: Run → FAIL. Step 11: `activity-section.tsx`**

```tsx
import { ActivityRow, type AuditEntry } from "@/entities/audit";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";
import { Pager } from "@/shared/ui/pager";
import { Skeleton } from "@/shared/ui/skeleton";

export type ActivitySectionProps = {
  /** The current page's rows, newest first as the gateway sent them. null is "we could not find out" (a Guest's 403). */
  entries: AuditEntry[] | null;
  page: number;
  pageCount: number;
  /** "1–6 of 184 events" */
  summary: string;
  /** A page is on its way — the pager waits, and an empty slice draws skeletons instead of "nothing". */
  busy: boolean;
  onPage: (page: number) => void;
};

/** The caller's own journal, six rows a page: what they did, to what, and when. */
export function ActivitySection({ entries, page, pageCount, summary, busy, onPage }: ActivitySectionProps) {
  const now = new Date();
  const waiting = busy && entries !== null && entries.length === 0;
  const empty = !busy && entries !== null && entries.length === 0;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-baseline gap-3 border-b border-line bg-panel-2 px-[22px] py-[18px]">
        <h2 className="m-0 text-[15px] font-semibold">My activity</h2>
        <span className="font-mono text-[10px] text-muted">newest first · 6 per page</span>
        <span aria-hidden="true" className="h-px min-w-5 flex-1 bg-line" />
      </div>

      {entries === null ? (
        <div className="p-[22px]"><Callout tone="warn">Your activity could not be loaded.</Callout></div>
      ) : empty ? (
        <div className="p-[22px]">
          <EmptyState title="Nothing to show yet" description="The journal returned no actions for this account. Anything you do from here appears as it happens." />
        </div>
      ) : (
        <>
          {waiting ? (
            <div role="status" aria-busy="true" aria-label={`Loading page ${page}`} className="flex flex-col gap-3 px-[22px] py-3.5">
              <Skeleton height="16px" width="40%" />
              <Skeleton height="16px" width="55%" />
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {entries.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} now={now} className="px-[22px] py-3.5" />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-[22px] py-3.5">
            <span className="font-mono text-[10px] text-muted">{summary}</span>
            <Pager page={page} pageCount={pageCount} busy={busy} onPage={onPage} />
          </div>
        </>
      )}
    </section>
  );
}
```

`account-page.tsx`: props per the Interfaces block; `<ActivitySection entries={props.activity} page={props.activityPage} pageCount={props.activityPageCount} summary={props.activityTotal === null ? "" : pageSummary(props.activityPage, props.activityTotal)} busy={props.activityBusy} onPage={props.onPage} />` (import `pageSummary` from `../model/paging`). Fixture: `base` gets `activityTotal: 9, activityPage: 1, activityPageCount: 2, onPage: () => {}` and `activity: ACTIVITY.slice(0, 6)` (add rows to `ACTIVITY` so it holds nine); a `"page 2"` state with `activity: ACTIVITY.slice(6), activityPage: 2`; `"empty activity"` → `activity: [], activityTotal: 0, activityPageCount: 1`; `"activity unavailable"` → `activity: null, activityTotal: null`; `loading` → `activity: [], activityBusy: true`.

- [ ] **Step 12: Run** — `yarn vitest run src/pages/account src/pages/home` → PASS (Home's use of the feed is untouched).

- [ ] **Step 13: Cosmos + live** — restart Cosmos; `python3 measure.py "src/pages/account/account-page.fixture.tsx" "ready" "section:has(h2) li" "padding-top,padding-left"` → 14/22; `... "ready" "nav[aria-label='Pages'] button[aria-current]" "border-color,background-color"` → accent / accent-soft; screenshots `account-pager-*.png`. Live on :3001 as `admin` (stack rebuilt in Task 2): `/account` reads `1–6 of N events` with `N` equal to `curl … /api/audit/mine | jq .total`; click `Page 2` → rows 7–12 and `7–12 of N events`; the last chip → the remainder; `guest1` → the warn callout. Count `document` loads across the clicks (0). Screenshots `live-pager-*.png`.

- [ ] **Step 14: Gate and commit** — `feat(frontend-v2): My activity pages by six — the pager, the summary, the cursor pages fetched on demand`.

---

### Task 6: Docs

- Root `CLAUDE.md`, the `GET /api/audit/mine` bullet: "… It also carries `total` — how many rows the same filters match, paging aside — because the account page pages by number; `GET /api/audit` does not (`include_total` is set only by the `/mine` handler), it is polled and would pay for the count on every tick."
- `frontend-v2/CLAUDE.md`, the account paragraph: the feed pages by six over the shared cursor query; a far page fetches the cursor pages in between (`rowsNeeded`), one in flight at a time; `Pager` is `shared/ui/pager` with `pageList`'s rule; the summary is `pageSummary`. Sentences name files that exist.
- Commit `docs: the account feed's total and its pager`.

---

## Verification (controller)

Backend gate green on the quiet tree; frontend gate green; the live `/account` pass as `admin`, `cotest` (Company Owner: total equals its own rows only), `guest1` (callout); `GET /api/audit` still answers without `total` and the console journal still follows.
