# Required two-factor and the 15m metrics range — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator require a second factor of an account, enforce it
at the gateway without locking the account out of enrolling, and accept the
dashboard's 15-minute range.

**Architecture:** A `totp_required` column on `auth-service`'s `users` table
holds the policy; `twofa-service` keeps owning the fact of enrollment.
`ValidateToken` derives "this session must enroll before it may do anything
else" on every request rather than storing it on the session, which is how
requiring 2FA of an already-signed-in user takes effect immediately and how
enrolling clears it with no session surgery. The gateway's `Authenticate`
middleware refuses such a session every path outside a small allow-list.

**Tech Stack:** Go 1.27, chi v5, pgx v5, goose migrations, buf + protoc,
oapi-codegen, testify/suite + minimock, gotest.tools/assert.

**Spec:** `docs/superpowers/specs/2026-09-02-required-two-factor-and-15m-range-design.md`

## Global Constraints

- **A parallel session works in `backend/` in this same clone.** Stage by path
  (`git add backend/services/auth-service`, and so on) — never `git add -A` or
  `git add .`. Check `git diff --cached --name-only` before every commit.
- **`make -C backend check` is the gate** — gofmt, `go mod tidy` drift,
  `GOWORK=off go vet`, golangci-lint, `go test -race -shuffle=on`, govulncheck.
  ~4 min. Run it before each commit; it is what `.githooks/pre-commit` and
  `.github/workflows/backend.yml` both run.
- **Run it as `CC=/usr/bin/clang CXX=/usr/bin/clang++ make -C backend check`.**
  This machine's Homebrew llvm 22.1.8 is linked against `libz3.4.16.dylib`
  while z3 5.1.0 is what is installed, so `runtime/cgo` fails to load and both
  `go vet` and `-race` die before running a line of our code. Xcode's clang has
  no such problem. Verified green on a clean tree before this plan started.
- **A `govulncheck` failure on `dial tcp: lookup vuln.go.dev` is not your
  failure.** It reads a remote database and this network drops out often; retry
  once, and if it still cannot resolve, say so in your report and move on. CI
  runs the same target with a working network.
- **Before editing any Go file**, run the modern-Go guideline list for it:
  `sh ~/.claude/plugins/cache/goland-claude-marketplace/modern-go-guidelines/1.1.1/skills/use-modern-go/scripts/run-tool.sh list --file-path <file>`
  and follow what applies. `slices.Contains`, `any`, `errors.Is`, `min`/`max`
  are the ones this plan's code touches.
- **Regeneration is a Makefile target, never hand-editing generated files.**
  `make -C backend proto-gen` after any `.proto` change;
  `make -C backend openapi-gen` after any `api/openapi.yaml` change.
  `proto/gen/**` and `internal/transport/httpapi/openapi_gen.go` are outputs.
- **Migrations are goose**, named `NNNNN_snake_case.sql`, with both
  `-- +goose Up` and `-- +goose Down` sections wrapped in
  `-- +goose StatementBegin` / `StatementEnd`.
- **Error slugs come from `pkg/apperr`**, and a client-visible code must be a
  named constant there, never an inline string.

---

### Task 1: Accept a 15-minute metrics range

Self-contained and unrelated to the rest — it can ship first and alone.

**Files:**
- Modify: `backend/services/gateway-service/internal/metrics/query.go` (the `rangeSeconds` map)
- Modify: `backend/services/gateway-service/api/openapi.yaml` (the `range` enum, ~line 2178)
- Modify: `backend/services/gateway-service/internal/metrics/query_test.go` (the window loop, ~line 30)
- Regenerate: `backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks use. `GET /api/metrics/query?panel=…&range=15m`
  answers 200 instead of 400.

- [ ] **Step 1: Extend the existing step test to cover the new window**

`stepSeconds` must return a whole number of 15-second scrapes for every
allowed window. Add `900` to the loop rather than writing a new case — it is
the same property.

In `query_test.go`, change:

```go
	for _, window := range []int{3600, 21600, 86400, 604800} {
```

to:

```go
	for _, window := range []int{900, 3600, 21600, 86400, 604800} {
```

- [ ] **Step 2: Add a test that the range is accepted at all**

Append to `query_test.go`:

```go
// The dashboard's shortest window. 900/200 rounds below one scrape, so the
// floor in stepSeconds is what keeps the step legal.
func (s *QuerySuite) TestFifteenMinuteRangeIsAllowed() {
	window, ok := rangeSeconds["15m"]
	assert.Assert(s.T(), ok, "15m missing from the range allow-list")
	assert.Equal(s.T(), window, 900)
	assert.Equal(s.T(), stepSeconds(window), 15)
}
```

- [ ] **Step 3: Run the tests and watch them fail**

```bash
cd backend && go test ./services/gateway-service/internal/metrics/... -run Query -v
```

Expected: FAIL — `15m missing from the range allow-list`.

- [ ] **Step 4: Add the range**

In `query.go`, inside `rangeSeconds`, add the entry above `1h` so the map reads
shortest-first:

```go
var rangeSeconds = map[string]int{
	"15m": 900,
	// ... the existing entries, unchanged
}
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd backend && go test ./services/gateway-service/internal/metrics/... -run Query -v
```

Expected: PASS.

- [ ] **Step 6: Widen the OpenAPI enum**

In `api/openapi.yaml`, under `/api/metrics/query` → `parameters` → the `range`
parameter, change:

```yaml
          schema: { type: string, enum: [1h, 6h, 24h, 7d] }
```

to:

```yaml
          schema: { type: string, enum: [15m, 1h, 6h, 24h, 7d] }
```

- [ ] **Step 7: Regenerate and run the full gate**

```bash
make -C backend openapi-gen
CC=/usr/bin/clang CXX=/usr/bin/clang++ make -C backend check
```

Expected: both succeed. `openapi_gen.go` shows the new enum value.

- [ ] **Step 8: Commit**

```bash
git add backend/services/gateway-service
git diff --cached --name-only   # must list nothing outside gateway-service
git commit -m "feat(metrics): accept the dashboard's 15m range

900/200 rounds below one scrape, so stepSeconds' floor gives 60 points at
15s — denser relative to its window than the longer ranges, which is what a
short range is for."
```

---

### Task 2: Carry `totp_required` on the user (read path)

The column, the domain field, and every read that already returns a user. No
way to set it yet — that is Task 3.

**Files:**
- Create: `backend/services/auth-service/internal/migrate/migrations/00016_totp_required.sql`
- Modify: `backend/services/auth-service/internal/domain/user.go`
- Modify: `backend/services/auth-service/internal/storage/users/models.go`
- Modify: `backend/services/auth-service/internal/storage/users/get.go` (`scanUser`)
- Modify: `backend/proto/rosneft/auth/v1/auth.proto` (`message User`)
- Modify: `backend/services/auth-service/internal/transport/grpcapi/users.go` (`userToProto`)
- Modify: `backend/services/gateway-service/api/openapi.yaml` (`AuthUser` schema)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `domain.User.TOTPRequired bool`
  - proto `User.totp_required` (field 13) → Go `GetTotpRequired() bool`
  - JSON `AuthUser.totpRequired: boolean` on every `/api/auth/users*` response
    and `/api/auth/me`

- [ ] **Step 1: Write the migration**

Create `00016_totp_required.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN totp_required BOOLEAN NOT NULL DEFAULT FALSE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN totp_required;
-- +goose StatementEnd
```

- [ ] **Step 2: Add the domain field**

In `domain/user.go`, inside `type User struct`, below `IsOwner`:

```go
	// TOTPRequired is policy, not fact: it says an administrator has decided
	// this account must carry a second factor. Whether one is enrolled is
	// twofa-service's answer, and the two are deliberately kept apart — folded
	// together, a twofa-service outage would be indistinguishable from a user
	// who has simply not enrolled yet.
	TOTPRequired bool
```

- [ ] **Step 3: Select and scan the column**

In `storage/users/models.go`:

```go
const userColumns = `u.id, u.email, u.username, u.password_hash, u.status,
	u.created_at, u.updated_at, u.deleted_at, u.created_by, u.is_owner,
	u.onboarding_tours_seen, u.totp_required`
```

In `storage/users/get.go`, `scanUser` — the scan order must match the column
list exactly:

```go
func scanUser(r rowScanner) (domain.User, error) {
	var u domain.User
	err := r.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.Status,
		&u.CreatedAt, &u.UpdatedAt, &u.DeletedAt, &u.CreatedBy, &u.IsOwner,
		&u.OnboardingToursSeen, &u.TOTPRequired)
	return u, err
}
```

- [ ] **Step 4: Add the proto field and regenerate**

In `proto/rosneft/auth/v1/auth.proto`, inside `message User`, after
`role_titles = 12;`:

```proto
  // Policy: an administrator requires a second factor of this account.
  // totp_enabled (field 5) is the separate question of whether one is enrolled.
  bool totp_required = 13;
```

```bash
make -C backend proto-gen
```

- [ ] **Step 5: Map it into the proto**

In `grpcapi/users.go`, in `userToProto`, add to the struct literal:

```go
		TotpRequired: u.TOTPRequired,
```

- [ ] **Step 6: Add it to the HTTP contract**

In `api/openapi.yaml`, in the `AuthUser` schema's `properties`, beside
`isOwner`:

```yaml
        totpRequired:
          type: boolean
          description: >
            An administrator requires a second factor of this account. Distinct
            from totpEnabled, which reports whether one is enrolled.
```

Then:

```bash
make -C backend openapi-gen
```

- [ ] **Step 7: Run the gate**

```bash
CC=/usr/bin/clang CXX=/usr/bin/clang++ make -C backend check
```

Expected: PASS.

**What this does not cover.** `auth-service` has no storage tests against a
database — only `pick_owning_admin_test.go`, which is pure. A `userColumns`
list that disagrees with `scanUser`'s destinations is a **runtime** pgx error,
not a compile error, so nothing here catches it. The integration suite that
does is written in Task 3, where there is finally something to write to.
Until then, treat the column list and the scan order as one edit and check
them against each other by eye before committing.

- [ ] **Step 8: Commit**

```bash
git add backend/services/auth-service backend/proto backend/services/gateway-service/api
git diff --cached --name-only
git commit -m "feat(auth): carry totp_required on the user

Policy, kept apart from twofa-service's enrollment fact so an outage there
stays distinguishable from an account that has not enrolled. Read path only
— nothing can set it yet."
```

---

### Task 3: Set the flag (storage, service, gRPC)

**Files:**
- Create: `backend/services/auth-service/internal/storage/users/set_totp_required.go`
- Create: `backend/services/auth-service/internal/service/users/set_totp_required.go`
- Create: `backend/services/auth-service/internal/service/users/set_totp_required_test.go`
- Modify: `backend/proto/rosneft/auth/v1/auth.proto` (service + two messages)
- Modify: `backend/services/auth-service/internal/transport/grpcapi/users.go`

**Interfaces:**
- Consumes: `domain.User.TOTPRequired` (Task 2).
- Produces:
  - `(*users.Store).SetTOTPRequired(ctx, id string, required bool) (domain.User, error)`
  - `(*users.Service).SetTOTPRequired(ctx, actorID string, scopeAll bool, id string, required bool) (domain.User, error)`
  - RPC `SetUserTOTPRequired(SetUserTOTPRequiredRequest) returns (User)` with
    fields `token`, `id`, `required`

- [ ] **Step 1: Write the failing service test**

Create `service/users/set_totp_required_test.go`. It mirrors the freeze suite's
shape — ownership is checked, the store is called, the refreshed user comes
back. There is no self-target guard here on purpose: requiring a second factor
of yourself locks nobody out, because the enrollment path stays open.

```go
package users_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

type SetTOTPRequiredSuite struct {
	suite.Suite
}

func TestSetTOTPRequiredSuite(t *testing.T) { suite.Run(t, new(SetTOTPRequiredSuite)) }

func (s *SetTOTPRequiredSuite) TestRequiresAndReturnsTheRefreshedUser() {
	mc := minimock.NewController(s.T())
	store := mocks.NewStoreMock(mc)
	svc := users.New(store, nil)
	ctx := s.T().Context()

	store.GetByIDMock.Expect(ctx, "u-1").Return(domain.User{ID: "u-1"}, nil)
	store.SetTOTPRequiredMock.Expect(ctx, "u-1", true).
		Return(domain.User{ID: "u-1", TOTPRequired: true}, nil)

	got, err := svc.SetTOTPRequired(ctx, "actor-1", true, "u-1", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.TOTPRequired, true)
}

// Requiring an account that is already required is the same state, not a
// transition, so it answers success rather than a conflict.
func (s *SetTOTPRequiredSuite) TestIsIdempotent() {
	mc := minimock.NewController(s.T())
	store := mocks.NewStoreMock(mc)
	svc := users.New(store, nil)
	ctx := s.T().Context()

	store.GetByIDMock.Expect(ctx, "u-1").Return(domain.User{ID: "u-1", TOTPRequired: true}, nil)
	store.SetTOTPRequiredMock.Expect(ctx, "u-1", true).
		Return(domain.User{ID: "u-1", TOTPRequired: true}, nil)

	got, err := svc.SetTOTPRequired(ctx, "actor-1", true, "u-1", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.TOTPRequired, true)
}
```

The constructor is `users.New(store Store, sessions Sessions)`; `Sessions` is
nil here because `SetTOTPRequired` evicts nothing — unlike `Freeze`, which kills
the account's sessions. `ownership(ctx, actorID, scopeAll, id)` calls
`store.GetByID` first, which is why both cases expect it.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && go test ./services/auth-service/internal/service/users/... -run SetTOTPRequired -v
```

Expected: FAIL — `svc.SetTOTPRequired undefined` and
`store.SetTOTPRequiredMock undefined`.

- [ ] **Step 3: Add the store method**

Create `storage/users/set_totp_required.go`, following `set_status.go`
exactly — `audittx.Run` is what attributes the change in the journal:

```go
package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetTOTPRequired flips the second-factor policy on one account and returns the
// refreshed user. Wrapped in audittx.Run so the change is attributed, exactly
// as freezing is.
func (s *Store) SetTOTPRequired(ctx context.Context, id string, required bool) (domain.User, error) {
	const q = `UPDATE users SET totp_required = $2, updated_at = now()
		WHERE id = $1 RETURNING id`

	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var got string
		return tx.QueryRow(ctx, q, id, required).Scan(&got)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.SetTOTPRequired: %w", err)
	}
	return s.GetByID(ctx, id)
}
```

- [ ] **Step 4: Add the method to the store interface and regenerate its mock**

Add to the `Store` interface in `service/users/users.go:15`, after `SetOwner`:

```go
	SetTOTPRequired(ctx context.Context, id string, required bool) (domain.User, error)
```

The mocks are minimock's, generated by the directive already on line 12 of that
file (`//go:generate minimock -i Store,Sessions -o ./mocks -s _mock.go`):

```bash
cd backend && go generate ./services/auth-service/internal/service/users/...
```

- [ ] **Step 5: Add the service method**

Create `service/users/set_totp_required.go`:

```go
package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetTOTPRequired records that an account must (or need not) carry a second
// factor. Owner-scoped like every other change to somebody else's account.
//
// No self-target guard, unlike Freeze and SoftDelete: those exist because an
// admin can lock themselves or the last admin out, while requiring a second
// factor of yourself locks nobody out — the enrollment path stays open to a
// required-but-not-enrolled session by design.
func (s *Service) SetTOTPRequired(ctx context.Context, actorID string, scopeAll bool, id string, required bool) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	return s.store.SetTOTPRequired(ctx, id, required)
}
```

- [ ] **Step 6: Run the test and watch it pass**

```bash
cd backend && go test ./services/auth-service/internal/service/users/... -run SetTOTPRequired -v
```

Expected: PASS.

- [ ] **Step 7: Add the RPC**

In `proto/rosneft/auth/v1/auth.proto`, in the service block after
`rpc SetUserOwner(...)`:

```proto
  rpc SetUserTOTPRequired(SetUserTOTPRequiredRequest) returns (User);
```

and beside `SetUserOwnerRequest`:

```proto
message SetUserTOTPRequiredRequest {
  string token = 1; // actor resolved server-side from the session
  string id = 2;
  bool required = 3;
}
```

```bash
make -C backend proto-gen
```

- [ ] **Step 8: Add the gRPC handler**

In `grpcapi/users.go`, after `UnfreezeUser`:

```go
func (s *Server) SetUserTOTPRequired(ctx context.Context, req *authv1.SetUserTOTPRequiredRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.SetTOTPRequired(ctx, actorID, scopeAll, req.GetId(), req.GetRequired())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}
```

- [ ] **Step 9: Cover the column against a real database**

Nothing so far proves the migration applies, or that `userColumns` and
`scanUser` agree — a mismatch there is a runtime pgx error and `auth-service`
has no storage tests against a database at all. Write the first one, copying
the shape of
`backend/services/catalog-service/internal/storage/resolve_blob_access_integration_test.go`:
a `//go:build integration` file, a testcontainers Postgres, `migrate` run
against it, then the round trip.

Create
`backend/services/auth-service/internal/storage/users/set_totp_required_integration_test.go`:

```go
//go:build integration

package users_test

// Suite scaffolding — container, pool, migrate — mirrors
// catalog-service/internal/storage/resolve_blob_access_integration_test.go.
// Copy its SetupSuite/TearDownSuite verbatim, swapping catalog's migrate
// package for auth-service's.

// A new account is not required to carry a second factor.
func (s *TOTPRequiredSuite) TestDefaultsToFalse() {
	u := s.createUser("a@example.com", "a")
	assert.Equal(s.T(), u.TOTPRequired, false)
}

// The round trip is what proves the column list and the scan destinations
// agree: they are two separate edits, and pgx only complains at runtime.
func (s *TOTPRequiredSuite) TestSetAndReadBack() {
	u := s.createUser("b@example.com", "b")

	got, err := s.store.SetTOTPRequired(s.T().Context(), u.ID, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.TOTPRequired, true)

	reread, err := s.store.GetByID(s.T().Context(), u.ID)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), reread.TOTPRequired, true)
}

// Unrequiring is the same statement with the other value, and it must not
// disturb anything else on the row.
func (s *TOTPRequiredSuite) TestUnrequireLeavesTheRestAlone() {
	u := s.createUser("c@example.com", "c")
	_, err := s.store.SetTOTPRequired(s.T().Context(), u.ID, true)
	assert.NilError(s.T(), err)

	got, err := s.store.SetTOTPRequired(s.T().Context(), u.ID, false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.TOTPRequired, false)
	assert.Equal(s.T(), got.Email, u.Email)
	assert.Equal(s.T(), got.Status, u.Status)
}
```

Run it — the tag keeps it out of `make check`, so it needs asking for by name:

```bash
cd backend && go test -tags integration ./services/auth-service/internal/storage/users/... -v
```

Expected: PASS, three tests. If Docker is not running, testcontainers fails to
start — say so in your report rather than deleting the suite.

- [ ] **Step 10: Run the gate and commit**

```bash
CC=/usr/bin/clang CXX=/usr/bin/clang++ make -C backend check
git add backend/services/auth-service backend/proto
git diff --cached --name-only
git commit -m "feat(auth): set a second-factor requirement on an account

Owner-scoped, idempotent, attributed through audittx like freeze. No
self-target guard: requiring a second factor of yourself locks nobody out,
because the enrollment path stays open to a required session."
```

---

### Task 4: Expose require / unrequire on the gateway

**Files:**
- Modify: `backend/services/gateway-service/internal/clients/auth/users.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/users.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/mount.go` (~line 47)
- Modify: `backend/services/gateway-service/api/openapi.yaml`

**Interfaces:**
- Consumes: RPC `SetUserTOTPRequired` (Task 3).
- Produces:
  - `POST /api/auth/users/{id}/2fa/require` → 200 `AuthUser`
  - `POST /api/auth/users/{id}/2fa/unrequire` → 200 `AuthUser`

- [ ] **Step 1: Add the client method**

In `clients/auth/users.go`, after `UnfreezeUser`:

```go
// SetUserTOTPRequired passes the actor's session token; the auth-service
// resolves the acting user from it.
func (c *Client) SetUserTOTPRequired(ctx context.Context, token, id string, required bool) (*authv1.User, error) {
	return c.cc.SetUserTOTPRequired(ctx, &authv1.SetUserTOTPRequiredRequest{
		Token: token, Id: id, Required: required,
	})
}
```

- [ ] **Step 2: Add the two handlers**

In `authhttp/users.go`, after `unfreezeUser`:

```go
func (h *Handlers) requireUser2FA(w http.ResponseWriter, r *http.Request) {
	h.setUser2FARequired(w, r, true)
}

func (h *Handlers) unrequireUser2FA(w http.ResponseWriter, r *http.Request) {
	h.setUser2FARequired(w, r, false)
}

func (h *Handlers) setUser2FARequired(w http.ResponseWriter, r *http.Request, required bool) {
	u, err := h.client.SetUserTOTPRequired(r.Context(), sessionToken(r), chi.URLParam(r, "id"), required)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))
}
```

- [ ] **Step 3: Mount them**

In `authhttp/mount.go`, after the `unfreeze` line:

```go
			pr.With(h.Require("users:write")).Post("/users/{id}/2fa/require", h.requireUser2FA)
			pr.With(h.Require("users:write")).Post("/users/{id}/2fa/unrequire", h.unrequireUser2FA)
```

`users:write` rather than `users:freeze`: this is a change to the account's
policy, which is what `users:write` already carries; `users:freeze` is the
narrower grant for taking an account out of service.

No `routePerms` entry is needed. That map backs `RequirePermissionForRoute`,
which gates the `/api` sub-router and **fails open** — a route missing from it
is authenticated but unauthorised. The `/api/auth` routes do not rely on it:
they carry their permission inline through `h.Require`, exactly as `freeze`
does two lines above.

- [ ] **Step 4: Document them**

In `api/openapi.yaml`, beside `/api/auth/users/{id}/freeze`:

```yaml
  /api/auth/users/{id}/2fa/require:
    post:
      tags: [auth]
      summary: Require a second factor of a user (requires users:write)
      description: >
        Idempotent — requiring an already-required account answers 200. The user
        keeps signing in, but their session may reach only the enrollment
        endpoints until a second factor is enrolled.
      security: [{ bearerAuth: [] }]
      parameters:
        - { in: path, name: id, required: true, schema: { type: string } }
      responses:
        '200':
          description: Updated user
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AuthUser' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /api/auth/users/{id}/2fa/unrequire:
    post:
      tags: [auth]
      summary: Stop requiring a second factor of a user (requires users:write)
      description: Idempotent. Does not disable an enrolled second factor.
      security: [{ bearerAuth: [] }]
      parameters:
        - { in: path, name: id, required: true, schema: { type: string } }
      responses:
        '200':
          description: Updated user
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AuthUser' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
```

- [ ] **Step 5: Regenerate, run the gate, commit**

```bash
make -C backend openapi-gen
make -C backend check
git add backend/services/gateway-service
git diff --cached --name-only
git commit -m "feat(gateway): require and unrequire a second factor of a user

Behind users:write — a change to the account's policy, not the narrower
users:freeze that takes an account out of service. Both idempotent."
```

---

### Task 5: `ValidateToken` reports that a session must enroll

**Files:**
- Modify: `backend/proto/rosneft/auth/v1/auth.proto` (`ValidateTokenResponse`)
- Modify: `backend/services/auth-service/internal/service/auth/validate_token.go` (grep for `func (s *Service) ValidateToken`)
- Modify: `backend/services/auth-service/internal/service/auth/validate_token_test.go`
- Modify: `backend/services/auth-service/internal/transport/grpcapi/` — the `ValidateToken` handler
- Modify: `backend/services/gateway-service/internal/clients/auth/` — the `ValidateToken` wrapper
- Modify: `backend/services/gateway-service/internal/transport/authhttp/middleware.go:26`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/audit.go:91`

**Interfaces:**
- Consumes: `domain.User.TOTPRequired` (Task 2), the existing
  `TwoFAVerifier.IsEnabled(ctx, userID) (bool, error)`.
- Produces: `ValidateToken` gains a `mustEnroll bool` return **before** `err`:
  `(userID string, perms []string, isOwner bool, owningAdmin, auditCompany string, mustEnroll bool, err error)`.
  Both existing call sites are positional and the compiler finds them.

Deriving this per request rather than stamping it on the session at login is a
deliberate change from the spec's wording, for the reason the code already
states: *"Authorization is re-read from the database on each ValidateToken, so
nothing role-derived is stored."* Deriving it means requiring 2FA of a
signed-in user takes effect on their next request, and enrolling clears the
restriction with no session surgery.

- [ ] **Step 1: Write the failing tests**

Append to `validate_token_test.go`:

```go
// Policy without enrollment restricts the session. The twofa round trip is paid
// only when the flag is set, which is never for an ordinary account.
func (s *ValidateTokenSuite) TestRequiredButNotEnrolledMustEnroll() {
	u := domain.User{ID: "u-1", TOTPRequired: true}
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "u-1"}, nil)
	s.us.GetByIDMock.Expect(s.ctx, "u-1").Return(u, nil)
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "u-1").Return("company-1", nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u-1").Return(false, nil)

	_, _, _, _, _, mustEnroll, err := s.svc.ValidateToken(s.ctx, "tok")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), mustEnroll, true)
}

func (s *ValidateTokenSuite) TestRequiredAndEnrolledIsUnrestricted() {
	u := domain.User{ID: "u-1", TOTPRequired: true}
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "u-1"}, nil)
	s.us.GetByIDMock.Expect(s.ctx, "u-1").Return(u, nil)
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "u-1").Return("company-1", nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u-1").Return(true, nil)

	_, _, _, _, _, mustEnroll, err := s.svc.ValidateToken(s.ctx, "tok")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), mustEnroll, false)
}

// The ordinary account: no flag, so no twofa call is made at all. minimock
// fails the test if IsEnabled is called without an expectation.
func (s *ValidateTokenSuite) TestUnrequiredCostsNoTwoFACall() {
	u := domain.User{ID: "u-1"}
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "u-1"}, nil)
	s.us.GetByIDMock.Expect(s.ctx, "u-1").Return(u, nil)
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "u-1").Return("company-1", nil)

	_, _, _, _, _, mustEnroll, err := s.svc.ValidateToken(s.ctx, "tok")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), mustEnroll, false)
}
```

The three existing cases in this file destructure six values and will stop
compiling; add one `_` before `err` in each.

- [ ] **Step 2: Run and watch it fail**

```bash
cd backend && go test ./services/auth-service/internal/service/auth/... -run ValidateToken -v
```

Expected: FAIL to compile — `assignment mismatch: 7 variables but ValidateToken returns 6 values`.

- [ ] **Step 3: Widen the proto and regenerate**

In `ValidateTokenResponse`:

```proto
  // The account is required to carry a second factor and has not enrolled one.
  // The gateway restricts such a session to the enrollment endpoints.
  bool must_enroll_two_factor = 6;
```

```bash
make -C backend proto-gen
```

- [ ] **Step 4: Derive it in the service**

In `validate_token.go`, after the user is loaded and before returning, add:

```go
	// Only a required account pays the twofa round trip, so the ordinary
	// request is unchanged. Derived per request rather than stamped on the
	// session: requiring a second factor of a signed-in user then takes effect
	// on their next request, and enrolling lifts the restriction by itself.
	mustEnroll := false
	if u.TOTPRequired {
		enabled, err := s.twofa.IsEnabled(ctx, u.ID)
		if err != nil {
			return "", nil, false, "", "", false, err
		}
		mustEnroll = !enabled
	}
```

and thread `mustEnroll` through the signature and every return in the function.

- [ ] **Step 5: Run and watch it pass**

```bash
cd backend && go test ./services/auth-service/internal/service/auth/... -run ValidateToken -v
```

Expected: PASS.

- [ ] **Step 6: Thread it through the gRPC handler and the gateway client**

The auth-service handler sets `MustEnrollTwoFactor` on the response; the
gateway's client returns it as a seventh value. In
`authhttp/middleware.go:26`:

```go
		uid, perms, isOwner, owningAdmin, auditCompany, _, err := h.client.ValidateToken(r.Context(), token)
```

and in `authhttp/audit.go:91`, add one `_`:

```go
	if uid, _, _, _, company, _, err := h.client.ValidateToken(r.Context(), token); err == nil {
```

**Both positions take `_`, not a named variable.** Nothing consumes the new
value until Task 6 builds the gate, and Go rejects a declared-and-unused local
— naming it here does not compile. Task 6 replaces this whole function anyway.

- [ ] **Step 7: Run the gate and commit**

```bash
CC=/usr/bin/clang CXX=/usr/bin/clang++ make -C backend check
git add backend/services/auth-service backend/proto backend/services/gateway-service
git diff --cached --name-only
git commit -m "feat(auth): ValidateToken reports a session that must enroll 2FA

Derived per request from the account's policy and twofa-service's answer,
not stamped on the session — authorization here is already re-read every
time, and deriving it makes 'require' take effect on the next request and
'enroll' lift the restriction by itself. Only a required account pays the
extra round trip. Nothing acts on it yet."
```

---

### Task 6: Refuse a session that must enroll

**Files:**
- Modify: `backend/pkg/apperr/apperr.go` (one slug)
- Create: `backend/services/gateway-service/internal/transport/authhttp/enrollment.go`
- Create: `backend/services/gateway-service/internal/transport/authhttp/enrollment_test.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/middleware.go` (`Authenticate`)

**Interfaces:**
- Consumes: `mustEnroll` from `ValidateToken` (Task 5).
- Produces: `enrollmentAllows(path string) bool`, and the behaviour that a
  must-enroll session gets **403 `twofa_enrollment_required`** on every path
  outside the allow-list.

The gate lives **inside `Authenticate`**, not as a separate middleware.
`Authenticate` is applied in six places (`/api/assets/{hash}` twice,
`/api/jobs/{id}/events`, `/api/metrics/query`, `/api/audit.csv`, and the `/api`
sub-router), and a seventh added later must inherit the gate rather than have
to remember it. This is the same reasoning that made `RequireTerritoryAccess`
key on a route-pattern prefix after a per-handler check was remembered three
times out of thirteen.

- [ ] **Step 1: Write the failing predicate test**

Create `enrollment_test.go`:

```go
package authhttp

import "testing"

func TestEnrollmentAllows(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/api/auth/me", true},
		{"/api/auth/logout", true},
		{"/api/auth/2fa/setup", true},
		{"/api/auth/2fa/enable", true},
		{"/api/auth/2fa/recovery/regenerate", true},

		{"/api/territories", false},
		{"/api/auth/users", false},
		{"/api/auth/2fa/disable", false},   // enrolled is the point; disabling is not
		{"/api/metrics/query", false},
		{"/api/assets/deadbeef", false},

		// Deny by default, including near-misses on an allowed prefix.
		{"/api/auth/me/password", false},
		{"/api/auth/2fa/setupx", false},
		{"/api/auth/2fa/setup/", false},
		{"", false},
	}
	for _, c := range cases {
		if got := enrollmentAllows(c.path); got != c.want {
			t.Errorf("enrollmentAllows(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd backend && go test ./services/gateway-service/internal/transport/authhttp/... -run EnrollmentAllows -v
```

Expected: FAIL — `undefined: enrollmentAllows`.

- [ ] **Step 3: Write the predicate**

Create `enrollment.go`:

```go
package authhttp

import "slices"

// enrollmentPaths is everything a session that still owes a second factor may
// reach: read who you are, sign out, and enroll. Nothing else.
//
// Exact matches, never prefixes. A prefix match would open /api/auth/me/password
// along with /api/auth/me, and the whole point of this list is that adding a
// route does not quietly widen it.
var enrollmentPaths = []string{
	"/api/auth/me",
	"/api/auth/logout",
	"/api/auth/2fa/setup",
	"/api/auth/2fa/enable",
	"/api/auth/2fa/recovery/regenerate",
}

// enrollmentAllows reports whether a session that must enroll a second factor may
// reach this path. It denies by default: a route added later is refused until
// somebody deliberately lists it here.
func enrollmentAllows(path string) bool {
	return slices.Contains(enrollmentPaths, path)
}
```

- [ ] **Step 4: Run and watch it pass**

```bash
cd backend && go test ./services/gateway-service/internal/transport/authhttp/... -run EnrollmentAllows -v
```

Expected: PASS.

- [ ] **Step 5: Add the error slug**

In `pkg/apperr/apperr.go`, in the slug block:

```go
	SlugTwoFAEnrollmentRequired = "twofa_enrollment_required"
```

A distinct code, not a bare `forbidden`: the SPA has to tell "enroll a second
factor" apart from "you don't have permission", and it cannot do that from a
403 alone.

- [ ] **Step 6: Write the failing route test**

A pure predicate is not a route test. The desktop shell shipped a
vulnerability with its predicate correct and its caller passing the wrong
input; cover both levels.

`Handlers.client` is a concrete `*auth.Client` with no interface behind it, so
there is nothing to fake — which is why no existing test drives `Authenticate`.
Rather than turn a nine-method client into an interface, pull the middleware's
body out over the one function it needs. That is the same move the repo already
makes for decisions that need a test.

Append to `enrollment_test.go` — **the file already has a `package authhttp`
clause and a `testing` import from Step 1; merge these imports into that one
header rather than pasting a second one**:

```go
// merge into the existing import block:
//   "context"
//   "net/http"
//   "net/http/httptest"
//   "strings"
//   "github.com/vbncursed/rosneft/backend/pkg/apperr"

func okValidator(mustEnroll bool) validateFunc {
	return func(context.Context, string) (string, []string, bool, string, string, bool, error) {
		return "u-1", nil, false, "company-1", "company-1", mustEnroll, nil
	}
}

// A session that owes a second factor reaches the enrollment endpoints and
// nothing else.
func TestAuthenticateGatesASessionThatMustEnroll(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	for path, want := range map[string]int{
		"/api/auth/2fa/setup": http.StatusOK,
		"/api/auth/me":        http.StatusOK,
		"/api/territories":    http.StatusForbidden,
		"/api/auth/users":     http.StatusForbidden,
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer tok")
		rec := httptest.NewRecorder()

		authenticate(okValidator(true), next).ServeHTTP(rec, req)

		if rec.Code != want {
			t.Errorf("%s: got %d, want %d", path, rec.Code, want)
		}
		if want == http.StatusForbidden &&
			!strings.Contains(rec.Body.String(), apperr.SlugTwoFAEnrollmentRequired) {
			t.Errorf("%s: refusal does not carry the enrollment code: %s", path, rec.Body.String())
		}
	}
}

// An ordinary session is untouched.
func TestAuthenticateLeavesAnEnrolledSessionAlone(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/territories", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()

	authenticate(okValidator(false), next).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}
```

- [ ] **Step 7: Run and watch it fail**

```bash
cd backend && go test ./services/gateway-service/internal/transport/authhttp/... -run Authenticate -v
```

Expected: FAIL — `undefined: validateFunc`, `undefined: authenticate`.

- [ ] **Step 8: Extract the seam and wire the gate**

In `middleware.go`, replace the body of `Authenticate` with a call to a plain
function over the validator, and put the gate inside it — before the principal
is built, so a refused request never reaches a handler:

```go
// validateFunc is exactly *auth.Client.ValidateToken. Naming it is what lets
// the middleware's own behaviour be driven in a test: Handlers.client is a
// concrete client with no interface behind it, and widening it to one for a
// single method would be a larger change than this.
type validateFunc func(ctx context.Context, token string) (
	uid string, perms []string, isOwner bool, owningAdmin, auditCompany string,
	mustEnroll bool, err error,
)

func (h *Handlers) Authenticate(next http.Handler) http.Handler {
	return authenticate(h.client.ValidateToken, next)
}

func authenticate(validate validateFunc, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := sessionToken(r)
		if token == "" {
			apperr.Write(w, http.StatusUnauthorized, apperr.SlugUnauthenticated, "missing session")
			return
		}
		uid, perms, isOwner, owningAdmin, auditCompany, mustEnroll, err := validate(r.Context(), token)
		if err != nil {
			fail(w, err) // maps Unauthenticated → 401
			return
		}
		// A session that owes a second factor may enroll one and nothing else.
		// The check lives here rather than in its own middleware because
		// Authenticate is mounted in six places and a seventh must inherit the
		// gate rather than have to remember it.
		if mustEnroll && !enrollmentAllows(r.URL.Path) {
			apperr.Write(w, http.StatusForbidden, apperr.SlugTwoFAEnrollmentRequired,
				"enroll a second factor to continue")
			return
		}
		ctx := withPrincipal(r.Context(), uid, perms, isOwner, owningAdmin, auditCompany)
		// The bearer travels on too: handlers in httpapi only ever see a
		// context, and the audit journal has to forward it to auth to turn the
		// actor ids it returns into logins.
		ctx = withToken(ctx, token)
		// Also publish the actor for outbound gRPC: the client interceptor in
		// grpcutil forwards it to catalog/content/auth, where it reaches the
		// audit trigger through the mutation's transaction.
		ctx = grpcutil.WithActor(ctx, grpcutil.Actor{ID: uid, Company: auditCompany})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
```

- [ ] **Step 9: Run and watch it pass**

```bash
cd backend && go test ./services/gateway-service/internal/transport/authhttp/... -v
```

Expected: PASS, including the existing tests in the package.

- [ ] **Step 10: Document the refusal**

In `api/openapi.yaml`, extend the `Forbidden` response's description:

```yaml
    Forbidden:
      description: >
        Permission denied. Code `twofa_enrollment_required` means the account is
        required to carry a second factor and has not enrolled one: only
        /api/auth/me, /api/auth/logout and the /api/auth/2fa enrollment endpoints
        are reachable until it does.
```

```bash
make -C backend openapi-gen
```

- [ ] **Step 11: Run the full gate and commit**

```bash
CC=/usr/bin/clang CXX=/usr/bin/clang++ make -C backend check
git add backend/pkg/apperr backend/services/gateway-service
git diff --cached --name-only
git commit -m "feat(gateway): refuse a session that owes a second factor

Inside Authenticate rather than beside it: Authenticate is mounted in six
places and a seventh must inherit the gate instead of remembering it — the
shape RequireTerritoryAccess arrived at after a per-handler check was
remembered three times out of thirteen. Exact-match allow-list, denying by
default, so a new route is refused until it is listed. Refusal carries
twofa_enrollment_required so the SPA can route to enrollment rather than show
its generic permission copy."
```

---

## After the plan

`frontend/` has no enrollment screen. Until `frontend-v2`'s Users screen can
issue the requirement and its account screen can act on the 403, **do not set
the flag on a real account** — the endpoint works and will lock a v1 user out.
The wiring that closes this is Task 2 of the companion plan for
`docs/superpowers/specs/2026-09-02-frontend-v2-gateway-wiring-design.md`.
