# Password reset, entity editing, source-replace fix, request batching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins reset users' passwords; models and territories get editable title/description; replacing a territory's source keeps placements, measurements and panoramas in place; the SPA stops making redundant and N+1 requests.

**Architecture:** Four independent parts landing on `feat/edit-and-batching` (off `dev`). A adds one auth RPC + gateway route + dialog. B widens the two existing PATCH bodies. C extends the rescale baseline with the bbox centre and moves panoramas in the same SQL statement. D adds list-embedded LODs and four batch/aggregate endpoints, then moves the SPA onto them and onto a 60 s default `staleTime`.

**Tech Stack:** Go 1.27 (gRPC, pgx, chi, oapi-codegen, testify/suite + gotest.tools + minimock, testcontainers), PostgreSQL, Redis, Prometheus; React 19 + TanStack Query v5 + Vite + vitest; openapi-typescript.

**Spec:** `docs/superpowers/specs/2026-09-23-edit-and-batching-design.md`. Where a section below says "the code wins" or lists spec discrepancies, the plan's version is the one to implement.

## Global Constraints

- Branch `feat/edit-and-batching`. A parallel session works in this tree: **stage by path only**; never `git add -A`/`.`, never `git stash`/`checkout`/`reset`/`restore`, never `pkill -f vite`, kill only processes you started.
- Go gate before every Go commit: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` (same env on `git commit`, the pre-commit hook runs it). Storage integration suites need Docker and are **not** in `make check` — each task runs its own.
- Frontend gate: `cd frontend && yarn lint && yarn test:coverage && yarn build` (coverage 90/85/90/90; every source file needs a sibling spec). **yarn only.** `tsc --noEmit` checks nothing — `yarn lint` is the type check. Frontend-only commits use `--no-verify` and say so.
- Codegen after every contract change: `make -C backend proto-gen` (needs network for buf), `make -C backend openapi-gen`, `(cd frontend && yarn openapi:generate)`, `go generate` for minimock.
- Product files ≤ 200 lines, one concern per file; sentinel errors in `domain`; every write to an audited table through `audittx.Run`.
- Refusals that could confirm existence across tenants answer 404, never 403.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
  ```
- Every implementer/reviewer dispatch opens with the task's **Skills to load** list, loaded through the Skill tool before any other work, and reports what it loaded. Common set for every task: `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`. Go tasks add `modern-go-guidelines:use-modern-go` + `cc-skills-golang:golang-how-to` (and the sub-skills it names). Frontend tasks add `react-best-practices`, `tailwind-patterns`, and for visible UI `ui-ux-pro-max` + `frontend-design:frontend-design`.

## Task order

| # | Task | Layer | Depends on |
|---|---|---|---|
| 1 | A1 auth-service `SetUserPassword` | Go | — |
| 2 | A2 gateway `PUT /api/auth/users/{id}/password` | Go | A1 |
| 3 | A3 reset-password dialog | FE | A2 |
| 4 | B1 PATCH title/description | Go | — |
| 5 | B2 `EditDetailsDialog` + 3 entry points | FE | B1 |
| 6 | C1 baseline centre (migration, proto, capture) | Go | — |
| 7 | C2 rescale with offset + panoramas | Go | C1 |
| 8 | D2-be `lods` on list payloads | Go | — |
| 9 | D3a-be `GET /api/territory-admins` | Go | — |
| 10 | D3b-be multi-panel metrics | Go | — |
| 11 | D3c-be placement batch create | Go | — |
| 12 | D3d-be role PATCH with permissions | Go | — |
| 13 | D4-be `GET /api/console/summary` | Go | D3a, D3b |
| 14 | DF-0 regenerate DTOs, verify schema names | FE | 8–13 |
| 15 | DF-1 `staleTime` 60 s, creates invalidate lists | FE | — |
| 16 | DF-2 viewer marks scene stale | FE | — |
| 17 | DF-3 conversion page reads scene, SSE replaces poll | FE | — |
| 18 | DF-4 user mutations `setQueryData` | FE | — |
| 19 | DF-5 catalogs read `lods` | FE | DF-0 |
| 20 | DF-6 Home summary | FE | DF-0 |
| 21 | DF-7 access page reads admin map | FE | DF-0, DF-6 |
| 22 | DF-8 metrics in one request | FE | DF-0, DF-6 |
| 23 | DF-9 placements batch POST | FE | DF-0 |
| 24 | DF-10 role in one PATCH | FE | DF-0 |

**Deploy together:** D3b-be + DF-8 (metrics response changes from array to object); C1 + C2 across catalog, gateway and mesh-worker (compose rebuilds all three).

**Cross-part rule (B2 × D2):** B2's cache write-back **merges** title/description into cached rows — it never replaces them, because the PATCH answer carries no `lods`.

---

## Part A — Admin password reset (`/console/users`)

**Goal:** Root sets anyone's password, a Company Owner only the password of a user they created; no old password is asked; the user is signed out everywhere.

**Architecture:** One new auth RPC, `SetUserPassword`, backed by `users.Service.SetPassword`. It reuses the existing `Store.ChangePassword`, which already writes through `audittx.Run`, and the existing `Sessions.DeleteUser`, so neither the storage layer nor the minimock mocks change. The gateway adds `PUT /api/auth/users/{id}/password` on the plain-chi `authhttp` surface behind `users:write`. The SPA wires the inspector's existing, currently undrawn "Reset password" button to a new `features/reset-password` dialog.

**Spec:** `docs/superpowers/specs/2026-09-23-edit-and-batching-design.md` § A.

### Corrections to the spec (the code wins)

1. **Proto shape.** The spec gives `SetUserPasswordRequest{actor, id, password}` returning `Empty`. The code has neither: every admin RPC carries the session as `token`, which `Server.actor()` resolves on the server, and every RPC has its own response message. `auth.proto` imports no `google.protobuf.Empty`. The plan uses `{token, id, password}` returning `SetUserPasswordResponse{}`.
2. **No new storage method.** `storage/users/change_password.go` already runs `UPDATE users SET password_hash …` inside `audittx.Run`, and `users.Store` already declares `ChangePassword(ctx, id, hash)`. `SetPassword` calls it, so there is no `.go` change in `storage/` and no `go generate` for the mocks.
3. **"The handler logs it."** `grpcutil.SlogUnaryInterceptor` already logs every non-OK RPC at warn or error, and an unmatched error becomes `codes.Internal`, which is logged at error level. Adding a second log line would break the single-handling rule, so the plan adds none. The gateway then answers 500.
4. **The target check also covers `IsOwner`, not only the `admin` slug.** Root is marked by `users.is_owner`. If the check looked only at the role slug, a non-Root caller holding `users:read_all` (`scopeAll`) could reset Root's password. `SetPassword` refuses with `ErrAdminOwnerOnly` when `isAdmin(target) || target.IsOwner`, and a test case pins this.
5. **There is no "row action".** The Users screen puts its actions in `widgets/person-inspector`, which already renders a **"Reset password"** button whenever the page passes `onResetPassword`; today nothing passes it. The plan passes it when the reader may reset that person's password and keeps the existing label. The dialog's submit button reads "Change password".
6. **The dialog must open revealed.** `PasswordField` keeps its shown/hidden state internally and has no way to start shown. The plan adds a `defaultRevealed` prop.
7. **Docs and a spec file currently say the opposite.** `frontend/CLAUDE.md:659`, `frontend/README.md:64` and `users-screen.spec.tsx` ("never offers a password reset — nothing can reset one yet") all state that reset is not drawn. Task A3 rewrites all three.

### Global constraints (every task)

- **Never** `git stash`, `git checkout -- …`, `git reset` or `git restore`: other agents share this tree. To undo an edit, edit the file back.
- Stage by exact path. Never `git add -A` or `git add .`. Run `git diff --cached --name-only` before every commit.
- Go gates and Go commits run with `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path)` in the environment, including `git commit`, because the pre-commit hook runs `make -C backend check`.
- Backend tests use `testify/suite` + `gotest.tools/v3/assert` + `minimock`, and `t.Context()`/`s.T().Context()`. Go 1.27 idioms apply (`new(expr)`, `errors.AsType`).
- 200-line cap on product files, counted by hand.
- yarn only. `tsc --noEmit` checks nothing in `frontend/`; the type check is `yarn lint` (`tsc -b --noEmit && oxlint`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

### Task A1: auth-service — `SetUserPassword` RPC and `Service.SetPassword`

**Skills to load:** `superpowers:test-driven-development`, `ponytail:ponytail`, `clean-code`, `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to` (then `golang-testing`, `golang-security`, `golang-error-handling`, `golang-grpc`).

**Files:**
- Create: `backend/services/auth-service/internal/service/users/set_password.go`
- Create: `backend/services/auth-service/internal/service/users/set_password_test.go`
- Modify: `backend/proto/rosneft/auth/v1/auth.proto` (rpc list after `SetUserTOTPRequired`, messages after `SetUserTOTPRequiredRequest`)
- Regenerate: `backend/proto/gen/go/rosneft/auth/v1/auth.pb.go`, `backend/proto/gen/go/rosneft/auth/v1/auth_grpc.pb.go`
- Modify: `backend/services/auth-service/internal/transport/grpcapi/server.go` (the `UsersSvc` interface)
- Modify: `backend/services/auth-service/internal/transport/grpcapi/users.go` (append a handler)

**Interfaces:**
- Consumes (existing): `Store.GetByID(ctx, id) (domain.User, error)`, `Store.ChangePassword(ctx, id, hash string) error`, `Sessions.DeleteUser(ctx, userID string) error`, `(*Service).ownership(ctx, actorID, scopeAll, id) (domain.User, error)`, `isAdmin(domain.User) bool`, `validate.Password(string) error`, `password.Hash(string) (string, error)`.
- Produces:
  - `func (s *Service) SetPassword(ctx context.Context, actorID string, scopeAll bool, id, plain string) error`
  - proto `rpc SetUserPassword(SetUserPasswordRequest) returns (SetUserPasswordResponse)`. The Go request is `authv1.SetUserPasswordRequest{Token, Id, Password string}`. The generated client method is `SetUserPassword(ctx, *authv1.SetUserPasswordRequest, ...grpc.CallOption) (*authv1.SetUserPasswordResponse, error)`.
  - Status codes, all through the existing `statusByCode` map, so no new sentinels:

    | Case | Error | gRPC code |
    |---|---|---|
    | Out of scope or missing | `ErrUserNotFound` | NotFound |
    | Target is the caller | `ErrSelfTarget` | FailedPrecondition |
    | Target is an admin or Root, caller is not Root | `ErrAdminOwnerOnly` | PermissionDenied |
    | Weak password | `ErrInvalidInput` | InvalidArgument |
    | Sign-out failed after the write | wrapped Redis error | Internal |

- [ ] **Step 1: Write the failing service test**

`backend/services/auth-service/internal/service/users/set_password_test.go`:

```go
package users_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

type SetPasswordSuite struct{ suite.Suite }

func TestSetPasswordSuite(t *testing.T) { suite.Run(t, new(SetPasswordSuite)) }

const newPassword = "N3w-Passw0rd!"

// Every refusal leaves the password and the sessions alone. minimock enforces
// that: ChangePassword and DeleteUser are configured only when written is set,
// so any other call fails the case. The GetByID lookups are exact, because an
// unused When expectation fails the controller too.
func (s *SetPasswordSuite) TestSetPassword() {
	root := domain.User{ID: "root", IsOwner: true}
	company := domain.User{ID: "co", RoleSlugs: []string{"admin"}}
	own := domain.User{ID: "u1", RoleSlugs: []string{"guest"}, CreatedBy: new("co")}
	foreign := domain.User{ID: "u2", RoleSlugs: []string{"guest"}, CreatedBy: new("other")}
	ownAdmin := domain.User{ID: "a1", RoleSlugs: []string{"admin"}, CreatedBy: new("co")}
	errRedis := errors.New("redis is down")

	tests := []struct {
		name     string
		actor    string
		scopeAll bool
		target   string
		password string
		lookups  []domain.User
		written  bool
		signOut  error
		want     error
	}{
		{name: "root resets anyone", actor: "root", scopeAll: true, target: "u2", password: newPassword,
			lookups: []domain.User{foreign}, written: true},
		{name: "root resets a company owner", actor: "root", scopeAll: true, target: "co", password: newPassword,
			lookups: []domain.User{company, root}, written: true},
		{name: "company owner resets a user they created", actor: "co", target: "u1", password: newPassword,
			lookups: []domain.User{own}, written: true},
		{name: "a foreign user reads as missing", actor: "co", target: "u2", password: newPassword,
			lookups: []domain.User{foreign}, want: domain.ErrUserNotFound},
		{name: "own password goes through /account", actor: "co", target: "co", password: newPassword,
			lookups: []domain.User{company}, want: domain.ErrSelfTarget},
		{name: "only root resets an admin", actor: "co", target: "a1", password: newPassword,
			lookups: []domain.User{ownAdmin, company}, want: domain.ErrAdminOwnerOnly},
		{name: "users:read_all does not reach root", actor: "co", scopeAll: true, target: "root", password: newPassword,
			lookups: []domain.User{root, company}, want: domain.ErrAdminOwnerOnly},
		{name: "a weak password is refused", actor: "root", scopeAll: true, target: "u2", password: "short",
			lookups: []domain.User{foreign}, want: domain.ErrInvalidInput},
		{name: "a failed sign-out is reported after the write", actor: "root", scopeAll: true, target: "u2",
			password: newPassword, lookups: []domain.User{foreign}, written: true, signOut: errRedis, want: errRedis},
	}
	for _, tc := range tests {
		s.Run(tc.name, func() {
			mc := minimock.NewController(s.T())
			st, ss := mocks.NewStoreMock(mc), mocks.NewSessionsMock(mc)
			ctx := s.T().Context()
			for _, u := range tc.lookups {
				st.GetByIDMock.When(ctx, u.ID).Then(u, nil)
			}
			if tc.written {
				st.ChangePasswordMock.Set(func(_ context.Context, id, hash string) error {
					assert.Equal(s.T(), id, tc.target)
					ok, err := password.Verify(tc.password, hash)
					assert.NilError(s.T(), err)
					assert.Assert(s.T(), ok, "the stored hash must verify the new password")
					return nil
				})
				ss.DeleteUserMock.Times(1).Expect(ctx, tc.target).Return(tc.signOut)
			}

			err := users.New(st, ss).SetPassword(ctx, tc.actor, tc.scopeAll, tc.target, tc.password)

			if tc.want == nil {
				assert.NilError(s.T(), err)
				return
			}
			assert.ErrorIs(s.T(), err, tc.want)
		})
	}
}
```

- [ ] **Step 2: Run it to watch it fail**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/auth-service && go test -race -run TestSetPasswordSuite ./internal/service/users/`
Expected: FAIL at build time with `users.New(st, ss).SetPassword undefined (type *users.Service has no field or method SetPassword)`.

- [ ] **Step 3: Write the minimal implementation**

`backend/services/auth-service/internal/service/users/set_password.go`:

```go
package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// SetPassword sets another user's password without asking for the old one and
// signs them out everywhere. An out-of-scope id reads as missing, as it does in
// every admin action. It does not call guard(): the last-admin rule stops the
// system from losing its admins, and a reset loses nobody. Only the
// admin-owner-only half applies. It also covers Root, because Root is marked by
// is_owner and not necessarily by the admin slug; without that, a users:read_all
// holder could take over Root.
func (s *Service) SetPassword(ctx context.Context, actorID string, scopeAll bool, id, plain string) error {
	target, err := s.ownership(ctx, actorID, scopeAll, id)
	if err != nil {
		return err
	}
	if actorID == id {
		return domain.ErrSelfTarget
	}
	if isAdmin(target) || target.IsOwner {
		actor, err := s.store.GetByID(ctx, actorID)
		if err != nil {
			return err
		}
		if !actor.IsOwner {
			return domain.ErrAdminOwnerOnly
		}
	}
	if err := validate.Password(plain); err != nil {
		return err
	}
	hash, err := password.Hash(plain)
	if err != nil {
		return fmt.Errorf("users.SetPassword: hash: %w", err)
	}
	if err := s.store.ChangePassword(ctx, id, hash); err != nil {
		return err
	}
	// The password has already changed. The failure is still returned so the
	// admin retries, and a retry sets the same password and signs out again.
	if err := s.sessions.DeleteUser(ctx, id); err != nil {
		return fmt.Errorf("users.SetPassword: sign out: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Run the test to watch it pass**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/auth-service && go test -race -run TestSetPasswordSuite -v ./internal/service/users/`
Expected: PASS, with 9 `--- PASS: TestSetPasswordSuite/TestSetPassword/…` subtests.

- [ ] **Step 5: Add the RPC to the proto**

In `backend/proto/rosneft/auth/v1/auth.proto`, directly after `  rpc SetUserTOTPRequired(SetUserTOTPRequiredRequest) returns (User);` add:

```proto
  // SetUserPassword sets another user's password without the old one and signs
  // them out everywhere. Same owner scope as FreezeUser; only an owner may set an
  // admin's or an owner's. The caller's own password goes through
  // ChangePassword, which asks for the old one.
  rpc SetUserPassword(SetUserPasswordRequest) returns (SetUserPasswordResponse);
```

Directly after the `message SetUserTOTPRequiredRequest { … }` block add:

```proto
message SetUserPasswordRequest {
  string token = 1; // actor resolved server-side from the session
  string id = 2;
  string password = 3;
}
message SetUserPasswordResponse {}
```

- [ ] **Step 6: Regenerate the Go code**

Run: `make -C /Users/vbncursed/programming/rosneft/backend proto-gen`. This needs network access, because `buf.gen.yaml` uses remote plugins.
Then run: `git -C /Users/vbncursed/programming/rosneft status --short backend/proto/gen`
Expected: ` M backend/proto/gen/go/rosneft/auth/v1/auth.pb.go` and ` M backend/proto/gen/go/rosneft/auth/v1/auth_grpc.pb.go` only. If buf also rewrote other services' files (for example, a newer plugin changed their version header), stage only the two auth files and report the rest. Do not revert them with git.

- [ ] **Step 7: Expose the service method and the gRPC handler**

In `backend/services/auth-service/internal/transport/grpcapi/server.go`, inside `type UsersSvc interface`, after the `SetTOTPRequired(...)` line add:

```go
	SetPassword(ctx context.Context, actorID string, scopeAll bool, id, password string) error
```

Append to `backend/services/auth-service/internal/transport/grpcapi/users.go`:

```go
func (s *Server) SetUserPassword(ctx context.Context, req *authv1.SetUserPasswordRequest) (*authv1.SetUserPasswordResponse, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.users.SetPassword(ctx, actorID, scopeAll, req.GetId(), req.GetPassword()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.SetUserPasswordResponse{}, nil
}
```

The existing `statusByCode` already maps every sentinel `SetPassword` returns, so `server.go` needs no other change.

- [ ] **Step 8: Build every consumer of the proto module**

Run: `cd /Users/vbncursed/programming/rosneft/backend && for m in services/auth-service services/gateway-service services/twofa-service services/passkey-service; do (cd $m && go build ./... && echo "$m ok"); done`
Expected: four `… ok` lines. The build also shows `*users.Service` satisfying the widened `UsersSvc` interface in `bootstrap`.

- [ ] **Step 9: Run the commit gate**

Run: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C /Users/vbncursed/programming/rosneft/backend check`
Expected: exit 0. fmt-check, tidy-check, vet, lint, test and vuln all pass.

- [ ] **Step 10: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add backend/proto/rosneft/auth/v1/auth.proto \
  backend/proto/gen/go/rosneft/auth/v1/auth.pb.go \
  backend/proto/gen/go/rosneft/auth/v1/auth_grpc.pb.go \
  backend/services/auth-service/internal/service/users/set_password.go \
  backend/services/auth-service/internal/service/users/set_password_test.go \
  backend/services/auth-service/internal/transport/grpcapi/server.go \
  backend/services/auth-service/internal/transport/grpcapi/users.go
git diff --cached --name-only   # expect exactly the 7 paths above
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) git commit -m "feat(auth): SetUserPassword — an admin sets a user's password and signs them out

Owner scope as FreezeUser (out of scope reads as 404), never on yourself,
an admin's or Root's only by Root. Reuses Store.ChangePassword (audittx) and
Sessions.DeleteUser; a failed sign-out after the write is still an error so
the admin retries.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9"
```

---

### Task A2: gateway — `PUT /api/auth/users/{id}/password`

**Skills to load:** `superpowers:test-driven-development`, `ponytail:ponytail`, `clean-code`, `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to` (then `golang-testing`, `golang-security`, `golang-error-handling`, `golang-grpc`).

**Files:**
- Create: `backend/services/gateway-service/internal/transport/authhttp/users_test.go`
- Modify: `backend/services/gateway-service/internal/clients/auth/users.go` (append a method)
- Modify: `backend/services/gateway-service/internal/transport/authhttp/users.go` (append a handler)
- Modify: `backend/services/gateway-service/internal/transport/authhttp/mount.go` (one route line, after the `/users/{id}/owner` line)
- Modify: `backend/services/gateway-service/api/openapi.yaml` (a new path after `/api/auth/users/{id}/owner`)
- Regenerate: `backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go`, plus `openapi_gen.go` if it changes (it should not, because the `auth` tag is excluded from stub generation)
- Modify: `backend/services/gateway-service/internal/transport/authhttp/route_permissions_spec_test.go` (one `ungatedMutations` entry)

**Interfaces:**
- Consumes (A1): `authv1.SetUserPasswordRequest{Token, Id, Password}`, `AuthServiceClient.SetUserPassword`.
- Produces:
  - `func (c *Client) SetUserPassword(ctx context.Context, token, id, password string) error`, in package `clients/auth`.
  - HTTP `PUT /api/auth/users/{id}/password` with body `{"password": string}`. It answers **204** with no body. Refusals use the `{code, message}` envelope: 400 for a weak password or bad JSON, 403 without `users:write` or when a non-Root caller targets an admin or Root, 404 when the id is out of scope or missing, 422 for self-target, and 500 when the sign-out failed after the write. CSRF applies, as on every cookie mutation.

- [ ] **Step 1: Write the failing handler test**

`backend/services/gateway-service/internal/transport/authhttp/users_test.go`:

```go
package authhttp

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
)

// passwordAuth is an in-process auth-service that records the request it is
// sent and answers with err.
type passwordAuth struct {
	authv1.UnimplementedAuthServiceServer
	got chan *authv1.SetUserPasswordRequest
	err error
}

func newPasswordAuth(err error) passwordAuth {
	return passwordAuth{got: make(chan *authv1.SetUserPasswordRequest, 1), err: err}
}

func (p passwordAuth) SetUserPassword(_ context.Context, req *authv1.SetUserPasswordRequest) (*authv1.SetUserPasswordResponse, error) {
	p.got <- req
	if p.err != nil {
		return nil, p.err
	}
	return &authv1.SetUserPasswordResponse{}, nil
}

type SetUserPasswordSuite struct{ suite.Suite }

func TestSetUserPasswordSuite(t *testing.T) { suite.Run(t, new(SetUserPasswordSuite)) }

// put sends one PUT through the handler on its real route pattern, with
// auth-service answering from stub over loopback. Authenticate, CSRF and the
// users:write gate belong to Mount and are not what this suite tests.
func (s *SetUserPasswordSuite) put(stub passwordAuth, body string) *httptest.ResponseRecorder {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(s.T(), err)
	srv := grpc.NewServer()
	authv1.RegisterAuthServiceServer(srv, stub)
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)
	client, err := auth.Dial(lis.Addr().String())
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = client.Close() })

	r := chi.NewRouter()
	r.Put("/api/auth/users/{id}/password", (&Handlers{client: client}).setUserPassword)
	req := httptest.NewRequest(http.MethodPut, "/api/auth/users/u-1/password", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func (s *SetUserPasswordSuite) TestForwardsTargetPasswordAndSessionThenAnswers204() {
	stub := newPasswordAuth(nil)

	rec := s.put(stub, `{"password":"N3w-Passw0rd!"}`)

	assert.Equal(s.T(), rec.Code, http.StatusNoContent)
	got := <-stub.got
	assert.Equal(s.T(), got.GetToken(), "tok")
	assert.Equal(s.T(), got.GetId(), "u-1")
	assert.Equal(s.T(), got.GetPassword(), "N3w-Passw0rd!")
}

// auth-service's refusal reaches the caller under its own status: the
// self-target guard is a 422, not a generic 500.
func (s *SetUserPasswordSuite) TestPassesTheRefusalThrough() {
	stub := newPasswordAuth(status.Error(codes.FailedPrecondition, "cannot perform this action on yourself"))

	rec := s.put(stub, `{"password":"N3w-Passw0rd!"}`)

	assert.Equal(s.T(), rec.Code, http.StatusUnprocessableEntity)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), "yourself"))
}

func (s *SetUserPasswordSuite) TestRefusesABodyThatIsNotJSONWithoutCallingAuth() {
	stub := newPasswordAuth(nil)

	rec := s.put(stub, "password=x")

	assert.Equal(s.T(), rec.Code, http.StatusBadRequest)
	assert.Equal(s.T(), len(stub.got), 0)
}
```

- [ ] **Step 2: Run it to watch it fail**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race -run TestSetUserPasswordSuite ./internal/transport/authhttp/`
Expected: FAIL at build time with `(&Handlers{…}).setUserPassword undefined (type *Handlers has no field or method setUserPassword)`.

- [ ] **Step 3: Add the client method, the handler and the route**

Append to `backend/services/gateway-service/internal/clients/auth/users.go`:

```go
// SetUserPassword passes the actor's session token; auth-service resolves the
// actor from it, applies the owner scope and signs the target out everywhere.
func (c *Client) SetUserPassword(ctx context.Context, token, id, password string) error {
	_, err := c.cc.SetUserPassword(ctx, &authv1.SetUserPasswordRequest{Token: token, Id: id, Password: password})
	return err
}
```

Append to `backend/services/gateway-service/internal/transport/authhttp/users.go`:

```go
func (h *Handlers) setUserPassword(w http.ResponseWriter, r *http.Request) {
	var req struct{ Password string }
	if !decode(w, r, &req) {
		return
	}
	if err := h.client.SetUserPassword(r.Context(), sessionToken(r), chi.URLParam(r, "id"), req.Password); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

In `backend/services/gateway-service/internal/transport/authhttp/mount.go`, directly after `pr.With(h.Require("users:write")).Post("/users/{id}/owner", h.setUserOwner)` add:

```go
			// Setting someone else's password. The scope (created_by, admin → Root
			// only, never yourself) lives in auth-service, like freeze.
			pr.With(h.Require("users:write")).Put("/users/{id}/password", h.setUserPassword)
```

It is not added to `authAuditActions`: the `users` audit trigger already records the `password_hash` update, attributed through `audittx`.

- [ ] **Step 4: Run the handler test to watch it pass**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race -run TestSetUserPasswordSuite -v ./internal/transport/authhttp/`
Expected: PASS, 3 tests.

- [ ] **Step 5: Watch the spec-coverage guard fail for the undocumented route**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race -run TestSpecCoverageSuite ./internal/bootstrap/`
Expected: FAIL with `routes on the router but not in the embedded OpenAPI spec: [PUT /api/auth/users/{id}/password (path missing)]`.

- [ ] **Step 6: Document the route in the OpenAPI spec**

In `backend/services/gateway-service/api/openapi.yaml`, directly before the line `  /api/auth/roles:`, after the `/api/auth/users/{id}/owner` block that ends with `        '422': { description: Self-target guard }`, insert:

```yaml
  /api/auth/users/{id}/password:
    put:
      tags: [auth]
      summary: Set a user's password and sign them out everywhere (requires users:write)
      description: >
        No old password is asked. Root may set anyone's; everyone else only the
        password of a user they created, and never an admin's or Root's. The
        caller's own password goes through POST /api/auth/me/password, which
        asks for the old one. An id outside the caller's scope answers 404,
        like an unknown one. A 500 after the write means the sign-out failed;
        retrying is safe.
      security: [{ bearerAuth: [] }]
      parameters:
        - { in: path, name: id, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [password]
              properties:
                password: { type: string, minLength: 8, maxLength: 256 }
      responses:
        '204': { description: Password set; every session of the user revoked }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '422': { description: Self-target guard }

```

Then regenerate: `make -C /Users/vbncursed/programming/rosneft/backend openapi-gen`
Then run: `git -C /Users/vbncursed/programming/rosneft status --short backend/services/gateway-service`
Expected: `openapi.yaml` and `internal/transport/httpapi/openapi_spec_gen.go` modified (and possibly `openapi_gen.go`), plus the three Go files from Step 3 and the new `users_test.go`.

- [ ] **Step 7: Watch the route-permission guard fail, then excuse the route**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race -run 'TestSpecCoverageSuite|TestRoutePermsSpecSuite' ./internal/bootstrap/ ./internal/transport/authhttp/`
Expected: `TestSpecCoverageSuite` now PASSES. `TestRoutePermsSpecSuite` FAILS with `PUT /api/auth/users/{id}/password is in the spec but neither in routePerms nor in ungatedMutations`.

In `backend/services/gateway-service/internal/transport/authhttp/route_permissions_spec_test.go`, inside `ungatedMutations`, directly after the `"POST /api/auth/users/{id}/owner": …` line add:

```go
	"PUT /api/auth/users/{id}/password":       "users:write in mount.go, owner scope in auth",
```

Run the same command again. Expected: PASS for both.

- [ ] **Step 8: Run the commit gate**

Run: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C /Users/vbncursed/programming/rosneft/backend check`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add backend/services/gateway-service/internal/clients/auth/users.go \
  backend/services/gateway-service/internal/transport/authhttp/users.go \
  backend/services/gateway-service/internal/transport/authhttp/users_test.go \
  backend/services/gateway-service/internal/transport/authhttp/mount.go \
  backend/services/gateway-service/internal/transport/authhttp/route_permissions_spec_test.go \
  backend/services/gateway-service/api/openapi.yaml \
  backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go
# plus internal/transport/httpapi/openapi_gen.go only if Step 6 showed it modified
git diff --cached --name-only
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) git commit -m "feat(gateway): PUT /api/auth/users/{id}/password

users:write at the route, CSRF as every cookie mutation, 204 on success.
The scope is auth-service's (SetUserPassword); refusals keep their codes —
404 out of scope, 403 admin/Root by a non-Root, 422 self, 400 weak.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9"
```

---

### Task A3: frontend — reset-password dialog wired into the Users inspector

**Skills to load:** `superpowers:test-driven-development`, `ponytail:ponytail`, `clean-code`, `react-best-practices`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`.

**Files:**
- Regenerate: `frontend/src/shared/api/dto.ts`
- Modify: `frontend/src/shared/ui/password-field/password-field.tsx`, `…/password-field.spec.tsx`
- Modify: `frontend/src/entities/user/api/users-gateway.ts`, `…/users-gateway.spec.ts`, `frontend/src/entities/user/index.ts`
- Create: `frontend/src/features/reset-password/index.ts`, `frontend/src/features/reset-password/reset-password.fixture.tsx`, `frontend/src/features/reset-password/ui/reset-password-dialog.tsx`, `frontend/src/features/reset-password/ui/reset-password-dialog.spec.tsx`
- Modify: `frontend/src/pages/users/model/people.ts`, `…/people.spec.ts`
- Modify: `frontend/src/pages/users/model/use-users.ts`, `…/use-users.spec.tsx`
- Modify: `frontend/src/pages/users/ui/users-screen.tsx`, `…/users-screen.spec.tsx`
- Modify (prop comments only): `frontend/src/pages/users/ui/users-page.tsx:46`, `frontend/src/widgets/person-inspector/ui/person-inspector.tsx:16`
- Modify (docs): `frontend/CLAUDE.md:659-660`, `frontend/README.md:64-66`

**Interfaces:**
- Consumes (A2): `PUT /api/auth/users/{id}/password`, body `{password}`, answering 204.
- Produces:
  - `setUserPassword(id: string, password: string): Promise<void>`, exported from `@/entities/user`.
  - `PasswordField` gains a `defaultRevealed?: boolean` prop.
  - `ResetPasswordDialog(props: { open: boolean; username: string; busy?: boolean; onClose: () => void; onSubmit: (password: string) => void })` and `type ResetPasswordDialogProps`, from `@/features/reset-password`.
  - `canResetPassword(me: Principal | null, user: User | null): boolean`, in `pages/users/model/people.ts`.
  - `UsersState` gains `canResetPassword: boolean; resetting: boolean; setResetting: (open: boolean) => void; resetPassword: (password: string) => void; resetBusy: boolean`.

- [ ] **Step 1: Regenerate the TS DTOs from the new spec**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn openapi:generate && git -C .. diff --stat -- frontend/src/shared/api/dto.ts`
Expected: `dto.ts` changed, with a new `"/api/auth/users/{id}/password"` path entry.

- [ ] **Step 2: Write the failing `PasswordField` test**

Append inside `describe("PasswordField", …)` in `frontend/src/shared/ui/password-field/password-field.spec.tsx`:

```tsx
  it("starts shown when asked, and the toggle still hides it", async () => {
    render(<PasswordField label="Password" defaultValue="x" defaultRevealed />);
    expect(input()).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input()).toHaveAttribute("type", "password");
  });
```

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn test src/shared/ui/password-field`
Expected: FAIL, because the input is `type="password"` (the prop is unknown and gets spread onto `<input>`).

- [ ] **Step 3: Add `defaultRevealed`**

In `frontend/src/shared/ui/password-field/password-field.tsx`, add to `PasswordFieldProps` after the `action?` member:

```ts
  /** Start with the value shown: a password the reader was just handed, not one they typed. */
  defaultRevealed?: boolean;
```

Add `defaultRevealed = false,` to the destructured parameters, after `action,`. Change `const [shown, setShown] = useState(false);` to:

```ts
  const [shown, setShown] = useState(defaultRevealed);
```

Run: `yarn test src/shared/ui/password-field`. Expected: PASS.

- [ ] **Step 4: Write the failing gateway test**

In `frontend/src/entities/user/api/users-gateway.spec.ts`, add `setUserPassword,` to the import list from `./users-gateway`, and add inside `describe("users gateway", …)`:

```ts
  it("puts a new password on the user's own route and expects no body back", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(setUserPassword("u 1", "N3w-Passw0rd!")).resolves.toBeUndefined();
    expect(request()).toEqual({
      url: "/api/auth/users/u%201/password",
      method: "PUT",
      body: { password: "N3w-Passw0rd!" },
    });
  });
```

Run: `yarn test src/entities/user/api/users-gateway`
Expected: FAIL, `setUserPassword is not a function` (or not exported).

- [ ] **Step 5: Implement and export `setUserPassword`**

In `frontend/src/entities/user/api/users-gateway.ts`, change the import to `import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from "@/shared/api";` and append:

```ts
/** 204. The gateway also signs the user out of every session. */
export const setUserPassword = (id: string, password: string): Promise<void> =>
  httpPut<void>(`${at(id)}/password`, { password });
```

In `frontend/src/entities/user/index.ts`, add `setUserPassword,` to the `./api/users-gateway` export list, between `setTwoFactorRequired,` and `setUserRoles,`.

Run: `yarn test src/entities/user/api/users-gateway`. Expected: PASS.

- [ ] **Step 6: Write the failing dialog spec**

`frontend/src/features/reset-password/ui/reset-password-dialog.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validatePassword } from "@/entities/user";
import { copyText } from "@/shared/lib/copy-text";
import { clearNotices } from "@/shared/lib/notify";
import { Toaster } from "@/widgets/toaster";
import { ResetPasswordDialog, type ResetPasswordDialogProps } from "./reset-password-dialog";

vi.mock("@/shared/lib/copy-text", () => ({ copyText: vi.fn(() => Promise.resolve(true)) }));

const props = (over: Partial<ResetPasswordDialogProps> = {}): ResetPasswordDialogProps => ({
  open: true,
  username: "a.ivanova",
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  ...over,
});

const field = () => screen.getByLabelText(/^Password/) as HTMLInputElement;

afterEach(() => clearNotices());

describe("ResetPasswordDialog", () => {
  it("opens holding a generated password that passes the rules, already shown", () => {
    render(<ResetPasswordDialog {...props()} />);
    expect(screen.getByRole("dialog", { name: "New password for a.ivanova" })).toBeInTheDocument();
    expect(field().type).toBe("text");
    expect(validatePassword(field().value)).toBeNull();
  });

  it("replaces the password with a fresh one on Generate", async () => {
    render(<ResetPasswordDialog {...props()} />);
    const first = field().value;
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(field().value).not.toBe(first);
    expect(validatePassword(field().value)).toBeNull();
  });

  it("copies the password on Copy and says so", async () => {
    render(
      <>
        <Toaster />
        <ResetPasswordDialog {...props()} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(copyText).toHaveBeenCalledWith(field().value);
    expect(await screen.findByText("Password copied")).toBeInTheDocument();
  });

  it("tells the reader to copy by hand when the clipboard refuses", async () => {
    vi.mocked(copyText).mockResolvedValueOnce(false);
    render(
      <>
        <Toaster />
        <ResetPasswordDialog {...props()} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(
      await screen.findByText("Could not copy — select it and copy by hand"),
    ).toBeInTheDocument();
  });

  it("submits the typed password, not the generated one", async () => {
    const onSubmit = vi.fn();
    render(<ResetPasswordDialog {...props({ onSubmit })} />);
    await userEvent.clear(field());
    await userEvent.type(field(), "Typed-Passw0rd");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(onSubmit).toHaveBeenCalledWith("Typed-Passw0rd");
  });

  it("refuses a weak typed password before the gateway does", async () => {
    const onSubmit = vi.fn();
    render(<ResetPasswordDialog {...props({ onSubmit })} />);
    await userEvent.clear(field());
    await userEvent.type(field(), "s3cret!!");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText(/Password needs an upper-/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

Run: `yarn test src/features/reset-password`
Expected: FAIL, `Failed to resolve import "./reset-password-dialog"`.

- [ ] **Step 7: Implement the dialog, its index and its fixture**

`frontend/src/features/reset-password/ui/reset-password-dialog.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { generatePassword, validatePassword } from "@/entities/user";
import { copyText } from "@/shared/lib/copy-text";
import { notify } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { PasswordField } from "@/shared/ui/password-field";

export type ResetPasswordDialogProps = {
  open: boolean;
  /** Whose password this is; named in the title. */
  username: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
};

const FORM_ID = "reset-password";

/**
 * Sets someone else's password without asking for the old one. It opens holding
 * a generated password, already shown, so the admin can copy it straight away.
 * Mount it only while open: a fresh mount is what generates a fresh password.
 */
export function ResetPasswordDialog({ open, username, busy = false, onClose, onSubmit }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState(generatePassword);
  const [attempted, setAttempted] = useState(false);
  const rule = validatePassword(password);

  const copy = () =>
    void copyText(password).then((ok) =>
      ok
        ? notify.success("Password copied")
        : notify.error("Could not copy — select it and copy by hand"),
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!rule) onSubmit(password);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="Reset password"
      title={`New password for ${username}`}
      description="No old password is needed. They are signed out everywhere and sign in with this one."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={password === ""} loading={busy}>
            Change password
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-2.5">
        <PasswordField
          label="Password"
          autoComplete="new-password"
          defaultRevealed
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          error={attempted && rule ? rule : undefined}
          action={{
            label: "Generate",
            onClick: (reveal) => {
              setPassword(generatePassword());
              reveal();
            },
          }}
        />
        <Button size="sm" className="self-start" onClick={copy} disabled={busy}>
          Copy
        </Button>
      </form>
    </Modal>
  );
}
```

`frontend/src/features/reset-password/index.ts`:

```ts
export { ResetPasswordDialog, type ResetPasswordDialogProps } from "./ui/reset-password-dialog";
```

`frontend/src/features/reset-password/reset-password.fixture.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { ResetPasswordDialog } from "./ui/reset-password-dialog";

function Live() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Reset password</Button>
      {open && (
        <ResetPasswordDialog
          open={open}
          username="a.ivanova"
          onClose={() => setOpen(false)}
          onSubmit={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default (
  <div className="flex gap-3 rounded-card border border-line bg-panel p-6">
    <Live />
  </div>
);
```

Run: `yarn test src/features/reset-password src/fixtures.spec.tsx src/architecture.spec.ts`
Expected: PASS. The dialog spec has 6 tests; the fixture renders; the architecture rules hold.

- [ ] **Step 8: Write the failing `canResetPassword` test**

In `frontend/src/pages/users/model/people.spec.ts`, add `canResetPassword` to the `./people` import, add `import type { Principal } from "@/shared/session";` and append:

```ts
describe("canResetPassword", () => {
  const me = (over: Partial<Principal> = {}): Principal => ({
    id: "me",
    email: "me@x",
    username: "me",
    status: "active",
    totpEnabled: true,
    totpRequired: false,
    passkeyEnabled: null,
    roleSlugs: ["admin"],
    roleTitles: {},
    permissions: ["users:write"],
    isOwner: false,
    onboardingToursSeen: [],
    ...over,
  });

  it("lets a manager reset someone else's password", () => {
    expect(canResetPassword(me(), make("u1", "a", ["guest"]))).toBe(true);
  });

  it("never offers the reader their own — /account asks for the old one", () => {
    expect(canResetPassword(me({ isOwner: true }), make("me", "me", ["admin"]))).toBe(false);
  });

  it("keeps a Company Owner's and Root's password to Root", () => {
    expect(canResetPassword(me(), make("c2", "c", ["admin"]))).toBe(false);
    expect(canResetPassword(me(), make("r", "root", [], { isOwner: true }))).toBe(false);
    expect(canResetPassword(me({ isOwner: true, permissions: [] }), make("c2", "c", ["admin"]))).toBe(true);
  });

  it("offers nothing without users:write, or with nobody open", () => {
    expect(canResetPassword(me({ permissions: ["users:read"] }), make("u1", "a", ["guest"]))).toBe(false);
    expect(canResetPassword(me(), null)).toBe(false);
    expect(canResetPassword(null, make("u1", "a", ["guest"]))).toBe(false);
  });
});
```

Run: `yarn test src/pages/users/model/people`
Expected: FAIL, `canResetPassword is not a function`.

- [ ] **Step 9: Implement `canResetPassword`**

In `frontend/src/pages/users/model/people.ts`, add `import { can, type Principal } from "@/shared/session";` to the imports and append:

```ts
/**
 * Whether this reader may set the open person's password. Never their own,
 * because /account asks for the old one. A Company Owner's or Root's only
 * when the reader is Root. The gateway enforces all of it; this only keeps
 * the button off where the answer would be a refusal.
 */
export const canResetPassword = (me: Principal | null, user: User | null): boolean =>
  !!me &&
  !!user &&
  can(me, "users:write") &&
  user.id !== me.id &&
  (me.isOwner || !(user.isOwner || user.roleSlugs.includes("admin")));
```

Run: `yarn test src/pages/users/model/people`. Expected: PASS.

- [ ] **Step 10: Write the failing container test**

Append inside `describe("useUsers", …)` in `frontend/src/pages/users/model/use-users.spec.tsx`:

```tsx
  it("resets the open person's password, closes the dialog and says they were signed out", async () => {
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "PUT" ? new Response(null, { status: 204 }) : answer(url, init),
    );
    const { result } = renderHook(() => ({ users: useUsers(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.users.status).toBe("ready"));
    act(() => result.current.users.select("u-1"));
    expect(result.current.users.canResetPassword).toBe(true);
    act(() => result.current.users.setResetting(true));

    act(() => result.current.users.resetPassword("N3w-Passw0rd!"));
    await waitFor(() =>
      expect(result.current.notices[0]?.message).toBe(
        "Password changed. The user was signed out everywhere.",
      ),
    );
    expect(result.current.users.resetting).toBe(false);
    const put = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "PUT");
    expect(put![0]).toBe("/api/auth/users/u-1/password");
    expect(JSON.parse(String((put![1] as RequestInit).body))).toEqual({ password: "N3w-Passw0rd!" });
  });
```

Run: `yarn test src/pages/users/model/use-users`
Expected: FAIL. `canResetPassword` is `undefined`, not `true`.

- [ ] **Step 11: Wire the container**

In `frontend/src/pages/users/model/use-users.ts`:

1. Add `setUserPassword,` to the `@/entities/user` import list, after `setTwoFactorRequired,`.
2. Add `import { canResetPassword } from "./people";` after the `@/shared/session` import.
3. In `export type UsersState`, after `rolesBusy: boolean;` add:

```ts
  /** Whether this reader may set the open person's password. */
  canResetPassword: boolean;
  resetting: boolean;
  setResetting: (open: boolean) => void;
  resetPassword: (password: string) => void;
  resetBusy: boolean;
```

4. After `const [addingRole, setAddingRole] = useState(false);` add:

```ts
  const [resetting, setResetting] = useState(false);
```

5. After the `roleChange` mutation add:

```ts
  // No refresh: nothing on the list changes when a password does.
  const reset = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      setUserPassword(id, password),
    onSuccess: () => {
      notify.success("Password changed. The user was signed out everywhere.");
      setResetting(false);
    },
    onError: fail,
  });
```

6. In the returned object, after `rolesBusy: roleChange.isPending,` add:

```ts
    canResetPassword: canResetPassword(me, selected),
    resetting,
    setResetting,
    resetPassword: (password) => selected && reset.mutate({ id: selected.id, password }),
    resetBusy: reset.isPending,
```

Run: `yarn test src/pages/users/model`. Expected: PASS for the whole folder.

- [ ] **Step 12: Write the failing screen tests**

In `frontend/src/pages/users/ui/users-screen.spec.tsx`:

1. In the `state()` factory, after `rolesBusy: false,` add:

```ts
  canResetPassword: false,
  resetting: false,
  setResetting: vi.fn(),
  resetPassword: vi.fn(),
  resetBusy: false,
```

2. Replace the whole test `it("never offers a password reset — nothing can reset one yet", …)` with:

```tsx
  it("offers a password reset only where the container allows one", async () => {
    showing({ selected: USER });
    expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();
    cleanup();

    const s = showing({ selected: USER, canResetPassword: true });
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(s.setResetting).toHaveBeenCalledWith(true);
  });

  it("sends the password the reset dialog holds for the person who is open", async () => {
    const s = showing({ selected: USER, canResetPassword: true, resetting: true });
    const dialog = screen.getByRole("dialog", { name: "New password for a.ivanova" });
    const value = (within(dialog).getByLabelText(/^Password/) as HTMLInputElement).value;
    await userEvent.click(within(dialog).getByRole("button", { name: "Change password" }));
    expect(s.resetPassword).toHaveBeenCalledWith(value);
  });
```

Run: `yarn test src/pages/users/ui/users-screen`
Expected: FAIL. The first new test finds no "Reset password" button; the second finds no dialog.

- [ ] **Step 13: Wire the screen**

In `frontend/src/pages/users/ui/users-screen.tsx`:

1. After `import { AddRoleDialog, RoleChips } from "@/features/role-assign";` add `import { ResetPasswordDialog } from "@/features/reset-password";`.
2. In the `<UsersPage …>` props, after `onCreateUser={() => s.setCreating(true)}` add:

```tsx
        onResetPassword={s.canResetPassword ? () => s.setResetting(true) : undefined}
```

3. After the `{s.creating ? (<CreateUserDialog … />) : null}` block add:

```tsx
      {s.resetting && selected ? (
        <ResetPasswordDialog
          open
          username={selected.username}
          busy={s.resetBusy}
          onClose={() => s.setResetting(false)}
          onSubmit={s.resetPassword}
        />
      ) : null}
```

4. Update the now-stale prop comments:
   - In `frontend/src/pages/users/ui/users-page.tsx`, replace `/** Absent while no endpoint exists for it — the inspector then omits it. */` with `/** Absent when this reader may not reset the open person's password — the inspector then omits it. */`
   - In `frontend/src/widgets/person-inspector/ui/person-inspector.tsx`, replace `/** Absent while no endpoint exists for it — the button is then not drawn. */` with `/** Absent when this reader may not reset this person's password — the button is then not drawn. */`

Run: `yarn test src/pages/users src/widgets/person-inspector`. Expected: PASS.

- [ ] **Step 14: Correct the docs that say reset is not drawn**

In `frontend/CLAUDE.md`, replace

```
- **Reset password is not rendered.** No endpoint wires it, and an action with
  no endpoint is not drawn.
```

with

```
- **Reset password is drawn only where the gateway would allow it**
  (`canResetPassword`, `pages/users/model/people.ts`): never on the reader's
  own row (`/account` asks for the old password), and on a Company Owner's or
  Root's row only for Root. `PUT /api/auth/users/{id}/password` signs the user
  out everywhere; the dialog opens holding a generated password, shown.
```

In `frontend/README.md`, replace

```
Three rulings a reader would otherwise trip on. **Reset password is not
rendered** — nothing can reset one yet, and an action with no endpoint is not
drawn. **There is no owner toggle**
```

with

```
Three rulings a reader would otherwise trip on. **Reset password is drawn only
where the gateway would allow it**: never on your own row, and on a Company
Owner's or Root's only for Root. **There is no owner toggle**
```

- [ ] **Step 15: Full frontend gates**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint && yarn test:coverage && yarn build`
Expected: all three exit 0. Lint means `tsc -b` plus oxlint with no errors. Coverage stays at or above the 90/85/90/90 thresholds.

Then count the non-blank, non-comment lines by hand in `use-users.ts`, `users-screen.tsx`, `people.ts` and `reset-password-dialog.tsx`. Each must be ≤ 200. `use-users.ts` is the tight one, at about 193 raw lines.

- [ ] **Step 16: Commit (frontend only, hook skipped)**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/shared/api/dto.ts \
  frontend/src/shared/ui/password-field/password-field.tsx \
  frontend/src/shared/ui/password-field/password-field.spec.tsx \
  frontend/src/entities/user/api/users-gateway.ts \
  frontend/src/entities/user/api/users-gateway.spec.ts \
  frontend/src/entities/user/index.ts \
  frontend/src/features/reset-password \
  frontend/src/pages/users/model/people.ts \
  frontend/src/pages/users/model/people.spec.ts \
  frontend/src/pages/users/model/use-users.ts \
  frontend/src/pages/users/model/use-users.spec.tsx \
  frontend/src/pages/users/ui/users-screen.tsx \
  frontend/src/pages/users/ui/users-screen.spec.tsx \
  frontend/src/pages/users/ui/users-page.tsx \
  frontend/src/widgets/person-inspector/ui/person-inspector.tsx \
  frontend/CLAUDE.md frontend/README.md
git diff --cached --name-only   # expect 20 paths (the feature folder adds 4), none under backend/
git commit --no-verify -m "feat(frontend): reset a user's password from the Users inspector

The inspector's Reset password button is now drawn where the gateway would
allow it (never your own row; an admin's or Root's only for Root) and opens a
dialog holding a generated, shown password with Generate and Copy. Submitting
PUTs /api/auth/users/{id}/password; the user is signed out everywhere.

--no-verify: frontend-only change; the hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9"
git show --stat HEAD | grep -c '^ backend/'   # must print 0
```

**Skipped:** a gRPC transport test for `SetUserPassword` in `grpcapi`. The package has no tests; the handler is four lines over the existing `actor()` and `mapError()`, and the service test pins every decision. Add one if `grpcapi` ever gets a test harness.

---

## Parts B and C

> Sections B (edit title/description) and C (source replace keeps every binding
> in place) of the plan for `docs/superpowers/specs/2026-09-23-edit-and-batching-design.md`.
> Steps use checkbox (`- [ ]`) syntax. Every task is self-contained: an
> implementer sees only their own task, so each repeats its skills, paths and
> commands.

## Conventions every task below relies on

- Repo root: `/Users/vbncursed/programming/rosneft`. All paths below are relative to it.
- **Never** run `git stash`, `git checkout`, `git reset`, `git restore`, `git add -A`, `git add .`,
  or `pkill -f vite`. A parallel session works in the same clone. Stage **by path**, then
  check `git diff --cached --name-only` shows only your files before committing.
- Go gate on this Mac needs Apple's clang, or `vet` dies on a missing libz3:
  `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` (~80 s). Put the
  same two variables in front of `git commit` for a Go commit so the pre-commit hook passes.
- Before editing any Go file, run the modern-Go list for it and read the **whole** output:
  `sh /Users/vbncursed/.claude/plugins/cache/goland-claude-marketplace/modern-go-guidelines/1.1.1/skills/use-modern-go/scripts/run-tool.sh list --file-path <file>`.
  Repo idioms already required: `t.Context()`, `new(val)` for pointer literals, `min`/`max`.
- Go tests: `testify/suite` + `gotest.tools/v3/assert` + minimock. Assertions stay `assert.X(s.T(), …)`.
- Go file cap 200 lines (by hand). Frontend file cap 200 lines too.
- Frontend: **yarn only**. Type-check is `yarn lint` (`tsc -b --noEmit && oxlint`); a bare
  `tsc --noEmit` checks nothing. Frontend-only commits use `--no-verify` (the hook runs the Go gate).
- Every commit message ends with the line
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Integration suites (`-tags=integration`) need Docker and are **not** run by `make check`/CI;
  run them by hand exactly as each task says.

---

### Task B1: Gateway PATCH takes title and description

**Skills to load (Skill tool, before anything else):** `ponytail:ponytail`, `clean-code`,
`superpowers:test-driven-development`, `modern-go-guidelines:use-modern-go`,
`cc-skills-golang:golang-how-to` (then `cc-skills-golang:golang-testing`,
`cc-skills-golang:golang-error-handling`, `cc-skills-golang:golang-security`).

**Files:**
- Modify: `backend/services/gateway-service/api/openapi.yaml` (schemas `ModelUpdate` ~:357, `TerritoryUpdate` ~:369)
- Regenerate: `backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go`, `…/httpapi/openapi_spec_gen.go`
- Modify: `backend/services/gateway-service/internal/domain/types.go:45-56`
- Modify: `backend/services/gateway-service/internal/service/models.go:42-67` (+ new helper at file end)
- Modify: `backend/services/gateway-service/internal/service/territories.go:114-134`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/models.go:47-63`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/territories.go:72-88`
- Test: `backend/services/gateway-service/internal/service/models_test.go`, `…/service/territories_test.go`
- Create (test): `backend/services/gateway-service/internal/transport/httpapi/models_test.go`, `…/httpapi/territories_test.go`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `domain.ModelUpdate{Title, Description, ThumbnailBlobHash *string}`
  - `domain.TerritoryUpdate{Title, Description, ExternalPanoramaURL *string}`
  - OpenAPI `ModelUpdate` / `TerritoryUpdate` gain optional `title` (`minLength: 1`) and `description`
    — Task B2 regenerates the TS DTOs from this.
  - Behaviour: omitted field = unchanged; `title` present but blank after `strings.TrimSpace` = 400
    `invalid_input` ("empty title"), refused **before** any catalog call. Permissions unchanged
    (`PATCH /api/models/{slug}` → `model:write`, `PATCH /api/territories/{slug}` → `territory:write`,
    already in `authhttp/route_permissions.go:33,39`).

- [ ] **Step 1: Write the failing service tests**

Append to `backend/services/gateway-service/internal/service/models_test.go` (after `TestUpdateSetsThumbnailViaReadModifyWrite`):

```go
func (s *ModelsSuite) TestUpdateMergesTitleAndDescription() {
	current := domain.Model{Slug: "m1", Title: "Box", Description: "old", SourceBlobHash: "h", ThumbnailBlobHash: "t"}
	s.cat.GetModelMock.Expect(s.ctx, "m1").Return(current, nil)
	merged := current
	merged.Title = "Crate"
	merged.Description = ""
	s.cat.UpsertModelMock.Expect(s.ctx, merged).Return(merged, nil)

	saved, err := s.svc.UpdateModel(s.ctx, "m1", domain.ModelUpdate{Title: new("Crate"), Description: new("")}, rootScope)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), saved.Title, "Crate")
}

func (s *ModelsSuite) TestUpdateLeavesOmittedDetailsUntouched() {
	current := domain.Model{Slug: "m1", Title: "Box", Description: "keep", SourceBlobHash: "h"}
	s.cat.GetModelMock.Expect(s.ctx, "m1").Return(current, nil)
	merged := current
	merged.Title = "Crate"
	s.cat.UpsertModelMock.Expect(s.ctx, merged).Return(merged, nil)

	_, err := s.svc.UpdateModel(s.ctx, "m1", domain.ModelUpdate{Title: new("Crate")}, rootScope)
	assert.NilError(s.T(), err)
}

func (s *ModelsSuite) TestUpdateRejectsBlankTitleBeforeReading() {
	// No catalog expectation: a GetModel call would fail the test.
	_, err := s.svc.UpdateModel(s.ctx, "m1", domain.ModelUpdate{Title: new("  ")}, rootScope)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
```

Append to `backend/services/gateway-service/internal/service/territories_test.go`:

```go
func (s *TerritoriesSuite) TestUpdateMergesTitleAndDescription() {
	current := domain.Territory{Slug: "t1", Title: "Site", Description: "old", SourceBlobHash: "h", ExternalPanoramaURL: "https://tour"}
	s.cat.GetTerritoryMock.Expect(s.ctx, "t1", "").Return(current, nil)
	merged := current
	merged.Title = "North site"
	merged.Description = "Pad and tanks"
	s.cat.UpsertTerritoryMock.Expect(s.ctx, merged).Return(merged, nil)

	saved, err := s.svc.UpdateTerritory(s.ctx, "t1", domain.TerritoryUpdate{Title: new("North site"), Description: new("Pad and tanks")})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), saved.Title, "North site")
}

func (s *TerritoriesSuite) TestUpdateLeavesOmittedDetailsUntouched() {
	current := domain.Territory{Slug: "t1", Title: "Site", Description: "keep", SourceBlobHash: "h"}
	s.cat.GetTerritoryMock.Expect(s.ctx, "t1", "").Return(current, nil)
	merged := current
	merged.ExternalPanoramaURL = "https://tour"
	s.cat.UpsertTerritoryMock.Expect(s.ctx, merged).Return(merged, nil)

	_, err := s.svc.UpdateTerritory(s.ctx, "t1", domain.TerritoryUpdate{ExternalPanoramaURL: new("https://tour")})
	assert.NilError(s.T(), err)
}

func (s *TerritoriesSuite) TestUpdateRejectsBlankTitleBeforeReading() {
	// No catalog expectation: a GetTerritory call would fail the test.
	_, err := s.svc.UpdateTerritory(s.ctx, "t1", domain.TerritoryUpdate{Title: new("")})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race ./internal/service/ -run 'TestModelsSuite|TestTerritoriesSuite'`
Expected: build failure — `unknown field Title in struct literal of type domain.ModelUpdate` (and the same for `domain.TerritoryUpdate`).

- [ ] **Step 3: Add the fields to the domain**

In `backend/services/gateway-service/internal/domain/types.go` replace the two update structs:

```go
// TerritoryUpdate carries the mutable fields of PATCH /api/territories/{slug}.
// Each field is a pointer: nil means "leave unchanged", so a caller can clear
// a value (empty string) distinctly from not touching it. The slug is not
// among them: URLs, job keys and the territory gate all key on it.
type TerritoryUpdate struct {
	Title               *string
	Description         *string
	ExternalPanoramaURL *string
}

// ModelUpdate carries the mutable model fields a PATCH may set. Nil = leave
// unchanged (read-modify-write over UpsertModel, mirroring TerritoryUpdate).
type ModelUpdate struct {
	Title             *string
	Description       *string
	ThumbnailBlobHash *string
}
```

- [ ] **Step 4: Merge them in the service**

`backend/services/gateway-service/internal/service/models.go` — add `"strings"` to the imports, then make `UpdateModel`:

```go
func (g *Gateway) UpdateModel(ctx context.Context, slug string, update domain.ModelUpdate, scope domain.BlobScope) (domain.Model, error) {
	if slug == "" {
		return domain.Model{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	if err := validateTitlePatch(update.Title); err != nil {
		return domain.Model{}, err
	}
	if update.ThumbnailBlobHash != nil {
		if err := g.authorizeBlobs(ctx, scope, *update.ThumbnailBlobHash); err != nil {
			return domain.Model{}, err
		}
	}
	current, err := g.catalog.GetModel(ctx, slug)
	if err != nil {
		return domain.Model{}, err
	}
	if update.Title != nil {
		current.Title = *update.Title
	}
	if update.Description != nil {
		current.Description = *update.Description
	}
	if update.ThumbnailBlobHash != nil {
		current.ThumbnailBlobHash = *update.ThumbnailBlobHash
	}
	saved, err := g.catalog.UpsertModel(ctx, current)
	if err != nil {
		return domain.Model{}, fmt.Errorf("update model: %w", err)
	}
	return saved, nil
}
```

and append at the end of `models.go`:

```go
// validateTitlePatch refuses a title a PATCH sends blank; nil leaves the title
// alone. Both update paths call it before reading the row, so a refusal costs
// no catalog round trip. Last writer wins — no If-Match, by decision.
func validateTitlePatch(title *string) error {
	if title != nil && strings.TrimSpace(*title) == "" {
		return fmt.Errorf("%w: empty title", domain.ErrInvalidInput)
	}
	return nil
}
```

`backend/services/gateway-service/internal/service/territories.go` — make `UpdateTerritory`:

```go
func (g *Gateway) UpdateTerritory(ctx context.Context, slug string, update domain.TerritoryUpdate) (domain.Territory, error) {
	if slug == "" {
		return domain.Territory{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	if err := validateTitlePatch(update.Title); err != nil {
		return domain.Territory{}, err
	}
	current, err := g.catalog.GetTerritory(ctx, slug, "") // mutation flow; gated by permission
	if err != nil {
		return domain.Territory{}, err
	}
	if update.Title != nil {
		current.Title = *update.Title
	}
	if update.Description != nil {
		current.Description = *update.Description
	}
	if update.ExternalPanoramaURL != nil {
		current.ExternalPanoramaURL = *update.ExternalPanoramaURL
	}
	saved, err := g.catalog.UpsertTerritory(ctx, current)
	if err != nil {
		return domain.Territory{}, fmt.Errorf("update territory: %w", err)
	}
	return saved, nil
}
```

(The catalog's `UpsertTerritory`/`UpsertModel` take the non-empty-slug path, `ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = …` — the slug is not re-derived from the new title. No catalog change.)

- [ ] **Step 5: Run the service tests — they pass**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race ./internal/service/ -run 'TestModelsSuite|TestTerritoriesSuite'`
Expected: `ok  github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service`

- [ ] **Step 6: Write the failing handler tests**

Create `backend/services/gateway-service/internal/transport/httpapi/models_test.go`:

```go
package httpapi

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// modelPatchRecorder captures the patch UpdateModel hands the service.
type modelPatchRecorder struct {
	Service
	got *domain.ModelUpdate
}

func (r modelPatchRecorder) UpdateModel(_ context.Context, _ string, u domain.ModelUpdate, _ domain.BlobScope) (domain.Model, error) {
	*r.got = u
	return domain.Model{Slug: "pump"}, nil
}

type ModelsHandlerSuite struct{ suite.Suite }

func TestModelsHandlerSuite(t *testing.T) { suite.Run(t, new(ModelsHandlerSuite)) }

func (s *ModelsHandlerSuite) TestUpdateForwardsTitleAndDescription() {
	var got domain.ModelUpdate
	body := UpdateModelJSONRequestBody{Title: new("Pump"), Description: new("")}

	resp, err := New(modelPatchRecorder{got: &got}).UpdateModel(s.T().Context(),
		UpdateModelRequestObject{Slug: "pump", Body: &body})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, domain.ModelUpdate{Title: new("Pump"), Description: new("")})
	_, ok := resp.(UpdateModel200JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
}
```

Create `backend/services/gateway-service/internal/transport/httpapi/territories_test.go`:

```go
package httpapi

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// territoryPatchRecorder captures the patch UpdateTerritory hands the service.
type territoryPatchRecorder struct {
	Service
	got *domain.TerritoryUpdate
}

func (r territoryPatchRecorder) UpdateTerritory(_ context.Context, _ string, u domain.TerritoryUpdate) (domain.Territory, error) {
	*r.got = u
	return domain.Territory{Slug: "yard"}, nil
}

type TerritoriesHandlerSuite struct{ suite.Suite }

func TestTerritoriesHandlerSuite(t *testing.T) { suite.Run(t, new(TerritoriesHandlerSuite)) }

func (s *TerritoriesHandlerSuite) TestUpdateForwardsTitleAndDescription() {
	var got domain.TerritoryUpdate
	body := UpdateTerritoryJSONRequestBody{Title: new("Yard"), Description: new("North pad")}

	resp, err := New(territoryPatchRecorder{got: &got}).UpdateTerritory(s.T().Context(),
		UpdateTerritoryRequestObject{Slug: "yard", Body: &body})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, domain.TerritoryUpdate{Title: new("Yard"), Description: new("North pad")})
	_, ok := resp.(UpdateTerritory200JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
}
```

- [ ] **Step 7: Run them and watch them fail**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race ./internal/transport/httpapi/ -run 'TestModelsHandlerSuite|TestTerritoriesHandlerSuite'`
Expected: build failure — `unknown field Title in struct literal of type UpdateModelJSONRequestBody`.

- [ ] **Step 8: Extend the OpenAPI schemas and regenerate**

In `backend/services/gateway-service/api/openapi.yaml` replace the two schemas:

```yaml
    ModelUpdate:
      type: object
      description: |
        Body for PATCH /api/models/{slug}. Updates mutable fields only; the
        slug, the source archive and conversion are untouched. Omitted fields
        are left unchanged.
      properties:
        title:
          type: string
          minLength: 1
          description: New title; a blank one is refused with 400. The slug does not follow it.
        description: { type: string }
        thumbnailBlobHash:
          type: string
          pattern: '^([0-9a-f]{64})?$'
          description: New thumbnail blob hash; empty string clears it.

    TerritoryUpdate:
      type: object
      description: |
        Body for PATCH /api/territories/{slug}. Updates mutable fields only;
        the slug, the source archive and conversion are untouched. Omitted
        fields are left unchanged.
      properties:
        title:
          type: string
          minLength: 1
          description: New title; a blank one is refused with 400. The slug does not follow it.
        description: { type: string }
        externalPanoramaUrl: { type: string }
```

(No `maxLength`: `EntityCreate.title` declares none and the column is unbounded `TEXT`; the 1 MiB `LimitBody` is the only cap. See "Spec discrepancies".)

Run: `make -C /Users/vbncursed/programming/rosneft/backend openapi-gen`
Expected: exits 0; `git -C /Users/vbncursed/programming/rosneft diff --stat backend/services/gateway-service/internal/transport/httpapi/` lists `openapi_gen.go` and `openapi_spec_gen.go`, and `grep -n 'Title \*string' backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go` shows it on both `ModelUpdate` and `TerritoryUpdate`.

- [ ] **Step 9: Wire the handlers**

`backend/services/gateway-service/internal/transport/httpapi/models.go`, in `UpdateModel`:

```go
	m, err := s.svc.UpdateModel(ctx, req.Slug, domain.ModelUpdate{
		Title:             req.Body.Title,
		Description:       req.Body.Description,
		ThumbnailBlobHash: req.Body.ThumbnailBlobHash,
	}, blobScope(ctx))
```

`backend/services/gateway-service/internal/transport/httpapi/territories.go`, in `UpdateTerritory`:

```go
	t, err := s.svc.UpdateTerritory(ctx, req.Slug, domain.TerritoryUpdate{
		Title:               req.Body.Title,
		Description:         req.Body.Description,
		ExternalPanoramaURL: req.Body.ExternalPanoramaUrl,
	})
```

The existing `isInvalid(err)` → 400 branches already map the blank-title refusal.

- [ ] **Step 10: Run the handler tests and the module — green**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race ./...`
Expected: every package `ok` (including `internal/transport/authhttp`, whose `route_permissions_spec_test.go` must still find both PATCH routes in `routePerms`).

- [ ] **Step 11: Commit gate**

Run: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C /Users/vbncursed/programming/rosneft/backend check`
Expected: ends without error (fmt-check, tidy-check, vet, lint, test, vuln all pass).

- [ ] **Step 12: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add backend/services/gateway-service/api/openapi.yaml \
  backend/services/gateway-service/internal/domain/types.go \
  backend/services/gateway-service/internal/service/models.go \
  backend/services/gateway-service/internal/service/territories.go \
  backend/services/gateway-service/internal/service/models_test.go \
  backend/services/gateway-service/internal/service/territories_test.go \
  backend/services/gateway-service/internal/transport/httpapi/models.go \
  backend/services/gateway-service/internal/transport/httpapi/territories.go \
  backend/services/gateway-service/internal/transport/httpapi/models_test.go \
  backend/services/gateway-service/internal/transport/httpapi/territories_test.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go
git diff --cached --name-only
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) git commit -m "$(cat <<'EOF'
feat(gateway): PATCH edits the title and description of models and territories

Both fields are optional; an omitted one is left alone and a blank title is
refused with 400 before the catalog is read. The slug never follows the title:
URLs, job keys and the territory gate all key on it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

Expected: `git diff --cached --name-only` printed exactly the 12 paths above; the commit succeeds.

---

### Task B2: `EditDetailsDialog` and its three entry points

**Skills to load (Skill tool, before anything else):** `ponytail:ponytail`, `clean-code`,
`superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`,
`tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`.

**Files:**
- Regenerate: `frontend/src/shared/api/dto.ts`
- Create: `frontend/src/features/edit-entity/index.ts`
- Create: `frontend/src/features/edit-entity/model/use-edit-details.ts`
- Create: `frontend/src/features/edit-entity/ui/edit-details-dialog.tsx`
- Create (test): `frontend/src/features/edit-entity/ui/edit-details-dialog.spec.tsx`
- Modify: `frontend/src/pages/model-detail/model/detail.tsx` (`ModelDetailPageProps`)
- Modify: `frontend/src/pages/model-detail/ui/model-aside.tsx`, `…/ui/model-detail-page.tsx`, `…/ui/model-detail-screen.tsx`
- Modify (test): `frontend/src/pages/model-detail/ui/model-detail-screen.spec.tsx`
- Modify: `frontend/src/pages/territory-viewer/model/viewer-props.ts` (`ViewerHeaderProps`, `PageParts`)
- Modify: `frontend/src/pages/territory-viewer/model/page-props.ts` (header block)
- Modify: `frontend/src/pages/territory-viewer/model/use-territory-viewer.ts:209-212`
- Modify: `frontend/src/pages/territory-viewer/ui/viewer-header.tsx`, `…/ui/territory-viewer-screen.tsx`
- Modify (test): `frontend/src/pages/territory-viewer/ui/viewer-header.spec.tsx`, `…/ui/territory-viewer-screen.spec.tsx`, `…/model/page-props.spec.ts`
- Modify: `frontend/src/pages/territory-catalog/ui/territory-catalog-page.tsx`, `…/ui/territory-catalog-screen.tsx`, `frontend/src/pages/territory-catalog/territory-catalog-page.fixture.tsx`
- Modify (test): `frontend/src/pages/territory-catalog/ui/territory-catalog-page.spec.tsx`, `…/ui/territory-catalog-screen.spec.tsx`

**Interfaces:**
- Consumes (Task B1): DTOs `components["schemas"]["ModelUpdate"]` and `["TerritoryUpdate"]` carrying
  `title?: string; description?: string`. Existing `updateModel(slug, patch: ModelPatch): Promise<Model>`
  (`@/entities/model`) and `updateTerritory(slug, body: TerritoryUpdate): Promise<Territory>`
  (`@/entities/territory`) — unchanged, they type against those DTOs.
- Produces:
  - `EditDetailsDialog(props: EditDetailsDialogProps)` from `@/features/edit-entity`, with
    `EditDetailsDialogProps = { kind: "model" | "territory"; slug: string; title: string; description?: string; onClose: () => void }`.
    Mount it **only while open** (its draft resets by unmounting, as `CreateUserDialog`'s does).
  - `useEditDetails(kind, slug)` — a TanStack `useMutation` over `DetailsPatch = { title?: string; description?: string }`;
    on success writes `[kind, slug]`, the list (`["models"]` / `["territories"]`) and, for a territory,
    `["scene", slug]` with `setQueryData` — no refetch.
  - `ModelDetailPageProps.onEdit?: () => void`, `ModelAsideProps.onEdit?: () => void`
  - `ViewerHeaderProps.description?: string`, `ViewerHeaderProps.onEdit?: () => void`, `PageParts.description?: string`
  - `TerritoryCatalogPageProps.onEdit: (slug: string) => void`

- [ ] **Step 1: Regenerate the DTOs from B1's spec**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn openapi:generate`
Expected: exits 0; `git -C /Users/vbncursed/programming/rosneft diff frontend/src/shared/api/dto.ts` shows `title?: string;` and `description?: string;` added to both `ModelUpdate` and `TerritoryUpdate`. (The `resolutions` pin to `typescript@5.9.3` for the generator is deliberate — do not touch it.)

- [ ] **Step 2: Write the failing dialog spec**

Create `frontend/src/features/edit-entity/ui/edit-details-dialog.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { EditDetailsDialog, type EditDetailsDialogProps } from "./edit-details-dialog";

const { updateModel, updateTerritory } = vi.hoisted(() => ({
  updateModel: vi.fn(),
  updateTerritory: vi.fn(),
}));
vi.mock("@/entities/model", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateModel,
}));
vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateTerritory,
}));

const MODEL = { slug: "valve", title: "Valve", description: "Gate valve.", sourceBlobHash: "a".repeat(64), usageCount: 0 };
const TERRITORY = { slug: "yard", title: "Yard", sourceBlobHash: "h", placementCount: 0 };

let client: QueryClient;

function Toasts() {
  return (
    <>
      {useNotices().map((n) => (
        <p key={n.id}>{n.message}</p>
      ))}
    </>
  );
}

const open = (over: Partial<EditDetailsDialogProps> = {}) => {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <EditDetailsDialog kind="model" slug="valve" title="Valve" description="Gate valve." onClose={onClose} {...over} />
      <Toasts />
    </QueryClientProvider>,
  );
  return onClose;
};

const titleField = () => screen.getByRole("textbox", { name: /Title/ });
const descriptionField = () => screen.getByRole("textbox", { name: "Description" });
const saveButton = () => screen.getByRole("button", { name: "Save changes" });

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  updateModel.mockReset();
  updateTerritory.mockReset();
  clearNotices();
});

describe("EditDetailsDialog", () => {
  it("opens on the saved details, with Save disabled until something changes", async () => {
    open();
    expect(titleField()).toHaveValue("Valve");
    expect(descriptionField()).toHaveValue("Gate valve.");
    expect(saveButton()).toBeDisabled();

    await userEvent.type(titleField(), " B");
    expect(saveButton()).toBeEnabled();
  });

  it("keeps Save disabled while the title is blank", async () => {
    open();
    await userEvent.clear(titleField());
    await userEvent.type(descriptionField(), " More.");
    expect(saveButton()).toBeDisabled();
  });

  it("sends only the fields that changed, the title trimmed, and closes", async () => {
    updateModel.mockResolvedValue({ ...MODEL, title: "Valve B" });
    const onClose = open();
    await userEvent.clear(titleField());
    await userEvent.type(titleField(), "  Valve B ");
    await userEvent.click(saveButton());

    expect(updateModel).toHaveBeenCalledWith("valve", { title: "Valve B" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("writes the saved details into the model's own query and its library row", async () => {
    client.setQueryData(["model", "valve"], MODEL);
    client.setQueryData(["models"], [MODEL, { ...MODEL, slug: "pump", title: "Pump" }]);
    updateModel.mockResolvedValue({ ...MODEL, description: "Ball valve." });
    open();
    await userEvent.clear(descriptionField());
    await userEvent.type(descriptionField(), "Ball valve.");
    await userEvent.click(saveButton());

    expect(updateModel).toHaveBeenCalledWith("valve", { description: "Ball valve." });
    await waitFor(() => expect(client.getQueryData(["model", "valve"])).toMatchObject({ description: "Ball valve." }));
    const library = client.getQueryData<{ slug: string; title: string }[]>(["models"])!;
    expect(library.map((m) => m.title)).toEqual(["Valve", "Pump"]);
    expect(library[0]).toMatchObject({ description: "Ball valve." });
    expect(screen.getByText("Changes saved")).toBeInTheDocument();
  });

  it("writes a territory's scene bundle too, so the viewer header follows", async () => {
    client.setQueryData(["territory", "yard"], TERRITORY);
    client.setQueryData(["territories"], [TERRITORY]);
    client.setQueryData(["scene", "yard"], { territory: TERRITORY, placements: [] });
    updateTerritory.mockResolvedValue({ ...TERRITORY, title: "North yard" });
    open({ kind: "territory", slug: "yard", title: "Yard", description: undefined });
    await userEvent.clear(titleField());
    await userEvent.type(titleField(), "North yard");
    await userEvent.click(saveButton());

    expect(updateTerritory).toHaveBeenCalledWith("yard", { title: "North yard" });
    await waitFor(() =>
      expect(client.getQueryData<{ territory: { title: string } }>(["scene", "yard"])!.territory.title).toBe("North yard"),
    );
    expect(client.getQueryData(["territory", "yard"])).toMatchObject({ title: "North yard" });
    expect(client.getQueryData(["territories"])).toMatchObject([{ title: "North yard" }]);
  });

  it("keeps the dialog open and says why when the gateway refuses", async () => {
    updateModel.mockRejectedValue(new HttpError(400, { code: "invalid_input", message: "empty title" }, "empty title"));
    const onClose = open();
    await userEvent.type(titleField(), "!");
    await userEvent.click(saveButton());

    expect(await screen.findByText(/empty title/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(titleField()).toHaveValue("Valve!");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn test src/features/edit-entity`
Expected: FAIL — `Failed to resolve import "./edit-details-dialog"`.

- [ ] **Step 4: Write the hook**

Create `frontend/src/features/edit-entity/model/use-edit-details.ts`:

```ts
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { updateModel } from "@/entities/model";
import { updateTerritory } from "@/entities/territory";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type EntityKind = "model" | "territory";
export type DetailsPatch = { title?: string; description?: string };
type Details = { slug: string; title: string; description?: string };

const LIST_KEY: Record<EntityKind, string> = { model: "models", territory: "territories" };

/**
 * Writes a saved title and description into every cached copy of the entity —
 * its own query, its row in the list and, for a territory, the viewer's scene
 * bundle (the header reads its title from there) — so nothing refetches.
 */
function writeBack(client: QueryClient, kind: EntityKind, saved: Details) {
  const merge = <T extends Details>(e: T): T =>
    e.slug === saved.slug ? { ...e, title: saved.title, description: saved.description } : e;
  client.setQueryData<Details>([kind, saved.slug], (old) => old && merge(old));
  client.setQueryData<Details[]>([LIST_KEY[kind]], (old) => old?.map(merge));
  if (kind === "territory") {
    client.setQueryData<{ territory: Details }>(["scene", saved.slug], (old) => old && { ...old, territory: merge(old.territory) });
  }
}

/** PATCHes a model's or territory's title and description; a refusal is a toast. */
export function useEditDetails(kind: EntityKind, slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: DetailsPatch): Promise<Details> =>
      kind === "model" ? updateModel(slug, patch) : updateTerritory(slug, patch),
    onSuccess: (saved) => {
      writeBack(client, kind, saved);
      notify.success("Changes saved");
    },
    onError: (err) => notify.error(messageOf(err)),
  });
}
```

(`updateModel`/`updateTerritory` are imported from the entity barrels on purpose: a spec's `vi.mock` of the barrel reaches them.)

- [ ] **Step 5: Write the dialog and the barrel**

Create `frontend/src/features/edit-entity/ui/edit-details-dialog.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Textarea, TextField } from "@/shared/ui/text-field";
import { useEditDetails, type DetailsPatch, type EntityKind } from "../model/use-edit-details";

export type EditDetailsDialogProps = {
  kind: EntityKind;
  slug: string;
  title: string;
  description?: string;
  onClose: () => void;
};

type Draft = { title: string; description: string };

const FORM_ID = "edit-details";

/** The fields that differ from what is saved; null when none do or the title is blank. */
function changedFields(draft: Draft, saved: Draft): DetailsPatch | null {
  const title = draft.title.trim();
  if (title === "") return null;
  const patch: DetailsPatch = {
    ...(title !== saved.title ? { title } : {}),
    ...(draft.description !== saved.description ? { description: draft.description } : {}),
  };
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Title and description of a model or territory. The slug never changes, so
 * links, conversion jobs and access keep working. Mount it only while open —
 * the draft resets by unmounting, not by an effect.
 */
export function EditDetailsDialog({ kind, slug, title, description = "", onClose }: EditDetailsDialogProps) {
  const [draft, setDraft] = useState<Draft>({ title, description });
  const save = useEditDetails(kind, slug);
  const patch = changedFields(draft, { title, description });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (patch) save.mutate(patch, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      onClose={onClose}
      overline={kind === "model" ? "Model" : "Territory"}
      title="Edit details"
      description="The slug stays as it is, so links and placements keep working."
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!patch} loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
        <TextField
          label="Title"
          required
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          disabled={save.isPending}
        />
        <Textarea
          label="Description"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          disabled={save.isPending}
        />
      </form>
    </Modal>
  );
}
```

Create `frontend/src/features/edit-entity/index.ts`:

```ts
export { EditDetailsDialog, type EditDetailsDialogProps } from "./ui/edit-details-dialog";
```

- [ ] **Step 6: Run the dialog spec — green**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn test src/features/edit-entity`
Expected: `6 passed`.

- [ ] **Step 7: Write the failing entry-point tests**

`frontend/src/pages/model-detail/ui/model-detail-screen.spec.tsx` — add below the `vi.mock("@tanstack/react-router", …)` line:

```tsx
vi.mock("@/features/edit-entity", () => ({
  EditDetailsDialog: ({ title }: { title: string }) => <div role="dialog" aria-label={`Edit ${title}`} />,
}));
```

and inside `describe("ModelDetailScreen", …)`:

```tsx
  it("opens the details editor from the aside", async () => {
    useModelDetail.mockReturnValue(readyState());
    render(<ModelDetailScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByRole("dialog", { name: "Edit Valve Assembly" })).toBeInTheDocument();
  });

  it("offers no details editor without model:write", () => {
    useModelDetail.mockReturnValue(readyState({ canWrite: false }));
    render(<ModelDetailScreen />);
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
  });
```

`frontend/src/pages/territory-viewer/ui/viewer-header.spec.tsx` — change the imports to

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
```

and add inside `describe("ViewerHeader", …)`:

```tsx
  it("offers Edit details to a writer once the screen wires it", async () => {
    const onEdit = vi.fn();
    render(<ViewerHeader {...props({ onEdit })} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("offers no Edit details without the grant", () => {
    render(<ViewerHeader {...props({ canReplace: false, onEdit: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
  });
```

`frontend/src/pages/territory-viewer/ui/territory-viewer-screen.spec.tsx` — add `import userEvent from "@testing-library/user-event";`, the same `vi.mock("@/features/edit-entity", …)` block as above, and:

```tsx
  it("opens the details editor from the header", async () => {
    useParams.mockReturnValue({ slug: "refinery-block-c" });
    useSceneSeeded.mockReturnValue(true);
    useTerritoryViewer.mockReturnValue(READY());
    render(<TerritoryViewerScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByRole("dialog", { name: "Edit Refinery Block C" })).toBeInTheDocument();
  });
```

`frontend/src/pages/territory-viewer/model/page-props.spec.ts` — inside `describe("pageProps · header", …)`:

```ts
  it("hands the description to the header, for the details editor it opens", () => {
    expect(pageProps(parts({ description: "Tank farm" })).header.description).toBe("Tank farm");
  });
```

(`parts(over: Partial<PageParts>)` at `page-props.spec.ts:99` spreads its argument over the defaults.)

`frontend/src/pages/territory-catalog/ui/territory-catalog-page.spec.tsx` — add `onEdit: vi.fn(),` to the `props()` factory next to `onReplace`, and:

```tsx
  it("offers Edit details on each card to a writer and hands up the slug", async () => {
    const onEdit = vi.fn();
    render(<TerritoryCatalogPage {...props({ onEdit })} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit details of North Ridge Pad" }));
    expect(onEdit).toHaveBeenCalledWith("north-ridge-pad");
  });

  it("offers no Edit details without territory:write", () => {
    render(<TerritoryCatalogPage {...props({ canReplace: false })} />);
    expect(screen.queryByRole("button", { name: /Edit details of/ })).not.toBeInTheDocument();
  });
```

`frontend/src/pages/territory-catalog/ui/territory-catalog-screen.spec.tsx` — the same `vi.mock("@/features/edit-entity", …)` block, and:

```tsx
  it("opens the details editor for the card whose pencil was pressed", async () => {
    useTerritoryCatalog.mockReturnValue(state());
    render(<TerritoryCatalogScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Edit details of T 1" }));
    expect(screen.getByRole("dialog", { name: "Edit T 1" })).toBeInTheDocument();
  });
```

- [ ] **Step 8: Run them and watch them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn test src/pages/model-detail src/pages/territory-viewer src/pages/territory-catalog`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Edit details"` (and `… "Edit details of North Ridge Pad"`), plus the page-props case failing on `undefined`.

- [ ] **Step 9: Model detail — button in the About card, dialog in the screen**

`frontend/src/pages/model-detail/model/detail.tsx` — in `ModelDetailPageProps` add after `onRemoveThumbnail`:

```ts
  /** Opens the details editor; absent (a fixture) draws no button. */
  onEdit?: () => void;
```

`frontend/src/pages/model-detail/ui/model-aside.tsx` — add `onEdit?: () => void;` to `ModelAsideProps`, add `onEdit` to `ModelAside`'s destructured props, and replace the About card's `<p className={`m-0 ${OVERLINE}`}>About</p>` with:

```tsx
        <div className="flex items-baseline justify-between">
          <p className={`m-0 ${OVERLINE}`}>About</p>
          {canWrite && onEdit ? (
            <button type="button" aria-label="Edit details" className={ACTION} onClick={onEdit}>
              edit
            </button>
          ) : null}
        </div>
```

`frontend/src/pages/model-detail/ui/model-detail-page.tsx` — add `onEdit` to the destructured props and pass `onEdit={onEdit}` to `<ModelAside … />`.

`frontend/src/pages/model-detail/ui/model-detail-screen.tsx` — add imports `import { useState } from "react";` and `import { EditDetailsDialog } from "@/features/edit-entity";`; right after `const s = useModelDetail(slug);` add `const [editing, setEditing] = useState(false);`; pass `onEdit={() => setEditing(true)}` to `<ModelDetailPage … />`; and after the `{s.pending ? … : null}` block add:

```tsx
      {editing ? (
        <EditDetailsDialog
          kind="model"
          slug={s.model.slug}
          title={s.model.title}
          description={s.model.description}
          onClose={() => setEditing(false)}
        />
      ) : null}
```

- [ ] **Step 10: Viewer — description threaded to the header, dialog in the screen**

`frontend/src/pages/territory-viewer/model/viewer-props.ts` — in `ViewerHeaderProps` add after `canReplace: boolean;`:

```ts
  /** What the details editor opens with; the header itself does not print it. */
  description?: string;
  /** Opens the details editor. The screen supplies it, so a fixture draws no button. */
  onEdit?: () => void;
```

and in `PageParts` add after `title: string;`:

```ts
  description?: string;
```

`frontend/src/pages/territory-viewer/model/page-props.ts` — in the `header: { … }` block add after `title,`:

```ts
      description: p.description,
```

`frontend/src/pages/territory-viewer/model/use-territory-viewer.ts` — in the `pageProps({ … })` call add after `title: bundle!.territory.title,`:

```ts
      description: bundle!.territory.description,
```

`frontend/src/pages/territory-viewer/ui/viewer-header.tsx` — add `import { Button } from "@/shared/ui/button";` (keep `linkButtonClass` in the same import: `import { Button, linkButtonClass } from "@/shared/ui/button";`), add `onEdit` to the destructured props, and put this before the `canReplace` link inside the right cluster:

```tsx
        {canReplace && onEdit ? (
          <Button variant="secondary" onClick={onEdit}>
            <Icon name="pencil" size={14} className="mr-2" />
            Edit details
          </Button>
        ) : null}
```

`frontend/src/pages/territory-viewer/ui/territory-viewer-screen.tsx` — add `import { useState } from "react";` and `import { EditDetailsDialog } from "@/features/edit-entity";`; in `ViewerBody` add `const [editing, setEditing] = useState(false);` right after `const state = useTerritoryViewer(slug);`, and replace `return <TerritoryViewerPage {...state} />;` with:

```tsx
  return (
    <>
      <TerritoryViewerPage {...state} header={{ ...state.header, onEdit: () => setEditing(true) }} />
      {editing ? (
        <EditDetailsDialog
          kind="territory"
          slug={slug}
          title={state.header.title}
          description={state.header.description}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
```

(`pageProps` stays pure and the page stays hook-free: the one piece of state lives in the screen, the container that already holds hooks. The saved title reaches the header through `["scene", slug]`, which `useEditDetails` writes.)

- [ ] **Step 11: Territory catalog — pencil on the card, dialog in the screen**

`frontend/src/pages/territory-catalog/ui/territory-catalog-page.tsx` — add `onEdit: (slug: string) => void;` to `TerritoryCatalogPageProps` (after `onReplace`), add `onEdit` to the destructured props, and replace the `{canReplace ? ( <Button … Replace …> ) : null}` block with:

```tsx
                    {canReplace ? (
                      <>
                        <Button
                          shape="icon"
                          size="sm"
                          variant="secondary"
                          aria-label={`Edit details of ${card.title}`}
                          onClick={() => onEdit(card.slug)}
                        >
                          <Icon name="pencil" size={14} />
                        </Button>
                        <Button
                          shape="icon"
                          size="sm"
                          variant="secondary"
                          aria-label={`Replace source of ${card.title}`}
                          onClick={() => onReplace(card.slug)}
                        >
                          <Icon name="refresh" size={14} />
                        </Button>
                      </>
                    ) : null}
```

`frontend/src/pages/territory-catalog/territory-catalog-page.fixture.tsx` — add `onEdit={noop}` next to each of the two `onReplace={noop}` lines (:84, :107).

`frontend/src/pages/territory-catalog/ui/territory-catalog-screen.tsx` — imports become:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { territoryPath, type TerritoryCardModel } from "@/entities/territory";
import { EditDetailsDialog } from "@/features/edit-entity";
```

add `const [editing, setEditing] = useState<TerritoryCardModel | null>(null);` right after `const navigate = useNavigate();`; pass

```tsx
        onEdit={(slug) => setEditing(filtered.find((c) => c.slug === slug) ?? null)}
```

to `<TerritoryCatalogPage … />`; and after the `{s.pending ? … : null}` block add:

```tsx
      {editing ? (
        <EditDetailsDialog
          kind="territory"
          slug={editing.slug}
          title={editing.title}
          description={editing.description}
          onClose={() => setEditing(null)}
        />
      ) : null}
```

- [ ] **Step 12: Run the page specs — green**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn test src/pages/model-detail src/pages/territory-viewer src/pages/territory-catalog src/features/edit-entity`
Expected: all files pass, 0 failed.

- [ ] **Step 13: Frontend gates**

Run, in `/Users/vbncursed/programming/rosneft/frontend`:
- `yarn lint` → exits 0 (tsc -b clean, oxlint 0 errors)
- `yarn test:coverage` → all tests pass and the 90/85/90/90 thresholds hold
- `VITE_API_URL= yarn build` → exits 0

- [ ] **Step 14: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/shared/api/dto.ts \
  frontend/src/features/edit-entity \
  frontend/src/pages/model-detail/model/detail.tsx \
  frontend/src/pages/model-detail/ui/model-aside.tsx \
  frontend/src/pages/model-detail/ui/model-detail-page.tsx \
  frontend/src/pages/model-detail/ui/model-detail-screen.tsx \
  frontend/src/pages/model-detail/ui/model-detail-screen.spec.tsx \
  frontend/src/pages/territory-viewer/model/viewer-props.ts \
  frontend/src/pages/territory-viewer/model/page-props.ts \
  frontend/src/pages/territory-viewer/model/page-props.spec.ts \
  frontend/src/pages/territory-viewer/model/use-territory-viewer.ts \
  frontend/src/pages/territory-viewer/ui/viewer-header.tsx \
  frontend/src/pages/territory-viewer/ui/viewer-header.spec.tsx \
  frontend/src/pages/territory-viewer/ui/territory-viewer-screen.tsx \
  frontend/src/pages/territory-viewer/ui/territory-viewer-screen.spec.tsx \
  frontend/src/pages/territory-catalog/territory-catalog-page.fixture.tsx \
  frontend/src/pages/territory-catalog/ui/territory-catalog-page.tsx \
  frontend/src/pages/territory-catalog/ui/territory-catalog-page.spec.tsx \
  frontend/src/pages/territory-catalog/ui/territory-catalog-screen.tsx \
  frontend/src/pages/territory-catalog/ui/territory-catalog-screen.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
feat(frontend): edit a model's or territory's title and description

One EditDetailsDialog, opened from the model page's About card, the viewer
header and the catalog card, each behind the entity's write grant. A save
writes the entity, its list row and the viewer's scene bundle into the query
cache, so nothing refetches.

--no-verify: frontend-only change; the hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
git show --stat HEAD | grep -c '^ backend/'
```

Expected: the cached list shows only `frontend/…` paths (the feature directory expands to its four files); the last command prints `0`.

---

### Task C1: Record the old bbox center with the rescale baseline

**Skills to load (Skill tool, before anything else):** `ponytail:ponytail`, `clean-code`,
`superpowers:test-driven-development`, `modern-go-guidelines:use-modern-go`,
`cc-skills-golang:golang-how-to` (then `cc-skills-golang:golang-testing`,
`cc-skills-golang:golang-database`, `cc-skills-golang:golang-grpc`, `cc-skills-golang:golang-error-handling`).

**Files:**
- Create: `backend/services/catalog-service/internal/migrate/migrations/00017_territory_rescale_baseline_center.sql`
- Create: `backend/services/audit-service/internal/migrate/migrations/00006_ignore_rescale_baseline_center.sql`
- Modify (test): `backend/services/audit-service/internal/migrate/schema_integration_test.go`, `…/rollback_integration_test.go:164-186`
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto:279-288`; regenerate `backend/proto/gen/go/rosneft/catalog/v1/catalog.pb.go`
- Modify: `backend/services/catalog-service/internal/storage/set_territory_rescale_baseline.go`
- Modify: `backend/services/catalog-service/internal/service/set_territory_rescale_baseline.go`, `…/service/catalog.go:37`; regenerate `…/service/mocks/repository_mock.go`
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/server.go:35`, `…/grpcapi/set_territory_rescale_baseline.go`; regenerate `…/grpcapi/mocks/service_mock.go`
- Modify (test): `backend/services/catalog-service/internal/service/rescale_test.go:39-55`, `…/storage/rescale_integration_test.go`
- Modify: `backend/services/gateway-service/internal/clients/catalog/territories.go:64-76`, `…/service/gateway.go:27`, `…/service/territories.go:82-112`; regenerate `…/service/mocks/catalog_mock.go`
- Modify (test): `backend/services/gateway-service/internal/service/replace_territory_source_test.go:46-62`
- Modify (docs): `backend/CLAUDE.md` (the `audit_capture()` ignore-list sentence)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (Task C2 relies on these):
  - Columns `territories.rescale_baseline_center_x/_y/_z DOUBLE PRECISION NULL`.
  - Proto `SetTerritoryRescaleBaselineRequest.source_center` (`Vec3`, field 3).
  - Catalog storage + service + grpc `Service`/`Repository`:
    `SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64, center domain.Vec3) error`
    — writes max **and** center only when no baseline is pending (first replace wins, for all four).
  - Gateway `service.Catalog`: `SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64, center domain.Vec3) error`;
    `captureRescaleBaseline` passes `artifactCenter(oldLOD0)`.
  - `audit_capture()` ignores an UPDATE that touches only `rescale_baseline_max` and the three center columns.

- [ ] **Step 1: Write the failing tests (all four layers)**

`backend/services/gateway-service/internal/service/replace_territory_source_test.go` — replace the body of `TestReplaceSourceSetsRescaleBaselineFromOldLOD0` with:

```go
func (s *TerritoriesSuite) TestReplaceSourceSetsRescaleBaselineFromOldLOD0() {
	current := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "old"}
	saved := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "new"}
	s.cat.GetTerritoryMock.Expect(s.ctx, "t1", "").Return(current, nil)
	s.cat.UpsertTerritoryMock.Expect(s.ctx, saved).Return(saved, nil)
	// Old LOD0 source bbox: longest axis 10 (the converter's pre-normalize max),
	// center (7, 1, 2) — the point the converter moved to the origin.
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).Return(domain.Artifact{
		Slug: "t1", LOD: 0,
		BBoxMin: domain.Vec3{X: 2, Y: -1, Z: 0},
		BBoxMax: domain.Vec3{X: 12, Y: 3, Z: 4},
	}, nil)
	s.cat.SetTerritoryRescaleBaselineMock.Expect(s.ctx, "t1", 10.0, domain.Vec3{X: 7, Y: 1, Z: 2}).Return(nil)
	s.cat.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	s.mesh.SubmitConversionMock.Return(domain.Job{ID: "job-1"}, nil)

	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new", rootScope)
	assert.NilError(s.T(), err)
}
```

`backend/services/catalog-service/internal/service/rescale_test.go` — replace the three `SetBaseline` tests with:

```go
func (s *RescaleSuite) TestSetBaselineRejectsEmptySlug() {
	err := s.svc.SetTerritoryRescaleBaseline(s.ctx, "", 4, domain.Vec3{})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestSetBaselineRejectsNonPositiveMax() {
	err := s.svc.SetTerritoryRescaleBaseline(s.ctx, "t1", 0, domain.Vec3{})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	err = s.svc.SetTerritoryRescaleBaseline(s.ctx, "t1", -2, domain.Vec3{})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestSetBaselineDelegatesWithCenter() {
	center := domain.Vec3{X: 1, Y: 2, Z: 3}
	s.repo.SetTerritoryRescaleBaselineMock.Expect(s.ctx, "t1", 10.0, center).Return(nil)
	err := s.svc.SetTerritoryRescaleBaseline(s.ctx, "t1", 10, center)
	assert.NilError(s.T(), err)
}
```

`backend/services/catalog-service/internal/storage/rescale_integration_test.go` — in `SetupTest` replace the reset statement and the baseline call:

```go
	_, err := s.pool.Exec(ctx, `DELETE FROM measurements; DELETE FROM placements;
		UPDATE territories SET rescale_baseline_max = NULL, rescale_baseline_center_x = NULL,
			rescale_baseline_center_y = NULL, rescale_baseline_center_z = NULL`)
```

```go
		assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, slug, 10, domain.Vec3{}))
```

and append:

```go
// baseline reads a pending baseline back; call it only while one is set.
func (s *RescaleSuite) baseline(slug string) (float64, domain.Vec3) {
	var m float64
	var c domain.Vec3
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT rescale_baseline_max, rescale_baseline_center_x,
		       rescale_baseline_center_y, rescale_baseline_center_z
		FROM territories WHERE slug = $1`, slug).Scan(&m, &c.X, &c.Y, &c.Z))
	return m, c
}

// A second replace before the first converted keeps the first's baseline, its
// center included: both describe the mesh the placements were positioned on.
func (s *RescaleSuite) TestTheFirstBaselineKeepsItsCenter() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `UPDATE territories SET rescale_baseline_max = NULL WHERE slug = 'a'`)
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, "a", 8, domain.Vec3{X: 1, Y: 2, Z: 3}))
	assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, "a", 4, domain.Vec3{X: 9, Y: 9, Z: 9}))

	m, c := s.baseline("a")
	assert.Equal(s.T(), m, 8.0)
	assert.Equal(s.T(), c, domain.Vec3{X: 1, Y: 2, Z: 3})
}
```

`backend/services/audit-service/internal/migrate/schema_integration_test.go` — in `SetupTest` add these columns to the `subjects` table (after `onboarding_tours_seen …,`):

```sql
			rescale_baseline_max      DOUBLE PRECISION,
			rescale_baseline_center_x DOUBLE PRECISION,
			rescale_baseline_center_y DOUBLE PRECISION,
			rescale_baseline_center_z DOUBLE PRECISION,
```

and add after `TestUpdateTouchingOnlyBookkeepingColumnsIsSkipped`:

```go
// A source replace records the old mesh's max axis and center; that is
// plumbing of the rescale, not an edit anyone made.
func (s *SchemaSuite) TestUpdateTouchingOnlyTheRescaleBaselineIsSkipped() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `INSERT INTO subjects (slug, title) VALUES ('alpha', 'Alpha')`)
	assert.NilError(s.T(), err)
	s.truncateLog()

	_, err = s.pool.Exec(ctx, `UPDATE subjects SET rescale_baseline_max = 8,
		rescale_baseline_center_x = 1, rescale_baseline_center_y = 2, rescale_baseline_center_z = 3
		WHERE slug = 'alpha'`)
	assert.NilError(s.T(), err)

	var n int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT count(*) FROM audit_log`).Scan(&n))
	assert.Equal(s.T(), n, 0)
}
```

`backend/services/audit-service/internal/migrate/rollback_integration_test.go` — `TestOneStepBackForgetsMeasurements` assumes 00005 is the newest migration; with 00006 added it must step back twice. Replace its comment, name and the single `migrate.Down` call:

```go
// Two steps back undo 00006 (it only widens audit_capture's ignore list) and
// then 00005: its trigger comes off measurements, and the previous
// ensure_audit_triggers() body no longer picks the table up on boot.
func (s *RollbackSuite) TestBackingOut00005ForgetsMeasurements() {
```

```go
	assert.NilError(s.T(), migrate.Down(ctx, s.dsn)) // 00006
	assert.NilError(s.T(), migrate.Down(ctx, s.dsn)) // 00005
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race ./internal/service/ -run TestTerritoriesSuite`
Expected: build failure — `too many arguments in call to s.cat.SetTerritoryRescaleBaselineMock.Expect`.

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/catalog-service && go test -race ./internal/service/ -run TestRescaleSuite`
Expected: build failure — `too many arguments in call to s.svc.SetTerritoryRescaleBaseline`.

Run (Docker): `cd /Users/vbncursed/programming/rosneft/backend/services/audit-service && GOWORK=off go test -race -tags=integration ./internal/migrate/ -run 'TestSchemaSuite/TestUpdateTouchingOnlyTheRescaleBaselineIsSkipped'`
Expected: FAIL — `assertion failed: 1 (n int) != 0 (int)`: the center columns are not on the ignore list yet.

- [ ] **Step 3: Catalog migration**

Create `backend/services/catalog-service/internal/migrate/migrations/00017_territory_rescale_baseline_center.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
-- The old source mesh's bbox center, recorded beside rescale_baseline_max when
-- a source is replaced. Normalization is s = (p - c)·2/M, so a replacement
-- whose bbox center moved shifts every scene-space coordinate by (c - c')·2/M'
-- on top of the M/M' scale; with M alone the rescale kept sizes but let
-- positions drift. NULL (a baseline captured before this column existed)
-- reads as "no shift", which completes such a replace scale-only, as before.
ALTER TABLE territories
    ADD COLUMN rescale_baseline_center_x DOUBLE PRECISION,
    ADD COLUMN rescale_baseline_center_y DOUBLE PRECISION,
    ADD COLUMN rescale_baseline_center_z DOUBLE PRECISION;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE territories
    DROP COLUMN rescale_baseline_center_x,
    DROP COLUMN rescale_baseline_center_y,
    DROP COLUMN rescale_baseline_center_z;
-- +goose StatementEnd
```

- [ ] **Step 4: Audit migration — the center is bookkeeping too**

Create `backend/services/audit-service/internal/migrate/migrations/00006_ignore_rescale_baseline_center.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
-- Catalog's 00017 adds rescale_baseline_center_{x,y,z} beside
-- rescale_baseline_max. They are the same plumbing — written on a source
-- replace, cleared by the post-conversion rescale — so they join the list of
-- columns whose change alone files no journal entry. Body otherwise identical
-- to 00003.
CREATE OR REPLACE FUNCTION audit_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_entity  TEXT   := TG_ARGV[0];
    v_pk_col  TEXT   := TG_ARGV[1];
    v_lbl_col TEXT   := TG_ARGV[2];
    v_redact  TEXT[] := ARRAY['password_hash', 'totp_secret', 'code_hash'];
    v_ignore  TEXT[] := ARRAY['updated_at', 'onboarding_tours_seen', 'rescale_baseline_max',
                              'rescale_baseline_center_x', 'rescale_baseline_center_y',
                              'rescale_baseline_center_z'];
    v_old     JSONB;
    v_new     JSONB;
    v_row     JSONB;
    v_id      TEXT;
    v_label   TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - v_redact; END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - v_redact; END IF;

    IF TG_OP = 'UPDATE' AND (v_old - v_ignore) = (v_new - v_ignore) THEN
        RETURN NULL;
    END IF;

    v_row := COALESCE(v_new, v_old);
    IF v_pk_col  <> '' THEN v_id    := v_row ->> v_pk_col;  END IF;
    IF v_lbl_col <> '' THEN v_label := v_row ->> v_lbl_col; END IF;

    INSERT INTO audit_log (actor_id, company_id, action, entity, entity_id,
                           entity_label, old_row, new_row, request_id)
    VALUES (
        NULLIF(current_setting('app.actor_id',   true), '')::UUID,
        NULLIF(current_setting('app.company_id', true), '')::UUID,
        v_entity || '.' || lower(TG_OP),
        v_entity, v_id, v_label, v_old, v_new,
        NULLIF(current_setting('app.request_id', true), '')
    );
    RETURN NULL; -- AFTER trigger: the return value is ignored
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Restore 00003's list.
CREATE OR REPLACE FUNCTION audit_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_entity  TEXT   := TG_ARGV[0];
    v_pk_col  TEXT   := TG_ARGV[1];
    v_lbl_col TEXT   := TG_ARGV[2];
    v_redact  TEXT[] := ARRAY['password_hash', 'totp_secret', 'code_hash'];
    v_ignore  TEXT[] := ARRAY['updated_at', 'onboarding_tours_seen', 'rescale_baseline_max'];
    v_old     JSONB;
    v_new     JSONB;
    v_row     JSONB;
    v_id      TEXT;
    v_label   TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - v_redact; END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - v_redact; END IF;

    IF TG_OP = 'UPDATE' AND (v_old - v_ignore) = (v_new - v_ignore) THEN
        RETURN NULL;
    END IF;

    v_row := COALESCE(v_new, v_old);
    IF v_pk_col  <> '' THEN v_id    := v_row ->> v_pk_col;  END IF;
    IF v_lbl_col <> '' THEN v_label := v_row ->> v_lbl_col; END IF;

    INSERT INTO audit_log (actor_id, company_id, action, entity, entity_id,
                           entity_label, old_row, new_row, request_id)
    VALUES (
        NULLIF(current_setting('app.actor_id',   true), '')::UUID,
        NULLIF(current_setting('app.company_id', true), '')::UUID,
        v_entity || '.' || lower(TG_OP),
        v_entity, v_id, v_label, v_old, v_new,
        NULLIF(current_setting('app.request_id', true), '')
    );
    RETURN NULL;
END $$;
-- +goose StatementEnd
```

In `backend/CLAUDE.md`, change "drops any UPDATE that touched nothing but `updated_at`,
`onboarding_tours_seen` or `rescale_baseline_max`" to "… `onboarding_tours_seen` or the
rescale baseline (`rescale_baseline_max`, `rescale_baseline_center_{x,y,z}`)".

- [ ] **Step 5: Proto field and regeneration**

In `backend/proto/rosneft/catalog/v1/catalog.proto` replace the baseline request:

```proto
// SetTerritoryRescaleBaseline records the territory's current source-mesh
// max-dimension and bbox center before a source replacement clears its
// artifacts. The post-conversion RescaleTerritoryPlacements reads both to keep
// placements 1:1 across the new normalization. Writes only when no baseline is
// already pending, preserving the earliest values across chained replaces.
message SetTerritoryRescaleBaselineRequest {
  string territory_slug = 1;
  double source_max = 2;
  // Center of the same source bbox. Unset reads as the origin.
  Vec3 source_center = 3;
}
```

Run: `cd /Users/vbncursed/programming/rosneft/backend/proto && buf generate --path rosneft/catalog/v1/catalog.proto`
Expected: exits 0 (needs network to buf.build — retry on `EHOSTUNREACH`);
`git -C /Users/vbncursed/programming/rosneft status --short backend/proto/gen` lists `catalog.pb.go` (and at most `catalog_grpc.pb.go` if only its header changed) and nothing from other services;
`grep -n 'SourceCenter' backend/proto/gen/go/rosneft/catalog/v1/catalog.pb.go` finds `GetSourceCenter`.

- [ ] **Step 6: Catalog storage, service, transport**

`backend/services/catalog-service/internal/storage/set_territory_rescale_baseline.go` — add the domain import and change the method:

```go
import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetTerritoryRescaleBaseline records the territory's current source-mesh
// max-dimension and bbox center so a post-replacement re-conversion can map
// placements onto the new normalization. It writes only when no baseline is
// already pending, so a chain of replaces (each clearing artifacts before the
// next lands) preserves the earliest pre-replacement mesh — all four values
// together. An unknown slug matches no rows and is a no-op.
//
// Wrapped in audittx.Run because it writes to territories, an audited table;
// audit_capture() ignores these columns, so it files no entry of its own.
func (r *PG) SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64, center domain.Vec3) error {
	const q = `
		UPDATE territories
		SET rescale_baseline_max      = $2,
		    rescale_baseline_center_x = $3,
		    rescale_baseline_center_y = $4,
		    rescale_baseline_center_z = $5
		WHERE slug = $1 AND rescale_baseline_max IS NULL`

	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		_, execErr := tx.Exec(ctx, q, slug, sourceMax, center.X, center.Y, center.Z)
		return execErr
	})
	if err != nil {
		return fmt.Errorf("storage.SetTerritoryRescaleBaseline: %w", err)
	}
	return nil
}
```

`backend/services/catalog-service/internal/service/set_territory_rescale_baseline.go`:

```go
// SetTerritoryRescaleBaseline records the territory's pre-replacement source
// max-dimension and bbox center so the next conversion can map placements to
// the new normalization. sourceMax must be positive — a non-positive baseline
// would yield a meaningless rescale factor.
func (c *Catalog) SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64, center domain.Vec3) error {
	if slug == "" {
		return fmt.Errorf("service.SetTerritoryRescaleBaseline: %w: empty slug", domain.ErrInvalidInput)
	}
	if sourceMax <= 0 {
		return fmt.Errorf("service.SetTerritoryRescaleBaseline: %w: source_max must be positive", domain.ErrInvalidInput)
	}
	return c.repo.SetTerritoryRescaleBaseline(ctx, slug, sourceMax, center)
}
```

In **both** `backend/services/catalog-service/internal/service/catalog.go` (`Repository`) and `backend/services/catalog-service/internal/transport/grpcapi/server.go` (`Service`) change the line to:

```go
	SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64, center domain.Vec3) error
```

`backend/services/catalog-service/internal/transport/grpcapi/set_territory_rescale_baseline.go`:

```go
func (s *Server) SetTerritoryRescaleBaseline(ctx context.Context, req *catalogv1.SetTerritoryRescaleBaselineRequest) (*catalogv1.SetTerritoryRescaleBaselineResponse, error) {
	// A message field has presence: a gateway built before the centre existed
	// sends none, and reading that as the origin would shift every binding.
	if req.GetSourceCenter() == nil {
		return nil, status.Error(codes.InvalidArgument, "source_center is required")
	}
	err := s.svc.SetTerritoryRescaleBaseline(ctx, req.GetTerritorySlug(), req.GetSourceMax(), vec3FromProto(req.GetSourceCenter()))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetTerritoryRescaleBaselineResponse{}, nil
}
```

Regenerate the mocks: `cd /Users/vbncursed/programming/rosneft/backend/services/catalog-service && go generate ./internal/service/ ./internal/transport/grpcapi/`
Expected: exits 0; `repository_mock.go` and `service_mock.go` change.

- [ ] **Step 7: Gateway client, interface, capture**

`backend/services/gateway-service/internal/clients/catalog/territories.go`:

```go
// SetTerritoryRescaleBaseline records the territory's current source-mesh
// max-dimension and bbox center before a source replacement clears its
// artifacts, so the post-conversion rescale keeps placements 1:1 against the
// new normalization.
func (c *Client) SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64, center domain.Vec3) error {
	_, err := c.cc.SetTerritoryRescaleBaseline(ctx, &catalogv1.SetTerritoryRescaleBaselineRequest{
		TerritorySlug: slug,
		SourceMax:     sourceMax,
		SourceCenter:  vec3ToProto(center),
	})
	if err != nil {
		return fmt.Errorf("catalog.SetTerritoryRescaleBaseline: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return nil
}
```

`backend/services/gateway-service/internal/service/gateway.go:27`:

```go
	SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64, center domain.Vec3) error
```

`backend/services/gateway-service/internal/service/territories.go` — replace `captureRescaleBaseline`'s doc and the call, and add `artifactCenter` under `artifactMaxAxis`:

```go
// captureRescaleBaseline records the territory's current source-mesh
// max-dimension and bbox center so the post-conversion worker can map
// placements, measurements and panoramas 1:1 onto the replacement mesh's
// normalization. It must run before the old artifacts are cleared. A territory
// with no LOD0 yet (still pending) has nothing to anchor to and is skipped,
// preserving any baseline a prior in-flight replace already set (the catalog
// writes it only once).
//
// Assumes the old and new sources share one coordinate frame (a re-scan of the
// same site in the same georeference). A source in another frame cannot be
// aligned automatically; manual calibration is out of scope.
func (g *Gateway) captureRescaleBaseline(ctx context.Context, slug string) error {
	old, err := g.catalog.GetTerritoryArtifact(ctx, slug, 0)
	switch {
	case err == nil:
		if m := artifactMaxAxis(old); m > 0 {
			if err := g.catalog.SetTerritoryRescaleBaseline(ctx, slug, m, artifactCenter(old)); err != nil {
				return fmt.Errorf("set rescale baseline: %w", err)
			}
		}
		return nil
	case errors.Is(err, domain.ErrArtifactNotFound):
		return nil
	default:
		return fmt.Errorf("read current artifact: %w", err)
	}
}
```

```go
// artifactCenter returns the center of an artifact's source-mesh bbox — the
// point the converter moves to the origin before scaling.
func artifactCenter(a domain.Artifact) domain.Vec3 {
	return domain.Vec3{
		X: (a.BBoxMin.X + a.BBoxMax.X) / 2,
		Y: (a.BBoxMin.Y + a.BBoxMax.Y) / 2,
		Z: (a.BBoxMin.Z + a.BBoxMax.Z) / 2,
	}
}
```

Regenerate: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go generate ./internal/service/`
Expected: exits 0; `internal/service/mocks/catalog_mock.go` changes.

Check `wc -l backend/services/gateway-service/internal/service/territories.go` ≤ 200 (≈197 after B1+C1). If it is over, move `artifactMaxAxis` and `artifactCenter` into a new `backend/services/gateway-service/internal/service/artifact_bbox.go` (package `service`, same code) and stage it too.

- [ ] **Step 8: Run everything — green**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go test -race ./...` → all `ok`.
Run: `cd /Users/vbncursed/programming/rosneft/backend/services/catalog-service && go test -race ./...` → all `ok`.
Run (Docker): `cd /Users/vbncursed/programming/rosneft/backend/services/catalog-service && GOWORK=off go test -race -tags=integration ./internal/storage/ ./internal/migrate/` → `ok` for both (migrations up to 00017 apply; `TestTheFirstBaselineKeepsItsCenter` passes).
Run (Docker): `cd /Users/vbncursed/programming/rosneft/backend/services/audit-service && GOWORK=off go test -race -tags=integration ./internal/migrate/` → `ok` (the new skip test passes; `TestRollbackSuite` passes, including `TestBackingOut00005ForgetsMeasurements` and the `downAll` walk that now counts six files).

- [ ] **Step 9: Commit gate**

Run: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C /Users/vbncursed/programming/rosneft/backend check`
Expected: ends without error.

- [ ] **Step 10: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add backend/services/catalog-service/internal/migrate/migrations/00017_territory_rescale_baseline_center.sql \
  backend/services/audit-service/internal/migrate/migrations/00006_ignore_rescale_baseline_center.sql \
  backend/services/audit-service/internal/migrate/schema_integration_test.go \
  backend/services/audit-service/internal/migrate/rollback_integration_test.go \
  backend/proto/rosneft/catalog/v1/catalog.proto \
  backend/proto/gen/go/rosneft/catalog/v1 \
  backend/services/catalog-service/internal/storage/set_territory_rescale_baseline.go \
  backend/services/catalog-service/internal/storage/rescale_integration_test.go \
  backend/services/catalog-service/internal/service/set_territory_rescale_baseline.go \
  backend/services/catalog-service/internal/service/catalog.go \
  backend/services/catalog-service/internal/service/rescale_test.go \
  backend/services/catalog-service/internal/service/mocks/repository_mock.go \
  backend/services/catalog-service/internal/transport/grpcapi/server.go \
  backend/services/catalog-service/internal/transport/grpcapi/set_territory_rescale_baseline.go \
  backend/services/catalog-service/internal/transport/grpcapi/mocks/service_mock.go \
  backend/services/gateway-service/internal/clients/catalog/territories.go \
  backend/services/gateway-service/internal/service/gateway.go \
  backend/services/gateway-service/internal/service/territories.go \
  backend/services/gateway-service/internal/service/mocks/catalog_mock.go \
  backend/services/gateway-service/internal/service/replace_territory_source_test.go \
  backend/CLAUDE.md
git diff --cached --name-only
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) git commit -m "$(cat <<'EOF'
feat(catalog): a source replace records the old mesh's bbox center too

The rescale baseline held only the old max axis, so the post-conversion
rescale could keep sizes but not positions when the replacement's bbox
center moved. The gateway now passes the old LOD0 center, the catalog stores
it beside the max (first replace still wins, for all four columns), and
audit_capture() treats the new columns as bookkeeping like the max.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

Expected: the cached list shows only the paths above (plus `artifact_bbox.go` if Step 7 needed it).

---

### Task C2: The rescale shifts by the center delta and moves panoramas

**Skills to load (Skill tool, before anything else):** `ponytail:ponytail`, `clean-code`,
`superpowers:test-driven-development`, `modern-go-guidelines:use-modern-go`,
`cc-skills-golang:golang-how-to` (then `cc-skills-golang:golang-testing`,
`cc-skills-golang:golang-database`, `cc-skills-golang:golang-grpc`).

**Files:**
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto:290-301`; regenerate `backend/proto/gen/go/rosneft/catalog/v1/catalog.pb.go`
- Modify: `backend/services/catalog-service/internal/storage/rescale_territory_placements.go`
- Modify: `backend/services/catalog-service/internal/service/rescale_territory_placements.go`, `…/service/catalog.go:38`; regenerate `…/service/mocks/repository_mock.go`
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/server.go:36`, `…/grpcapi/rescale_territory_placements.go`; regenerate `…/grpcapi/mocks/service_mock.go`
- Modify (test): `backend/services/catalog-service/internal/service/rescale_test.go:57-72`, `…/storage/rescale_integration_test.go`
- Modify: `backend/services/mesh-service/internal/catalog/rescale_placements.go`, `…/service/mesh.go:55`, `…/service/rescale_placements.go`; regenerate `…/service/mocks/catalog_mock.go`
- Modify (test): `backend/services/mesh-service/internal/service/rescale_placements_internal_test.go`
- Modify (docs): `backend/CLAUDE.md` ("the rescale CTE over placements and measurements")

**Interfaces:**
- Consumes (Task C1): columns `rescale_baseline_center_{x,y,z}`; `SetTerritoryRescaleBaseline(ctx, slug, sourceMax float64, center domain.Vec3) error` (catalog storage), used by the integration test.
- Produces:
  - Proto `RescaleTerritoryPlacementsRequest.new_source_center` (`Vec3`, field 3).
  - Catalog storage / service / grpc `Service` / `Repository`:
    `RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) (int, error)`.
  - mesh `service.Catalog`: `RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) error`.
  - Math, in one statement: `k = M/M'`, `o = (c − c')·2/M'` (per axis; a NULL `c` gives `o = 0`).
    Placement position `s·k + o`, scale `·k`; measurement point components `v·k + o[(i−1) % 3]`;
    panorama position `s·k + o`; rotations, `yaw_offset`, `default_yaw` untouched; all four baseline
    columns cleared. The no-op guard skips the writes only when `k ≈ 1` **and** `o ≈ 0`.

- [ ] **Step 1: Write the failing tests**

`backend/services/mesh-service/internal/service/rescale_placements_internal_test.go` — replace `lod0Result` and the first test:

```go
// lod0Result is a LOD0 result whose source bbox has longest axis 10 and
// center (3, 1, 3).
func lod0Result() []domain.ConversionResult {
	return []domain.ConversionResult{{
		BBoxMin: domain.Vec3{X: -2, Y: 0, Z: 1},
		BBoxMax: domain.Vec3{X: 8, Y: 2, Z: 5},
	}}
}

func (s *RescaleAfterConvertSuite) TestTerritoryRescalesWithLOD0MaxAxisAndCenter() {
	s.cat.RescaleTerritoryPlacementsMock.Expect(s.ctx, "t1", 10.0, domain.Vec3{X: 3, Y: 1, Z: 3}).Return(nil)
	err := s.m.rescaleAfterConvert(s.ctx, domain.KindTerritory, "t1", lod0Result())
	assert.NilError(s.T(), err)
}
```

`backend/services/catalog-service/internal/service/rescale_test.go` — replace the three `Rescale…` tests:

```go
func (s *RescaleSuite) TestRescaleRejectsEmptySlug() {
	_, err := s.svc.RescaleTerritoryPlacements(s.ctx, "", 4, domain.Vec3{})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestRescaleRejectsNonPositiveMax() {
	_, err := s.svc.RescaleTerritoryPlacements(s.ctx, "t1", 0, domain.Vec3{})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestRescaleDelegatesWithCenterAndReturnsCount() {
	center := domain.Vec3{X: 4, Y: 5, Z: 6}
	s.repo.RescaleTerritoryPlacementsMock.Expect(s.ctx, "t1", 5.0, center).Return(3, nil)
	n, err := s.svc.RescaleTerritoryPlacements(s.ctx, "t1", 5, center)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 3)
}
```

`backend/services/catalog-service/internal/storage/rescale_integration_test.go`:

1. Add `"math"` to the imports.
2. Update the doc comment of `RescaleSuite` to: "RescaleSuite covers the RescaleTerritoryPlacements CTE: scale by old_max/newMax and shift by (old_center − new_center)·2/newMax, applied to the territory's placements, measurements and panoramas in one statement, and to nothing on any other territory."
3. In `SetupTest`, make the reset `DELETE FROM measurements; DELETE FROM placements; DELETE FROM panoramas;` (keep the baseline-reset `UPDATE` from C1), and inside the `for _, slug := range …` loop add after the `CreateMeasurement` block:

```go
		_, err = s.pool.Exec(ctx, `
			INSERT INTO panoramas (territory_id, slug, title, source_blob_hash, position_x, position_y, position_z)
			SELECT id, 'pano', 'pano', 'pano', $2, $3, $4 FROM territories WHERE slug = $1`,
			slug, panoramaAt.X, panoramaAt.Y, panoramaAt.Z)
		assert.NilError(s.T(), err)
```

4. Pass `domain.Vec3{}` as the new last argument in the three existing calls
   (`RescaleTerritoryPlacements(s.T().Context(), "a", 5, domain.Vec3{})` twice and `(…, "a", 10, domain.Vec3{})` once).
5. Append:

```go
// The old source's bbox (center c, max axis M) and the replacement's (c', M').
// A scene-space point s stands for the world point s·M/2 + c; after the rescale
// it must stand for the same world point under the new normalization.
var (
	oldCenter  = domain.Vec3{X: 10, Y: 20, Z: 30}
	newCenter  = domain.Vec3{X: 12, Y: 18, Z: 30.5}
	panoramaAt = domain.Vec3{X: 0.5, Y: -0.25, Z: 0.75}
)

const oldMax, newMax = 8.0, 10.0

func worldOf(s domain.Vec3, m float64, c domain.Vec3) domain.Vec3 {
	return domain.Vec3{X: s.X*m/2 + c.X, Y: s.Y*m/2 + c.Y, Z: s.Z*m/2 + c.Z}
}

func (s *RescaleSuite) assertSameWorldPoint(before, after domain.Vec3) {
	s.T().Helper()
	want, got := worldOf(before, oldMax, oldCenter), worldOf(after, newMax, newCenter)
	for _, d := range []float64{want.X - got.X, want.Y - got.Y, want.Z - got.Z} {
		assert.Assert(s.T(), math.Abs(d) < 1e-9, "world point moved: want %+v, got %+v", want, got)
	}
}

func (s *RescaleSuite) placement(slug string) (pos, scale domain.Vec3) {
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT p.position_x, p.position_y, p.position_z, p.scale_x, p.scale_y, p.scale_z
		FROM placements p JOIN territories t ON t.id = p.territory_id
		WHERE t.slug = $1`, slug).Scan(&pos.X, &pos.Y, &pos.Z, &scale.X, &scale.Y, &scale.Z))
	return pos, scale
}

func (s *RescaleSuite) panorama(slug string) (pos domain.Vec3) {
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		SELECT pn.position_x, pn.position_y, pn.position_z
		FROM panoramas pn JOIN territories t ON t.id = pn.territory_id
		WHERE t.slug = $1`, slug).Scan(&pos.X, &pos.Y, &pos.Z))
	return pos
}

func (s *RescaleSuite) TestKeepsEveryBindingOnItsWorldPointWhenTheCenterMoves() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `UPDATE territories SET rescale_baseline_max = NULL WHERE slug = 'a'`)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pg.SetTerritoryRescaleBaseline(ctx, "a", oldMax, oldCenter))

	_, err = s.pg.RescaleTerritoryPlacements(ctx, "a", newMax, newCenter)
	assert.NilError(s.T(), err)

	pos, scale := s.placement("a")
	s.assertSameWorldPoint(domain.Vec3{X: 1, Y: 2, Z: 3}, pos)
	for _, v := range []float64{scale.X, scale.Y, scale.Z} {
		assert.Assert(s.T(), math.Abs(v-oldMax/newMax) < 1e-9, "scale %v, want %v", v, oldMax/newMax)
	}
	points, err := domain.PointsFromFlat(s.points("a"))
	assert.NilError(s.T(), err)
	s.assertSameWorldPoint(domain.Vec3{X: 1, Y: 2, Z: 3}, points[0])
	s.assertSameWorldPoint(domain.Vec3{X: -4, Y: 5, Z: -6}, points[1])
	s.assertSameWorldPoint(panoramaAt, s.panorama("a"))

	var cleared int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `
		SELECT num_nulls(rescale_baseline_max, rescale_baseline_center_x,
		                 rescale_baseline_center_y, rescale_baseline_center_z)
		FROM territories WHERE slug = 'a'`).Scan(&cleared))
	assert.Equal(s.T(), cleared, 4)
}

// A baseline captured before the center columns existed carries a max alone;
// it completes with the scale-only rescale it was captured for.
func (s *RescaleSuite) TestANullBaselineCenterOnlyScales() {
	_, err := s.pool.Exec(s.T().Context(), `UPDATE territories SET rescale_baseline_center_x = NULL,
		rescale_baseline_center_y = NULL, rescale_baseline_center_z = NULL WHERE slug = 'a'`)
	assert.NilError(s.T(), err)

	_, err = s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 5, newCenter)
	assert.NilError(s.T(), err)

	assert.DeepEqual(s.T(), s.points("a"), []float64{2, 4, 6, -8, 10, -12})
	assert.Equal(s.T(), s.positionX("a"), 2.0)
	assert.Equal(s.T(), s.panorama("a"), domain.Vec3{X: 1, Y: -0.5, Z: 1.5})
}

// Same size, shifted bbox: the factor is 1 but every point still moves, so the
// no-op guard has to look at the offset too.
func (s *RescaleSuite) TestAMovedCenterAloneStillShifts() {
	_, err := s.pg.RescaleTerritoryPlacements(s.T().Context(), "a", 10, domain.Vec3{X: -5})
	assert.NilError(s.T(), err)

	assert.Equal(s.T(), s.positionX("a"), 2.0) // 1·1 + (0 − −5)·2/10
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/mesh-service && go test -race ./internal/service/ -run TestRescaleAfterConvertSuite`
Expected: build failure — `too many arguments in call to s.cat.RescaleTerritoryPlacementsMock.Expect`.

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/catalog-service && go test -race ./internal/service/ -run TestRescaleSuite`
Expected: build failure — `too many arguments in call to s.svc.RescaleTerritoryPlacements`.

- [ ] **Step 3: Proto field and regeneration**

In `backend/proto/rosneft/catalog/v1/catalog.proto` replace the rescale request's comment and message:

```proto
// RescaleTerritoryPlacements applies a pending rescale baseline: every
// placement position, measurement point and panorama anchor becomes
// s·(old_max/new_source_max) + (old_center − new_source_center)·2/new_source_max,
// placement scale is multiplied by old_max/new_source_max, and the baseline
// is cleared — atomically. A baseline with no center shifts nothing. A no-op
// when no baseline is set. The response reports how many placements were
// changed (measurements and panoramas are not counted).
message RescaleTerritoryPlacementsRequest {
  string territory_slug = 1;
  double new_source_max = 2;
  // Center of the new LOD0 source bbox. Unset reads as the origin.
  Vec3 new_source_center = 3;
}
```

Run: `cd /Users/vbncursed/programming/rosneft/backend/proto && buf generate --path rosneft/catalog/v1/catalog.proto`
Expected: exits 0; only `backend/proto/gen/go/rosneft/catalog/v1/` changes; `grep -n 'GetNewSourceCenter' backend/proto/gen/go/rosneft/catalog/v1/catalog.pb.go` finds it.

- [ ] **Step 4: The statement**

Replace `backend/services/catalog-service/internal/storage/rescale_territory_placements.go` with:

```go
package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RescaleTerritoryPlacements applies a pending rescale baseline in one atomic
// statement. The converter normalizes s = (p − c)·2/M (c = bbox center, M =
// max axis), so old scene space maps to the new one by
// s' = s·(M/M') + (c − c')·2/M'. That is applied to every placement position,
// measurement point (flat x,y,z triples) and panorama anchor; placement scale
// takes the factor alone; rotations and yaw do not change (normalization does
// not rotate). The baseline is cleared in the same statement, so a retried
// call finds nothing pending and cannot apply twice. The name predates
// measurements and panoramas; mesh-worker calls it, so it stays.
//
// Assumes the old and new sources share one coordinate frame (a re-scan of
// the same site in the same georeference). A NULL baseline center — captured
// before the center columns existed — shifts nothing, which completes that
// replace scale-only, as it was captured to be.
//
// When no baseline is pending it matches no rows and returns 0. The epsilon
// guard skips the writes when the factor is indistinguishable from 1 and the
// shift from 0 (an identical re-scan) while still clearing the baseline via
// the always-executed `cleared` CTE. A non-positive newMax is a defensive
// no-op that leaves the baseline intact for a later valid conversion. Returns
// the number of placements changed.
//
// Wrapped in audittx.Run because it writes placements, measurements,
// panoramas and territories, all audited. mesh-worker calls it with no actor
// on ctx, so the entries are attributed to the system — correct, since no
// human moved anything. panoramas is content-service's to write, but its DDL
// is catalog's and the database is shared; doing it here keeps the whole
// mapping in one transaction.
func (r *PG) RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) (int, error) {
	if newMax <= 0 {
		return 0, nil
	}
	const q = `
		WITH base AS (
			SELECT id,
			       rescale_baseline_max / $2 AS k,
			       (COALESCE(rescale_baseline_center_x, $3) - $3) * 2 / $2 AS ox,
			       (COALESCE(rescale_baseline_center_y, $4) - $4) * 2 / $2 AS oy,
			       (COALESCE(rescale_baseline_center_z, $5) - $5) * 2 / $2 AS oz
			FROM territories
			WHERE slug = $1 AND rescale_baseline_max IS NOT NULL
			FOR UPDATE
		),
		moved AS (
			SELECT * FROM base
			WHERE abs(k - 1) >= 1e-9 OR abs(ox) >= 1e-9 OR abs(oy) >= 1e-9 OR abs(oz) >= 1e-9
		),
		upd AS (
			UPDATE placements p SET
				position_x = p.position_x * b.k + b.ox,
				position_y = p.position_y * b.k + b.oy,
				position_z = p.position_z * b.k + b.oz,
				scale_x    = p.scale_x * b.k,
				scale_y    = p.scale_y * b.k,
				scale_z    = p.scale_z * b.k,
				updated_at = NOW()
			FROM moved b
			WHERE p.territory_id = b.id
			RETURNING p.id
		),
		measured AS (
			UPDATE measurements m SET
				points = ARRAY(
					SELECT v * b.k + CASE (i - 1) % 3 WHEN 0 THEN b.ox WHEN 1 THEN b.oy ELSE b.oz END
					FROM unnest(m.points) WITH ORDINALITY AS u(v, i)
					ORDER BY i
				),
				updated_at = NOW()
			FROM moved b
			WHERE m.territory_id = b.id
		),
		panned AS (
			UPDATE panoramas pn SET
				position_x = pn.position_x * b.k + b.ox,
				position_y = pn.position_y * b.k + b.oy,
				position_z = pn.position_z * b.k + b.oz,
				updated_at = NOW()
			FROM moved b
			WHERE pn.territory_id = b.id
		),
		cleared AS (
			UPDATE territories t SET
				rescale_baseline_max      = NULL,
				rescale_baseline_center_x = NULL,
				rescale_baseline_center_y = NULL,
				rescale_baseline_center_z = NULL
			FROM base b
			WHERE t.id = b.id
		)
		SELECT count(*) FROM upd`

	var updated int
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, q, slug, newMax, newCenter.X, newCenter.Y, newCenter.Z).Scan(&updated)
	})
	if err != nil {
		return 0, fmt.Errorf("storage.RescaleTerritoryPlacements: %w", err)
	}
	return updated, nil
}
```

- [ ] **Step 5: Catalog service and transport**

`backend/services/catalog-service/internal/service/rescale_territory_placements.go`:

```go
// RescaleTerritoryPlacements applies any pending rescale baseline for the
// territory, mapping existing placements, measurements and panoramas onto
// the freshly converted mesh's normalization (newMax and newCenter describe
// its LOD0 source bbox) and clearing the baseline. It is a no-op (0
// placements) when none is pending. Returns the number of placements changed.
func (c *Catalog) RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) (int, error) {
	if slug == "" {
		return 0, fmt.Errorf("service.RescaleTerritoryPlacements: %w: empty slug", domain.ErrInvalidInput)
	}
	if newMax <= 0 {
		return 0, fmt.Errorf("service.RescaleTerritoryPlacements: %w: new_source_max must be positive", domain.ErrInvalidInput)
	}
	return c.repo.RescaleTerritoryPlacements(ctx, slug, newMax, newCenter)
}
```

In **both** `backend/services/catalog-service/internal/service/catalog.go` (`Repository`) and `backend/services/catalog-service/internal/transport/grpcapi/server.go` (`Service`):

```go
	RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) (int, error)
```

`backend/services/catalog-service/internal/transport/grpcapi/rescale_territory_placements.go`:

```go
func (s *Server) RescaleTerritoryPlacements(ctx context.Context, req *catalogv1.RescaleTerritoryPlacementsRequest) (*catalogv1.RescaleTerritoryPlacementsResponse, error) {
	// Refused, not defaulted to the origin: a stale mesh-worker then fails the
	// job before LOD0 is published, the reconciler retries it, and the retry
	// succeeds once the worker is current — nothing is moved by a wrong offset.
	if req.GetNewSourceCenter() == nil {
		return nil, status.Error(codes.InvalidArgument, "new_source_center is required")
	}
	updated, err := s.svc.RescaleTerritoryPlacements(ctx, req.GetTerritorySlug(), req.GetNewSourceMax(), vec3FromProto(req.GetNewSourceCenter()))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.RescaleTerritoryPlacementsResponse{Updated: uint32(updated)}, nil
}
```

Regenerate: `cd /Users/vbncursed/programming/rosneft/backend/services/catalog-service && go generate ./internal/service/ ./internal/transport/grpcapi/` → exits 0.

- [ ] **Step 6: mesh-worker passes LOD0's center**

`backend/services/mesh-service/internal/catalog/rescale_placements.go`:

```go
// RescaleTerritoryPlacements asks the catalog to apply any pending rescale
// baseline for the territory now that the replacement mesh has converted —
// keeping existing placements, measurements and panoramas 1:1 against the new
// normalization. The catalog no-ops when no baseline is pending.
func (c *Client) RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) error {
	_, err := c.cc.RescaleTerritoryPlacements(ctx, &catalogv1.RescaleTerritoryPlacementsRequest{
		TerritorySlug:   slug,
		NewSourceMax:    newMax,
		NewSourceCenter: &catalogv1.Vec3{X: newCenter.X, Y: newCenter.Y, Z: newCenter.Z},
	})
	if err != nil {
		return fmt.Errorf("catalog.RescaleTerritoryPlacements: %w", mapStatusErr(err, domain.ErrTargetNotFound))
	}
	return nil
}
```

`backend/services/mesh-service/internal/service/mesh.go:55`:

```go
	RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) error
```

`backend/services/mesh-service/internal/service/rescale_placements.go` — change the call and add the helper after `bboxMaxAxis`:

```go
	if err := m.catalog.RescaleTerritoryPlacements(ctx, slug, newMax, bboxCenter(results[0])); err != nil {
		return fmt.Errorf("rescale placements: %w", err)
	}
```

```go
// bboxCenter returns the center of a conversion result's source-mesh bbox —
// the point the converter moves to the origin before scaling.
func bboxCenter(r domain.ConversionResult) domain.Vec3 {
	return domain.Vec3{
		X: (r.BBoxMin.X + r.BBoxMax.X) / 2,
		Y: (r.BBoxMin.Y + r.BBoxMax.Y) / 2,
		Z: (r.BBoxMin.Z + r.BBoxMax.Z) / 2,
	}
}
```

Regenerate: `cd /Users/vbncursed/programming/rosneft/backend/services/mesh-service && go generate ./internal/service/` → exits 0.

In `backend/CLAUDE.md`, change "and the rescale CTE over placements and measurements" to "and the rescale CTE over placements, measurements and panoramas".

- [ ] **Step 7: Run everything — green**

Run: `cd /Users/vbncursed/programming/rosneft/backend/services/mesh-service && go test -race ./...` → all `ok`.
Run: `cd /Users/vbncursed/programming/rosneft/backend/services/catalog-service && go test -race ./...` → all `ok`.
Run: `cd /Users/vbncursed/programming/rosneft/backend/services/gateway-service && go build ./...` → exits 0 (the gateway never calls the rescale RPC; this proves the regenerated proto still builds there).
Run (Docker): `cd /Users/vbncursed/programming/rosneft/backend/services/catalog-service && GOWORK=off go test -race -tags=integration ./internal/storage/ -run TestRescaleSuite -v`
Expected: `--- PASS` for `TestScalesTheTerritorysMeasurementsWithItsPlacements`, `TestLeavesAnotherTerritoryAlone`, `TestAFactorOfOneWritesNothing`, `TestTheFirstBaselineKeepsItsCenter`, `TestKeepsEveryBindingOnItsWorldPointWhenTheCenterMoves`, `TestANullBaselineCenterOnlyScales`, `TestAMovedCenterAloneStillShifts`; then `ok`.
Then prove the center test bites: temporarily change `+ b.ox` on `position_x` in the `upd` CTE to `+ 0`, rerun the same command, see `TestKeepsEveryBindingOnItsWorldPointWhenTheCenterMoves` FAIL with `world point moved`, and put `+ b.ox` back (verify with `grep -c '+ b.ox' backend/services/catalog-service/internal/storage/rescale_territory_placements.go` → `3`).
Run (Docker): `cd /Users/vbncursed/programming/rosneft/backend/services/catalog-service && GOWORK=off go test -race -tags=integration ./internal/storage/ ./internal/migrate/` → `ok` for both.

- [ ] **Step 8: Commit gate**

Run: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C /Users/vbncursed/programming/rosneft/backend check`
Expected: ends without error.

- [ ] **Step 9: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add backend/proto/rosneft/catalog/v1/catalog.proto \
  backend/proto/gen/go/rosneft/catalog/v1 \
  backend/services/catalog-service/internal/storage/rescale_territory_placements.go \
  backend/services/catalog-service/internal/storage/rescale_integration_test.go \
  backend/services/catalog-service/internal/service/rescale_territory_placements.go \
  backend/services/catalog-service/internal/service/catalog.go \
  backend/services/catalog-service/internal/service/rescale_test.go \
  backend/services/catalog-service/internal/service/mocks/repository_mock.go \
  backend/services/catalog-service/internal/transport/grpcapi/server.go \
  backend/services/catalog-service/internal/transport/grpcapi/rescale_territory_placements.go \
  backend/services/catalog-service/internal/transport/grpcapi/mocks/service_mock.go \
  backend/services/mesh-service/internal/catalog/rescale_placements.go \
  backend/services/mesh-service/internal/service/mesh.go \
  backend/services/mesh-service/internal/service/rescale_placements.go \
  backend/services/mesh-service/internal/service/rescale_placements_internal_test.go \
  backend/services/mesh-service/internal/service/mocks/catalog_mock.go \
  backend/CLAUDE.md
git diff --cached --name-only
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) git commit -m "$(cat <<'EOF'
fix(catalog): a source replace keeps placements, rulers and panoramas in place

The rescale multiplied by old_max/new_max and ignored the bbox center, so a
replacement whose center moved shifted every binding; panoramas were not
touched at all. mesh-worker now passes LOD0's center and one statement maps
placements, measurement points and panorama anchors with
s' = s·(M/M') + (c − c')·2/M', then clears the whole baseline. A baseline
without a center (captured before the column) completes scale-only.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

Expected: the cached list shows only the paths above.

**Deploy note (put it in the PR text):** `Vec3` is a message field, so it has presence; both
catalog handlers refuse a request without the centre (`InvalidArgument`) instead of reading it as
the origin. Catalog, gateway and mesh-worker still roll out together (compose); a stale caller in
between fails loudly and its job is retried by the reconciler, never shifting a binding by
`c·2/M'`. Add a handler test per RPC: a request with a nil centre answers `codes.InvalidArgument`
and the service mock is not called (imports `google.golang.org/grpc/codes`, `…/grpc/status`). A baseline pending *at deploy time* has a NULL center and completes scale-only.

---

## Spec discrepancies found against the code

1. **B — "same `maxLength` as create" does not exist.** `EntityCreate.title` in
   `openapi.yaml` declares no `maxLength`, and `territories.title` / `models.title` are unbounded
   `TEXT`; the only cap is the gateway's 1 MiB `LimitBody`. The plan adds none. Say so if a cap is wanted.
2. **B — `minLength: 1` enforces nothing by itself.** The gateway mounts no OpenAPI request
   validator (oapi-codegen strict server, no `OapiRequestValidator`), so the 400 for a blank title
   comes from `validateTitlePatch` in the service, which also rejects whitespace-only titles.
3. **B — "the territory catalog card menu" is not a menu.** Cards carry icon buttons (replace, delete)
   in `actions`; the plan adds a third, a pencil, behind the same `territory:write` grant.
4. **B — "`setQueryData` for the single entity and the list entry" misses the viewer.** The viewer
   header reads its title from `["scene", slug]` (`bundle.territory.title`), not `["territory", slug]`,
   so the hook writes the scene bundle too. Not covered: model titles inside other territories'
   cached `scene.modelOptions` stay stale until that query goes stale (30 s) — `/scene` rereads the
   model row, as the spec says.
5. **C — the spec misses the audit trigger.** `audit_capture()` drops an UPDATE only when it touches
   nothing but `updated_at`, `onboarding_tours_seen` or `rescale_baseline_max`
   (audit 00003). Three new center columns outside that list would file a `territory.update` entry on
   every source replace (attributed to the user) and another on every rescale (to the system). C1
   adds audit migration 00006 to widen the list — and that breaks
   `rollback_integration_test.go`'s `TestOneStepBackForgetsMeasurements`, which assumes 00005 is the
   newest migration; C1 fixes it too.
6. **C — the formula checks out against the converter.** `normalize()` centers on the bbox midpoint and
   scales by `2/maxDim` after the Z-up→Y-up swap, and the stored `bbox_min/max` are those same
   pre-normalize Y-up corners, so `c` and `s` share one set of axes; the viewer adds no transform of its
   own (`gltf-model.tsx` renders the GLB as-is). Measurements are flat `x,y,z` triples (00015); panoramas
   have `position_x/y/z` in normalized scene units (00004). The latest catalog migration is 00016, so the
   new one is 00017.
7. **C — the old epsilon guard would skip a center-only move.** Today's guard is
   `abs(old_max/new_max − 1) >= 1e-9`; with a shift term, a same-size re-scan whose bbox moved must still
   write. The `moved` CTE checks the factor **and** the offsets (covered by `TestAMovedCenterAloneStillShifts`).

---

## Part D — backend tasks

> Sections for the main plan. REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or superpowers:executing-plans). Steps use `- [ ]` checkboxes.

**Spec:** `docs/superpowers/specs/2026-09-23-edit-and-batching-design.md`, section D. Read it next to this plan.

**Order:** D2 → D3a → D3b → D3c → D3d → D4. D4 uses D3a's `Gateway.ListTerritoryAdmins` and D3b's shared Prometheus client.

## Global constraints (every task)

- Go 1.27.1. Use `t.Context()`, `wg.Go`, `new(value)`, `errors.AsType`, `for range n`, and `encoding/json/v2` in **new** JSON code. Leave existing `encoding/json` alone.
- Tests use `testify/suite` + `gotest.tools/v3/assert` + minimock. Plain `testing` alone is not allowed. Keep `gotest.tools` asserts inside suites.
- Keep each file under 200 lines, one concern per file. Sentinel errors live in `domain`.
- Every storage write to an audited table goes through `audittx.Run`.
- Commit gate on this Mac, before every Go commit: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` (use the same env on `git commit` so the hook passes). It must exit 0.
- A parallel session works in this tree. **Stage by path only.** Never run `git stash`, `checkout`, `reset` or `restore`, and never kill processes you did not start.
- Regenerate code after each contract change:
  - proto: `make -C backend proto-gen` (needs `buf` plus network for the remote plugins)
  - Go stubs from OpenAPI: `make -C backend openapi-gen`
  - TS types: `(cd frontend && yarn openapi:generate)`, which rewrites `frontend/src/shared/api/dto.ts`
  - mocks: `go generate` on the package that holds the `//go:generate minimock` line
- The storage integration suites need Docker. `make check` does **not** run them, so each task runs its own suite by hand.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## JSON contracts the frontend builds against

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/territories`, `GET /api/models` | unchanged | Each `Territory` / `Model` also has `lods?: LodArtifact[]`, sorted by `lod` ascending. On these two list endpoints it is **always present**, as `[]` before the first conversion. It is absent from every other response that carries a Territory or Model. `LodArtifact = {lod: number, hash: string, size: number, vertices?: number, faces?: number}` |
| `GET /api/territory-admins` | none | `200 {[slug: string]: string[]}`. Every visible territory has a key, with `[]` when nobody is assigned. Ids are in assignment order. **Root only.** Anyone else gets `403 {code:"forbidden", message:"root only"}` |
| `GET /api/metrics/query?panel=a&panel=b&range=1h` | repeated `panel` (repeats collapse), one `range` | `200 {[panelId: string]: MetricSeries[]}`, each value an array (`[]` when there are no series). `400` for no panel, any unknown panel, or a bad range. `403` for non-owners. A panel whose query failed is **absent**; `502` only when every panel failed. `Cache-Control: no-store` |
| `POST /api/territories/{slug}/placements/batch` | `{items: PlacementCreate[]}`, 1–100 items, `X-CSRF-Token` | `201 Placement[]` in `items` order. All or nothing. `400` for count out of range, a bad item, or a panorama not on the territory. `403` without `placement:create`. `404` for an unknown/foreign territory or unknown model (nothing is written). |
| `PATCH /api/auth/roles/{slug}` | `{title: string, permissionSlugs?: string[]}` | `200 AuthRole`. `permissionSlugs` absent leaves the grants alone. Present (even `[]`) replaces them in the rename's transaction, with the same no-escalation check as `PUT …/permissions` (`403` on escalation, `400` for an unknown permission) |
| `GET /api/console/summary` | none | `200` object with one key per card the caller can open (a closed card is **absent**). A value is `null` when its source failed: `users: {total, frozen} \| null`, `roles: {roles, permissions} \| null`, `content: {territories, models} \| null`, `access: number \| null`, `audit24h: number \| null`, `alerts: number \| null`. A Viewer gets `{}`. `Cache-Control: no-store`. `401` without a session. |

Card gates for D4. They are a copy of `frontend/src/app/router/guard.ts` `SCREENS`, not `widgets/console-nav`, which only renders the `disabled` flag that guard sets. Root passes every `can`:

| key | open when | number (the frontend keeps the wording) |
|---|---|---|
| `users` | `users:read` | `total` = live accounts (deleted excluded, same as `usersHint`'s `live.length`), `frozen` = frozen among them |
| `roles` | `roles:read` | `roles` = roles the caller sees, `permissions` = size of the permission catalog |
| `content` | `territory:write` or `model:write` | caller-visible territories, all models |
| `access` | Root | sum over all territories of assigned admins (same as summing `adminsQuery` lengths) |
| `audit24h` | `audit:read` | exact count of journal rows at or after start-of-current-hour − 23 h: the 24 buckets `bucketOf` draws. **Not capped at 200.** |
| `alerts` | Root | distinct firing rules keyed `alertname\|service\|severity`, same as `alertsOf` then `state === "firing"` |

---

### Task D2-be: LOD chain on the list payloads

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to` (+ `golang-testing`, `golang-database`, `golang-grpc`).

**Design:** No new RPC. `Territory` and `Model` proto messages get `repeated … artifacts = 9`. Catalog storage `ListTerritories`/`ListModels` fill the field with **one** extra query per call over every row on the page. The gateway maps each chain to `lods`. This is the smaller change: no new RPC, no request flag, and the gateway handler keeps a single catalog call. Cost: the other `ListTerritories` callers (`/api/jobs` poll, mesh reconciler) also pay that one indexed query.

**Files:**
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto` (Territory, Model); regenerate `backend/proto/gen/go/rosneft/catalog/v1/catalog.pb.go`
- Modify: `backend/services/catalog-service/internal/domain/types.go`
- Create: `backend/services/catalog-service/internal/storage/list_artifacts_by_slug.go`
- Modify: `backend/services/catalog-service/internal/storage/list_territories.go`, `…/storage/list_models.go`
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/converters.go`
- Create: `backend/services/catalog-service/internal/storage/batch_integration_test.go`
- Create: `backend/services/catalog-service/internal/transport/grpcapi/list_territories_test.go`
- Modify: `backend/services/gateway-service/internal/domain/types.go`
- Modify: `backend/services/gateway-service/internal/clients/catalog/converters.go`
- Create: `backend/services/gateway-service/internal/clients/catalog/converters_test.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/territories.go`, `…/httpapi/models.go`, `…/httpapi/list_counts_test.go`
- Modify: `backend/services/gateway-service/api/openapi.yaml`; regenerate `…/internal/transport/httpapi/openapi_gen.go`, `…/openapi_spec_gen.go`, `frontend/src/shared/api/dto.ts`
- Modify: `CLAUDE.md` (endpoint list)

**Interfaces:**
- Produces (catalog domain): `domain.Territory.Artifacts []domain.Artifact` and `domain.Model.Artifacts []domain.Artifact`, sorted by LOD and filled by `ListTerritories`/`ListModels` only.
- Produces (catalog storage, unexported): `func (r *PG) artifactsBySlug(ctx context.Context, q string, slugs []string) (map[string][]domain.Artifact, error)`
- Produces (gateway domain): `domain.Territory.LODs []domain.LodArtifact` and `domain.Model.LODs []domain.LodArtifact`
- Produces (JSON): `lods` as described in the contract table.

- [ ] **Step 1: Proto.** In `catalog.proto`, add to `message Territory` after `uint32 placement_count = 8;`:

```proto
  // Every LOD artifact, sorted by lod. Filled by ListTerritories only: the list
  // pages need the chain and would otherwise ask once per row.
  repeated TerritoryArtifact artifacts = 9;
```

Add to `message Model` after `uint32 usage_count = 8;`:

```proto
  // Every LOD artifact, sorted by lod. Filled by ListModels only.
  repeated ModelArtifact artifacts = 9;
```

Run: `make -C backend proto-gen && (cd backend/proto && go build ./...)`. Expected: exit 0, and `git status` shows `catalog.pb.go` modified.

- [ ] **Step 2: Failing storage test.** Create `backend/services/catalog-service/internal/storage/batch_integration_test.go`. Later tasks (D3a, D3c) add methods to this suite. Each test uses its own slugs and asserts only on them, so shuffle order cannot matter.

```go
//go:build integration

package storage_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// BatchSuite covers the batch reads and writes behind section D of the
// edit-and-batching spec: one ANY($1) query for a whole page instead of one per
// row, and one transaction for a whole placement batch. The grouping and the
// rollback are SQL, so a mock could not see them break.
type BatchSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	pg    *storage.PG
	admin string
}

func TestBatchSuite(t *testing.T) { suite.Run(t, new(BatchSuite)) }

func (s *BatchSuite) SetupSuite() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, dsn))

	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.pg = storage.New(s.pool)
	s.admin = "11111111-1111-1111-1111-111111111111"
}

func (s *BatchSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// seedTerritory creates a territory and assigns each of admins to it.
func (s *BatchSuite) seedTerritory(ctx context.Context, slug string, admins ...string) {
	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1,$1,$1) RETURNING id`,
		slug).Scan(&id)
	assert.NilError(s.T(), err)
	for _, admin := range admins {
		_, err = s.pool.Exec(ctx,
			`INSERT INTO territory_assignments (territory_id, admin_user_id) VALUES ($1, $2::uuid)`,
			id, admin)
		assert.NilError(s.T(), err)
	}
}

func (s *BatchSuite) seedModel(ctx context.Context, slug string) {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO models (slug, title, source_blob_hash) VALUES ($1,$1,$1)`, slug)
	assert.NilError(s.T(), err)
}

func lodsOf(arts []domain.Artifact) []uint32 {
	out := make([]uint32, len(arts))
	for i, a := range arts {
		out[i] = a.LOD
	}
	return out
}

func (s *BatchSuite) TestListsCarryEachLODChainInOrder() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "lods-yard", s.admin)
	s.seedTerritory(ctx, "lods-fresh", s.admin)
	s.seedModel(ctx, "lods-pump")
	// Registered out of order on purpose: the chain must come back sorted.
	for _, lod := range []uint32{2, 0, 1} {
		_, err := s.pg.RegisterTerritoryArtifact(ctx, domain.Artifact{
			Slug: "lods-yard", LOD: lod, Hash: fmt.Sprintf("t-%d", lod), ContentType: "model/gltf-binary",
		})
		assert.NilError(s.T(), err)
		_, err = s.pg.RegisterModelArtifact(ctx, domain.Artifact{
			Slug: "lods-pump", LOD: lod, Hash: fmt.Sprintf("m-%d", lod), ContentType: "model/gltf-binary",
		})
		assert.NilError(s.T(), err)
	}

	terrs, err := s.pg.ListTerritories(ctx, "")
	assert.NilError(s.T(), err)
	bySlug := map[string]domain.Territory{}
	for _, t := range terrs {
		bySlug[t.Slug] = t
	}
	assert.DeepEqual(s.T(), lodsOf(bySlug["lods-yard"].Artifacts), []uint32{0, 1, 2})
	assert.Equal(s.T(), bySlug["lods-yard"].Artifacts[0].Hash, "t-0")
	assert.Equal(s.T(), bySlug["lods-yard"].Artifacts[0].Slug, "lods-yard")
	assert.Equal(s.T(), len(bySlug["lods-fresh"].Artifacts), 0)

	models, err := s.pg.ListModels(ctx)
	assert.NilError(s.T(), err)
	for _, m := range models {
		if m.Slug == "lods-pump" {
			assert.DeepEqual(s.T(), lodsOf(m.Artifacts), []uint32{0, 1, 2})
			assert.Equal(s.T(), m.Artifacts[2].Hash, "m-2")
		}
	}
}
```

Run: `cd backend/services/catalog-service && GOWORK=off go test -race -tags=integration -run TestBatchSuite ./internal/storage/`. Expected: FAIL to compile with `bySlug["lods-yard"].Artifacts undefined (type domain.Territory has no field or method Artifacts)`.

- [ ] **Step 3: Domain + storage.** In `catalog-service/internal/domain/types.go`, add to `Territory` after `PlacementCount int \`yaml:"-"\``:

```go
	// Artifacts is the LOD chain, sorted by lod. Filled by ListTerritories only:
	// the list pages need it and would otherwise ask once per row.
	Artifacts []Artifact `yaml:"-"`
```

Add the same field to `Model`, with the comment naming `ListModels`.

Create `catalog-service/internal/storage/list_artifacts_by_slug.go`:

```go
package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// The list pages' LOD chains: every row of a page in one query, keyed through
// the unique (…_id, lod) index. Matched by slug rather than id because a listed
// row carries no id; the slug is unique and indexed too.
const (
	territoryArtifactsBySlug = `SELECT t.slug, ` + artifactSelectCols + `
		FROM territory_artifacts a
		JOIN territories t ON t.id = a.territory_id
		WHERE t.slug = ANY($1)
		ORDER BY a.lod`
	modelArtifactsBySlug = `SELECT m.slug, ` + artifactSelectCols + `
		FROM model_artifacts a
		JOIN models m ON m.id = a.model_id
		WHERE m.slug = ANY($1)
		ORDER BY a.lod`
)

// artifactsBySlug runs q for every slug at once and groups the rows by owner.
// ORDER BY lod keeps each owner's chain sorted as it is appended.
func (r *PG) artifactsBySlug(ctx context.Context, q string, slugs []string) (map[string][]domain.Artifact, error) {
	rows, err := r.pool.Query(ctx, q, slugs)
	if err != nil {
		return nil, fmt.Errorf("artifacts by slug: query: %w", err)
	}
	defer rows.Close()

	out := make(map[string][]domain.Artifact, len(slugs))
	for rows.Next() {
		var a domain.Artifact
		if err := rows.Scan(&a.Slug,
			&a.LOD, &a.Hash, &a.ContentType, &a.Size, &a.Vertices, &a.Faces,
			&a.BBoxMin.X, &a.BBoxMin.Y, &a.BBoxMin.Z,
			&a.BBoxMax.X, &a.BBoxMax.Y, &a.BBoxMax.Z,
			&a.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("artifacts by slug: scan: %w", err)
		}
		out[a.Slug] = append(out[a.Slug], a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("artifacts by slug: iter: %w", err)
	}
	return out, nil
}
```

In `list_territories.go`, replace the final `return out, nil` with:

```go
	slugs := make([]string, len(out))
	for i, t := range out {
		slugs[i] = t.Slug
	}
	chains, err := r.artifactsBySlug(ctx, territoryArtifactsBySlug, slugs)
	if err != nil {
		return nil, fmt.Errorf("storage.ListTerritories: %w", err)
	}
	for i := range out {
		out[i].Artifacts = chains[out[i].Slug]
	}
	return out, nil
```

Make the same edit in `list_models.go` using `modelArtifactsBySlug` and the `storage.ListModels:` prefix. Also extend its doc comment: `Each model carries its LOD chain (one extra query for the whole list).` Add the matching sentence to `ListTerritories`' doc.

Run the Step 2 command again. Expected: PASS (`ok … internal/storage`).

- [ ] **Step 4: Failing catalog transport test.** Create `catalog-service/internal/transport/grpcapi/list_territories_test.go`:

```go
package grpcapi_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi/mocks"
)

// ListsSuite pins that the list RPCs carry each row's LOD chain onto the wire;
// storage fills it, and a converter that dropped it would ship empty lods.
type ListsSuite struct {
	suite.Suite
	svc *mocks.ServiceMock
	srv *grpcapi.Server
	ctx context.Context
}

func TestListsSuite(t *testing.T) { suite.Run(t, new(ListsSuite)) }

func (s *ListsSuite) SetupTest() {
	s.svc = mocks.NewServiceMock(minimock.NewController(s.T()))
	s.srv = grpcapi.New(s.svc)
	s.ctx = s.T().Context()
}

var chain = []domain.Artifact{{Slug: "yard", LOD: 0, Hash: "h0"}, {Slug: "yard", LOD: 1, Hash: "h1"}}

func (s *ListsSuite) TestListTerritoriesCarriesEachChain() {
	s.svc.ListTerritoriesMock.Expect(s.ctx, "").Return([]domain.Territory{{Slug: "yard", Artifacts: chain}}, nil)
	out, err := s.srv.ListTerritories(s.ctx, &catalogv1.ListTerritoriesRequest{})
	assert.NilError(s.T(), err)
	arts := out.GetTerritories()[0].GetArtifacts()
	assert.Equal(s.T(), len(arts), 2)
	assert.Equal(s.T(), arts[1].GetLod(), uint32(1))
	assert.Equal(s.T(), arts[1].GetHash(), "h1")
	assert.Equal(s.T(), arts[1].GetTerritorySlug(), "yard")
}

func (s *ListsSuite) TestListModelsCarriesEachChain() {
	s.svc.ListModelsMock.Expect(s.ctx).Return([]domain.Model{{Slug: "yard", Artifacts: chain}}, nil)
	out, err := s.srv.ListModels(s.ctx, &catalogv1.ListModelsRequest{})
	assert.NilError(s.T(), err)
	arts := out.GetModels()[0].GetArtifacts()
	assert.Equal(s.T(), len(arts), 2)
	assert.Equal(s.T(), arts[0].GetHash(), "h0")
	assert.Equal(s.T(), arts[0].GetModelSlug(), "yard")
}
```

Run: `cd backend/services/catalog-service && go test -race -run TestListsSuite ./internal/transport/grpcapi/`. Expected: FAIL. `len(arts)` is 0 (assertion `0 != 2`).

- [ ] **Step 5: Catalog converter.** In `grpcapi/converters.go`, set `Artifacts: artifactsToProto(t.Artifacts, territoryArtifactToProto),` in `territoryToProto` and `Artifacts: artifactsToProto(m.Artifacts, modelArtifactToProto),` in `modelToProto`, then add:

```go
// artifactsToProto maps a LOD chain with the per-kind converter.
func artifactsToProto[P any](in []domain.Artifact, conv func(domain.Artifact) P) []P {
	out := make([]P, len(in))
	for i, a := range in {
		out[i] = conv(a)
	}
	return out
}
```

Run the Step 4 command. Expected: PASS.

- [ ] **Step 6: Failing gateway client test.** Create `gateway-service/internal/clients/catalog/converters_test.go`:

```go
// In-package test: the converters are unexported.
package catalog

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type ConvertersSuite struct{ suite.Suite }

func TestConvertersSuite(t *testing.T) { suite.Run(t, new(ConvertersSuite)) }

var wantLODs = []domain.LodArtifact{{LOD: 0, Hash: "h0", Size: 10, Vertices: 8, Faces: 12}, {LOD: 1, Hash: "h1", Size: 4}}

func (s *ConvertersSuite) TestATerritoryCarriesItsLODChain() {
	got := territoryFromProto(&catalogv1.Territory{Slug: "yard", Artifacts: []*catalogv1.TerritoryArtifact{
		{Lod: 0, Hash: "h0", Size: 10, Vertices: 8, Faces: 12}, {Lod: 1, Hash: "h1", Size: 4},
	}})
	assert.DeepEqual(s.T(), got.LODs, wantLODs)
}

func (s *ConvertersSuite) TestAModelCarriesItsLODChain() {
	got := modelFromProto(&catalogv1.Model{Slug: "pump", Artifacts: []*catalogv1.ModelArtifact{
		{Lod: 0, Hash: "h0", Size: 10, Vertices: 8, Faces: 12}, {Lod: 1, Hash: "h1", Size: 4},
	}})
	assert.DeepEqual(s.T(), got.LODs, wantLODs)
}
```

Run: `cd backend/services/gateway-service && go test -race -run TestConvertersSuite ./internal/clients/catalog/`. Expected: FAIL to compile, `got.LODs undefined`.

- [ ] **Step 7: Gateway domain and client.** In `gateway-service/internal/domain/types.go`, add to `Territory` after `PlacementCount int`:

```go
	// LODs is the artifact chain, sorted by lod. Filled on the list endpoint only.
	LODs []LodArtifact
```

Add the same to `Model`. In `clients/catalog/converters.go`, add `LODs: lodsFromProto(t.GetArtifacts()),` to the `territoryFromProto` literal and `LODs: lodsFromProto(m.GetArtifacts()),` to `modelFromProto`, then append:

```go
// lodSource is what TerritoryArtifact and ModelArtifact share.
type lodSource interface {
	GetLod() uint32
	GetHash() string
	GetSize() int64
	GetVertices() uint64
	GetFaces() uint64
}

func lodsFromProto[A lodSource](in []A) []domain.LodArtifact {
	out := make([]domain.LodArtifact, len(in))
	for i, a := range in {
		out[i] = domain.LodArtifact{
			LOD: a.GetLod(), Hash: a.GetHash(), Size: a.GetSize(),
			Vertices: a.GetVertices(), Faces: a.GetFaces(),
		}
	}
	return out
}
```

Run the Step 6 command. Expected: PASS.

- [ ] **Step 8: OpenAPI.** In `api/openapi.yaml`, add under `Territory.properties`, after `placementCount`:

```yaml
        lods:
          type: array
          description: |
            Every converted LOD, sorted by lod ascending. Always present on
            GET /api/territories (`[]` before the first conversion lands);
            absent from every other response carrying a Territory.
          items: { $ref: '#/components/schemas/LodArtifact' }
```

Add the same under `Model.properties` after `usageCount`, with `GET /api/models` in the text. Run: `make -C backend openapi-gen && (cd frontend && yarn openapi:generate)`. Expected: exit 0, and `Lods *[]LodArtifact` appears in `openapi_gen.go` for both structs.

- [ ] **Step 9: Failing handler test.** Append to `gateway-service/internal/transport/httpapi/list_counts_test.go` (add `"encoding/json"` to its imports):

```go
// The list endpoints always carry the chain, as [] before a conversion lands:
// the catalog pages stop asking /artifacts per row and must not have to guess
// whether an absent key means "none" or "not sent". Encoded with v1
// encoding/json because the strict handlers' Visit methods encode with it.
func (s *ListCountsSuite) TestListTerritoriesCarriesTheLODChain() {
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")
	stub := countsServiceStub{territories: []domain.Territory{
		{Slug: "yard", LODs: []domain.LodArtifact{{LOD: 0, Hash: "h0", Size: 10}, {LOD: 1, Hash: "h1", Size: 4}}},
		{Slug: "fresh"},
	}}
	resp, err := New(stub).ListTerritories(ctx, ListTerritoriesRequestObject{})
	assert.NilError(s.T(), err)
	list, ok := resp.(ListTerritories200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), len(*list[0].Lods), 2)
	assert.Equal(s.T(), (*list[0].Lods)[1].Hash, "h1")
	body, err := json.Marshal(list[1])
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), strings.Contains(string(body), `"lods":[]`), string(body))
}

func (s *ListCountsSuite) TestListModelsCarriesTheLODChain() {
	stub := countsServiceStub{models: []domain.Model{
		{Slug: "pump", LODs: []domain.LodArtifact{{LOD: 0, Hash: "m0", Size: 3}}},
	}}
	resp, err := New(stub).ListModels(s.T().Context(), ListModelsRequestObject{})
	assert.NilError(s.T(), err)
	list, ok := resp.(ListModels200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), (*list[0].Lods)[0].Hash, "m0")
}
```

(Add `"strings"` to the imports as well.) Run: `cd backend/services/gateway-service && go test -race -run TestListCountsSuite ./internal/transport/httpapi/`. Expected: FAIL with a nil-pointer panic on `*list[0].Lods`.

- [ ] **Step 10: Handlers.** In `httpapi/territories.go` `ListTerritories`, change the loop body to:

```go
		resp[i] = territoryToAPI(t)
		resp[i].Lods = new(lodChainToAPI(t.LODs))
```

In `httpapi/models.go` `ListModels`:

```go
		resp[i] = modelToAPI(m)
		resp[i].Lods = new(lodChainToAPI(m.LODs))
```

`lodChainToAPI` already exists in `converters.go`. It returns a non-nil slice, so `[]` is encoded. Run the Step 9 command. Expected: PASS.

- [ ] **Step 11: Docs.** In root `CLAUDE.md`, under "Backend gateway endpoints used by the frontend", extend the first bullet with: ``The two list endpoints (`GET /api/territories`, `GET /api/models`) also carry `lods` (every LOD, sorted, `[]` before the first conversion), read in one catalog query for the whole page; the single GETs do not.``

- [ ] **Step 12: Gate + live check.**

```bash
CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check
(cd backend/services/catalog-service && GOWORK=off go test -race -tags=integration -run TestBatchSuite ./internal/storage/)
```

Expected: both exit 0. Live check with compose rebuilt (`make -C backend compose-up`), as root:

```bash
curl -s -H "Authorization: Bearer $ROOT" localhost:8080/api/territories | jq '.[] | {slug, lods: (.lods | map(.lod))}'
```

Expected: `dji-wp-46-cut` shows `[0,1,2]`, and `tenant-a-scene` shows `[]`.

- [ ] **Step 13: Commit.**

```bash
git add backend/proto/rosneft/catalog/v1/catalog.proto backend/proto/gen/go/rosneft/catalog/v1/catalog.pb.go \
  backend/services/catalog-service/internal/domain/types.go \
  backend/services/catalog-service/internal/storage/list_artifacts_by_slug.go \
  backend/services/catalog-service/internal/storage/list_territories.go \
  backend/services/catalog-service/internal/storage/list_models.go \
  backend/services/catalog-service/internal/storage/batch_integration_test.go \
  backend/services/catalog-service/internal/transport/grpcapi/converters.go \
  backend/services/catalog-service/internal/transport/grpcapi/list_territories_test.go \
  backend/services/gateway-service/internal/domain/types.go \
  backend/services/gateway-service/internal/clients/catalog/converters.go \
  backend/services/gateway-service/internal/clients/catalog/converters_test.go \
  backend/services/gateway-service/internal/transport/httpapi/territories.go \
  backend/services/gateway-service/internal/transport/httpapi/models.go \
  backend/services/gateway-service/internal/transport/httpapi/list_counts_test.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go \
  backend/services/gateway-service/api/openapi.yaml frontend/src/shared/api/dto.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(catalog,gateway): LOD chain on the territory and model lists

GET /api/territories and /api/models carry lods, read by one ANY($1) query
per list instead of one /artifacts request per row from the SPA.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task D3a-be: `GET /api/territory-admins`

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to` (+ `golang-testing`, `golang-database`, `golang-security`, `golang-grpc`).

**Design:** The per-slug `GET /api/territories/{slug}/admins` is **Root only** (`territory_admins.go`, `IsOwner`), and so is the Access screen. The batch keeps that gate, so it discloses nothing the single read did not. The territory set still comes from `authhttp.Scope` → `ListTerritories`, the resolver `GET /api/territories` uses. That is `""` (all) for Root. It is still the rule to keep if the gate is ever widened. New catalog RPC `ListTerritoryAdmins(slugs)` runs one `ANY($1)` query and returns flat pairs. The gateway groups them and adds `[]` for territories nobody is assigned to.

**Files:**
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto`; regenerate `catalog.pb.go`, `catalog_grpc.pb.go`
- Create: `backend/services/catalog-service/internal/storage/list_territory_admins.go`
- Create: `backend/services/catalog-service/internal/service/list_territory_admins.go`
- Create: `backend/services/catalog-service/internal/transport/grpcapi/list_territory_admins.go`
- Modify: `backend/services/catalog-service/internal/service/catalog.go` (Repository), `…/transport/grpcapi/server.go` (Service); regenerate `…/service/mocks/repository_mock.go`, `…/grpcapi/mocks/service_mock.go`
- Modify: `backend/services/catalog-service/internal/storage/batch_integration_test.go`
- Modify: `backend/services/gateway-service/internal/clients/catalog/territory_admins.go`; create `…/clients/catalog/territory_admins_test.go`
- Modify: `backend/services/gateway-service/internal/service/gateway.go` (Catalog), `…/service/territory_admins.go`; create `…/service/territory_admins_test.go`; regenerate `…/service/mocks/catalog_mock.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/server.go` (Service), `…/httpapi/territory_admins.go`; create `…/httpapi/territory_admins_test.go`
- Modify: `backend/services/gateway-service/api/openapi.yaml`; regenerate `openapi_gen.go`, `openapi_spec_gen.go`, `frontend/src/shared/api/dto.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces (catalog storage/service/grpcapi `Service`): `ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error)`. A slug with no assignments, or an unknown slug, has no key.
- Produces (gateway `service.Catalog`, client): `ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error)`
- Produces (gateway `*service.Gateway`, `httpapi.Service`): `ListTerritoryAdmins(ctx context.Context, scopeAdminID string) (map[string][]string, error)`. Every visible territory has a key, never nil. **D4 calls it.**
- Produces (JSON): `GET /api/territory-admins` → `{[slug]: string[]}`

- [ ] **Step 1: Proto.** In `catalog.proto`, add under `rpc GetTerritoryAdmins(…)`:

```proto
  // ListTerritoryAdmins is GetTerritoryAdmins for many territories in one
  // query: the access screen used to ask once per territory.
  rpc ListTerritoryAdmins(ListTerritoryAdminsRequest) returns (ListTerritoryAdminsResponse);
```

Add after `message GetTerritoryAdminsResponse`:

```proto
message ListTerritoryAdminsRequest {
  repeated string slugs = 1;
}
// TerritoryAdmin is one assignment. Flat pairs rather than a map of lists: a
// proto map cannot hold a repeated value without a wrapper message.
message TerritoryAdmin {
  string territory_slug = 1;
  string admin_user_id = 2;
}
message ListTerritoryAdminsResponse {
  // Grouped by territory, in assignment order within one. A slug nobody is
  // assigned to, or that does not exist, contributes no pair.
  repeated TerritoryAdmin admins = 1;
}
```

Run: `make -C backend proto-gen`. Expected: exit 0.

- [ ] **Step 2: Failing storage test.** Append to `batch_integration_test.go` (add `"slices"` to its imports):

```go
func (s *BatchSuite) TestTerritoryAdminsComeBackPerSlug() {
	ctx := s.T().Context()
	other := "22222222-2222-2222-2222-222222222222"
	s.seedTerritory(ctx, "admins-a", s.admin)
	s.seedTerritory(ctx, "admins-b", s.admin, other)
	s.seedTerritory(ctx, "admins-none")
	s.seedTerritory(ctx, "admins-unasked", other)

	got, err := s.pg.ListTerritoryAdmins(ctx, []string{"admins-a", "admins-b", "admins-none", "no-such"})
	assert.NilError(s.T(), err)
	// Two inserts can share a created_at to the microsecond; the contract under
	// test is which ids land where, so compare sets.
	slices.Sort(got["admins-b"])
	assert.DeepEqual(s.T(), got, map[string][]string{
		"admins-a": {s.admin},
		"admins-b": {s.admin, other},
	})
}
```

Run: `cd backend/services/catalog-service && GOWORK=off go test -race -tags=integration -run TestBatchSuite ./internal/storage/`. Expected: FAIL to compile, `s.pg.ListTerritoryAdmins undefined`.

- [ ] **Step 3: Storage.** Create `catalog-service/internal/storage/list_territory_admins.go`:

```go
package storage

import (
	"context"
	"fmt"
)

// ListTerritoryAdmins returns the admin ids assigned to each of slugs, in
// assignment order: GetTerritoryAdmins for a whole page in one query. A slug
// nobody is assigned to is absent, and so is an unknown one.
func (r *PG) ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error) {
	const q = `SELECT t.slug, a.admin_user_id::text
FROM territory_assignments a
JOIN territories t ON t.id = a.territory_id
WHERE t.slug = ANY($1)
ORDER BY a.created_at`

	rows, err := r.pool.Query(ctx, q, slugs)
	if err != nil {
		return nil, fmt.Errorf("storage.ListTerritoryAdmins: query: %w", err)
	}
	defer rows.Close()

	out := make(map[string][]string, len(slugs))
	for rows.Next() {
		var slug, id string
		if err := rows.Scan(&slug, &id); err != nil {
			return nil, fmt.Errorf("storage.ListTerritoryAdmins: scan: %w", err)
		}
		out[slug] = append(out[slug], id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListTerritoryAdmins: iter: %w", err)
	}
	return out, nil
}
```

Run the Step 2 command. Expected: PASS.

- [ ] **Step 4: Catalog service + transport.** Add `ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error)` under `GetTerritoryAdmins` in the `Repository` interface (`service/catalog.go`) and in the grpcapi `Service` interface (`grpcapi/server.go`). Create `service/list_territory_admins.go`:

```go
package service

import "context"

// ListTerritoryAdmins returns the admin ids of each of slugs, keyed by slug.
func (c *Catalog) ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error) {
	return c.repo.ListTerritoryAdmins(ctx, slugs)
}
```

Create `grpcapi/list_territory_admins.go`:

```go
package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListTerritoryAdmins(ctx context.Context, req *catalogv1.ListTerritoryAdminsRequest) (*catalogv1.ListTerritoryAdminsResponse, error) {
	bySlug, err := s.svc.ListTerritoryAdmins(ctx, req.GetSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	resp := &catalogv1.ListTerritoryAdminsResponse{}
	for slug, ids := range bySlug {
		for _, id := range ids {
			resp.Admins = append(resp.Admins, &catalogv1.TerritoryAdmin{TerritorySlug: slug, AdminUserId: id})
		}
	}
	return resp, nil
}
```

Run: `cd backend/services/catalog-service && go generate ./internal/service/ ./internal/transport/grpcapi/ && go test -race ./...`. Expected: `ok` for every package.

- [ ] **Step 5: Failing gateway client test.** Create `gateway-service/internal/clients/catalog/territory_admins_test.go`:

```go
// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

// adminsCC answers with pairs interleaved across territories, as a map walk on
// the catalog side may send them.
type adminsCC struct {
	catalogv1.CatalogServiceClient
	asked []string
}

func (a *adminsCC) ListTerritoryAdmins(
	_ context.Context, in *catalogv1.ListTerritoryAdminsRequest, _ ...grpc.CallOption,
) (*catalogv1.ListTerritoryAdminsResponse, error) {
	a.asked = in.GetSlugs()
	return &catalogv1.ListTerritoryAdminsResponse{Admins: []*catalogv1.TerritoryAdmin{
		{TerritorySlug: "a", AdminUserId: "u1"},
		{TerritorySlug: "b", AdminUserId: "u2"},
		{TerritorySlug: "a", AdminUserId: "u3"},
	}}, nil
}

type TerritoryAdminsSuite struct{ suite.Suite }

func TestTerritoryAdminsSuite(t *testing.T) { suite.Run(t, new(TerritoryAdminsSuite)) }

func (s *TerritoryAdminsSuite) TestPairsAreGroupedBySlugInOrder() {
	cc := &adminsCC{}
	got, err := (&Client{cc: cc}).ListTerritoryAdmins(s.T().Context(), []string{"a", "b", "c"})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), cc.asked, []string{"a", "b", "c"})
	assert.DeepEqual(s.T(), got, map[string][]string{"a": {"u1", "u3"}, "b": {"u2"}})
}
```

Run: `cd backend/services/gateway-service && go test -race -run TestTerritoryAdminsSuite ./internal/clients/catalog/`. Expected: FAIL to compile, `ListTerritoryAdmins undefined`.

- [ ] **Step 6: Gateway client.** Append to `clients/catalog/territory_admins.go`:

```go
// ListTerritoryAdmins returns the admin ids of each of slugs, grouped by slug.
// A slug nobody is assigned to is absent.
func (c *Client) ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error) {
	resp, err := c.cc.ListTerritoryAdmins(ctx, &catalogv1.ListTerritoryAdminsRequest{Slugs: slugs})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListTerritoryAdmins: %w", grpcerr.MapStatus(err, nil))
	}
	out := make(map[string][]string)
	for _, a := range resp.GetAdmins() {
		out[a.GetTerritorySlug()] = append(out[a.GetTerritorySlug()], a.GetAdminUserId())
	}
	return out, nil
}
```

Run the Step 5 command. Expected: PASS.

- [ ] **Step 7: Failing gateway service test.** Add `ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error)` under `GetTerritoryAdmins` in the `Catalog` interface (`service/gateway.go`). Run `cd backend/services/gateway-service && go generate ./internal/service/`. Create `service/territory_admins_test.go`:

```go
package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

type TerritoryAdminsSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	svc *service.Gateway
	ctx context.Context
}

func TestTerritoryAdminsSuite(t *testing.T) { suite.Run(t, new(TerritoryAdminsSuite)) }

func (s *TerritoryAdminsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.svc = service.New(s.cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc), mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
}

// The access screen reads a missing key as "not loaded", so a territory nobody
// is assigned to must answer [] rather than vanish.
func (s *TerritoryAdminsSuite) TestEveryVisibleTerritoryGetsAKey() {
	s.cat.ListTerritoriesMock.Expect(s.ctx, "admin-a").Return([]domain.Territory{{Slug: "a"}, {Slug: "b"}}, nil)
	s.cat.ListTerritoryAdminsMock.Expect(s.ctx, []string{"a", "b"}).Return(map[string][]string{"a": {"u1"}}, nil)

	got, err := s.svc.ListTerritoryAdmins(s.ctx, "admin-a")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, map[string][]string{"a": {"u1"}, "b": {}})
}

func (s *TerritoryAdminsSuite) TestACatalogFailureIsNotAnEmptyAnswer() {
	boom := errors.New("catalog down")
	s.cat.ListTerritoriesMock.Expect(s.ctx, "").Return(nil, boom)

	_, err := s.svc.ListTerritoryAdmins(s.ctx, "")
	assert.ErrorIs(s.T(), err, boom)
}
```

Run: `go test -race -run TestTerritoryAdminsSuite ./internal/service/`. Expected: FAIL to compile, `s.svc.ListTerritoryAdmins undefined`.

- [ ] **Step 8: Gateway service.** Append to `service/territory_admins.go`:

```go
// ListTerritoryAdmins returns the admin ids of every territory visible to
// scopeAdminID (empty = all), keyed by slug: the set GET /api/territories
// lists, resolved the same way. A territory nobody is assigned to maps to [],
// never to a missing key.
func (g *Gateway) ListTerritoryAdmins(ctx context.Context, scopeAdminID string) (map[string][]string, error) {
	territories, err := g.catalog.ListTerritories(ctx, scopeAdminID)
	if err != nil {
		return nil, err
	}
	slugs := make([]string, len(territories))
	for i, t := range territories {
		slugs[i] = t.Slug
	}
	assigned, err := g.catalog.ListTerritoryAdmins(ctx, slugs)
	if err != nil {
		return nil, err
	}
	out := make(map[string][]string, len(slugs))
	for _, slug := range slugs {
		out[slug] = append([]string{}, assigned[slug]...)
	}
	return out, nil
}
```

Run the Step 7 command. Expected: PASS.

- [ ] **Step 9: OpenAPI.** Add a schema after `TerritoryAdmins`:

```yaml
    TerritoryAdminsMap:
      type: object
      description: >
        Admin user ids per territory slug. Every territory the caller can see
        has a key; `[]` when nobody is assigned.
      additionalProperties:
        type: array
        items: { type: string }
```

Add a path after `/api/territories/{slug}/admins`:

```yaml
  /api/territory-admins:
    get:
      operationId: listTerritoryAdmins
      summary: Every visible territory's assigned admins in one call (Root only)
      description: >
        The batch form of GET /api/territories/{slug}/admins, with the same
        Root-only gate. Not /api/territories/admins: chi would shadow a
        territory whose slug is `admins`. It sits outside
        /api/territories/{slug}, so RequireTerritoryAccess does not cover it;
        the handler reads the territory set through the caller's scope, the
        rule GET /api/territories applies.
      tags: [territories]
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TerritoryAdminsMap' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '500': { $ref: '#/components/responses/Internal' }
```

Run: `make -C backend openapi-gen && (cd frontend && yarn openapi:generate)`. Expected: exit 0. `go build ./...` in gateway-service now fails because `*Server does not implement StrictServerInterface (missing method ListTerritoryAdmins)`, which is the next step's RED.

- [ ] **Step 10: Failing handler test.** Add `ListTerritoryAdmins(ctx context.Context, scopeAdminID string) (map[string][]string, error)` under `GetTerritoryAdmins` in `httpapi.Service` (`server.go`). Create `httpapi/territory_admins_test.go`:

```go
package httpapi

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

type TerritoryAdminsSuite struct{ suite.Suite }

func TestTerritoryAdminsSuite(t *testing.T) { suite.Run(t, new(TerritoryAdminsSuite)) }

// adminsStub records the scope it was asked for; anything else panics through
// the embedded nil Service.
type adminsStub struct {
	Service
	scope  *string
	bySlug map[string][]string
}

func (a adminsStub) ListTerritoryAdmins(_ context.Context, scope string) (map[string][]string, error) {
	*a.scope = scope
	return a.bySlug, nil
}

func (s *TerritoryAdminsSuite) TestRootReadsEveryTerritory() {
	scope := "unset"
	stub := adminsStub{scope: &scope, bySlug: map[string][]string{"tenant-a-scene": {"u1"}, "tenant-b-scene": {}}}
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")

	resp, err := New(stub).ListTerritoryAdmins(ctx, ListTerritoryAdminsRequestObject{})
	assert.NilError(s.T(), err)
	got, ok := resp.(ListTerritoryAdmins200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.DeepEqual(s.T(), map[string][]string(got), stub.bySlug)
	assert.Equal(s.T(), scope, "")
}

// A Company Owner is refused exactly as on the per-slug read: the batch must
// not become a way to learn another tenant's assignments.
func (s *TerritoryAdminsSuite) TestACompanyOwnerIsRefused() {
	scope := "unset"
	ctx := authhttp.NewTestContext(s.T().Context(), false, "admin-a")

	resp, err := New(adminsStub{scope: &scope}).ListTerritoryAdmins(ctx, ListTerritoryAdminsRequestObject{})
	assert.NilError(s.T(), err)
	_, ok := resp.(ListTerritoryAdmins403JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), scope, "unset", "the service must not be asked")
}
```

Run: `go test -race -run TestTerritoryAdminsSuite ./internal/transport/httpapi/`. Expected: FAIL to compile, `New(stub).ListTerritoryAdmins undefined`.

- [ ] **Step 11: Handler.** Append to `httpapi/territory_admins.go`:

```go
// ListTerritoryAdmins answers every visible territory's admins in one call.
// Root only, the same gate as GetTerritoryAdmins. The route is outside
// /api/territories/{slug}, so the territory gate never sees it; the set comes
// from the caller's scope, as on GET /api/territories.
func (s *Server) ListTerritoryAdmins(ctx context.Context, _ ListTerritoryAdminsRequestObject) (ListTerritoryAdminsResponseObject, error) {
	if !authhttp.IsOwner(ctx) {
		return ListTerritoryAdmins403JSONResponse{ForbiddenJSONResponse: forbiddenRoot()}, nil
	}
	scopeAdminID, _ := authhttp.Scope(ctx)
	bySlug, err := s.svc.ListTerritoryAdmins(ctx, scopeAdminID)
	if err != nil {
		return ListTerritoryAdmins500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return ListTerritoryAdmins200JSONResponse(bySlug), nil
}
```

Run the Step 10 command, then `go test -race ./...` in gateway-service. Expected: all `ok`. `TestSpecCoverageSuite` also passes because the path is in the spec.

- [ ] **Step 12: Docs.** Root `CLAUDE.md` endpoint list, after the `/api/territories/{slug}/…` bullets: ``- `GET /api/territory-admins` — `{slug: userId[]}` for every visible territory (`[]` when unassigned), Root only like `…/{slug}/admins`. Outside `/api/territories/{slug}` on purpose (chi would shadow a territory called `admins`), so `RequireTerritoryAccess` does not cover it: the handler gates on Root and reads the set through the caller's scope.``

- [ ] **Step 13: Gate + tenant check.** Run the `make check` gate and the `TestBatchSuite` integration command from D2 Step 12. Both must exit 0. On the two-tenant fixture (compose rebuilt):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $COTEST" localhost:8080/api/territory-admins   # 403
curl -s -H "Authorization: Bearer $ROOT" localhost:8080/api/territory-admins | jq 'keys'                          # contains tenant-a-scene and tenant-b-scene
```

- [ ] **Step 14: Commit.**

```bash
git add backend/proto/rosneft/catalog/v1/catalog.proto backend/proto/gen/go/rosneft/catalog/v1/catalog.pb.go \
  backend/proto/gen/go/rosneft/catalog/v1/catalog_grpc.pb.go \
  backend/services/catalog-service/internal/storage/list_territory_admins.go \
  backend/services/catalog-service/internal/storage/batch_integration_test.go \
  backend/services/catalog-service/internal/service/catalog.go \
  backend/services/catalog-service/internal/service/list_territory_admins.go \
  backend/services/catalog-service/internal/service/mocks/repository_mock.go \
  backend/services/catalog-service/internal/transport/grpcapi/server.go \
  backend/services/catalog-service/internal/transport/grpcapi/list_territory_admins.go \
  backend/services/catalog-service/internal/transport/grpcapi/mocks/service_mock.go \
  backend/services/gateway-service/internal/clients/catalog/territory_admins.go \
  backend/services/gateway-service/internal/clients/catalog/territory_admins_test.go \
  backend/services/gateway-service/internal/service/gateway.go \
  backend/services/gateway-service/internal/service/territory_admins.go \
  backend/services/gateway-service/internal/service/territory_admins_test.go \
  backend/services/gateway-service/internal/service/mocks/catalog_mock.go \
  backend/services/gateway-service/internal/transport/httpapi/server.go \
  backend/services/gateway-service/internal/transport/httpapi/territory_admins.go \
  backend/services/gateway-service/internal/transport/httpapi/territory_admins_test.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go \
  backend/services/gateway-service/api/openapi.yaml frontend/src/shared/api/dto.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(catalog,gateway): every territory's admins in one call

GET /api/territory-admins answers {slug: userIds} for the caller's visible
territories from one ANY($1) query. Root only, like the per-slug read it
replaces on the access screen.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task D3b-be: several metric panels per request

**Skills to load:** `ponytail:ponytail`, `clean-code`, `superpowers:test-driven-development`, `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to` (+ `golang-testing`, `golang-concurrency`, `golang-context`, `golang-security`).

**Design:** `metrics.Client.QueryPanels` validates **every** panel id and the range before any network call, so no free-form input reaches Prometheus. It then runs `Query` per distinct id, at most four at a time (`sync.WaitGroup.Go` + a semaphore channel). A panel whose query failed is **left out of the map** (one dark card, as today); the answer is 502 only when every panel failed. (Resolved against the frontend contract: an errgroup would cancel the healthy panels on the first failure.) The handler reads repeated `panel` values. The Prometheus client is created once (`InitPrometheus`) so D4 can share it.

**Deploy note:** the response shape changes from array to object. The SPA's `metrics-gateway.ts` breaks until the frontend D3b task lands, so ship them in the same deploy.

**Files:**
- Create: `backend/services/gateway-service/internal/metrics/query_panels.go`, `…/metrics/query_panels_test.go`
- Modify: `backend/services/gateway-service/internal/bootstrap/metrics.go`, `…/bootstrap/serve.go`
- Create: `backend/services/gateway-service/internal/bootstrap/metrics_test.go`
- Modify: `backend/services/gateway-service/api/openapi.yaml`; regenerate `openapi_spec_gen.go` (and `openapi_gen.go` if it changes), `frontend/src/shared/api/dto.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `func (c *metrics.Client) QueryPanels(ctx context.Context, ids []string, rng string) (map[string][]metrics.Series, error)`. Errors are `ErrUnknownPanel` (also for an empty `ids`), `ErrBadRange`, or — only when **every** panel failed — the joined upstream errors. A failed panel is otherwise absent from the map.
- Produces: `func InitPrometheus(cfg config.Config) *metrics.Client` and `func InitMetricsHandler(client *metrics.Client, logger *slog.Logger) http.Handler`. **D4 uses `InitPrometheus`'s client.**

- [ ] **Step 1: Failing client tests.** Create `internal/metrics/query_panels_test.go`. It adds methods to the existing `QuerySuite` and reuses its `serving` helper:

```go
package metrics

import (
	"maps"
	"net/http"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	"gotest.tools/v3/assert"
)

const emptyVector = `{"status":"success","data":{"resultType":"vector","result":[]}}`

func (s *QuerySuite) TestQueryPanelsAnswersEachDistinctPanelOnce() {
	var asked atomic.Int32
	c := s.serving(func(w http.ResponseWriter, _ *http.Request) {
		asked.Add(1)
		_, _ = w.Write([]byte(emptyVector))
	})

	got, err := c.QueryPanels(s.T().Context(), []string{"stat-up", "alerts", "stat-up"}, "1h")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(got)), []string{"alerts", "stat-up"})
	assert.Equal(s.T(), asked.Load(), int32(2))
	assert.Assert(s.T(), got["alerts"] != nil, "an empty panel is [], never null")
}

// Validation is all-or-nothing and happens before the first request: one bad
// id must not leave Prometheus half-asked.
func (s *QuerySuite) TestQueryPanelsRefusesAnUnknownPanelBeforeAsking() {
	var asked atomic.Int32
	c := s.serving(func(http.ResponseWriter, *http.Request) { asked.Add(1) })

	_, err := c.QueryPanels(s.T().Context(), []string{"stat-up", "no-such-panel"}, "1h")
	assert.ErrorIs(s.T(), err, ErrUnknownPanel)
	_, err = c.QueryPanels(s.T().Context(), nil, "1h")
	assert.ErrorIs(s.T(), err, ErrUnknownPanel)
	_, err = c.QueryPanels(s.T().Context(), []string{"stat-up"}, "99y")
	assert.ErrorIs(s.T(), err, ErrBadRange)
	assert.Equal(s.T(), asked.Load(), int32(0))
}

func (s *QuerySuite) TestQueryPanelsRunsAtMostFourAtOnce() {
	var inFlight, peak atomic.Int32
	c := s.serving(func(w http.ResponseWriter, _ *http.Request) {
		n := inFlight.Add(1)
		for p := peak.Load(); n > p && !peak.CompareAndSwap(p, n); p = peak.Load() {
		}
		time.Sleep(20 * time.Millisecond)
		inFlight.Add(-1)
		_, _ = w.Write([]byte(emptyVector))
	})

	_, err := c.QueryPanels(s.T().Context(), slices.Collect(maps.Keys(panels)), "1h")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), peak.Load() <= maxParallelPanels, "peak %d", peak.Load())
	assert.Assert(s.T(), peak.Load() > 1, "the panels ran one at a time")
}

// One broken panel is one dark card, not a dark page: it is left out of the
// map and the rest still answer.
func (s *QuerySuite) TestQueryPanelsLeavesOutAFailedPanel() {
	c := s.serving(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Query().Get("query"), "ALERTS") {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(emptyVector))
	})

	got, err := c.QueryPanels(s.T().Context(), []string{"stat-up", "alerts"}, "1h")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(got)), []string{"stat-up"})
}

func (s *QuerySuite) TestQueryPanelsFailsOnlyWhenEveryPanelFails() {
	c := s.serving(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})

	_, err := c.QueryPanels(s.T().Context(), []string{"stat-up", "alerts"}, "1h")
	assert.ErrorContains(s.T(), err, "502")
}
```

Run: `cd backend/services/gateway-service && go test -race -run TestQuerySuite ./internal/metrics/`. Expected: FAIL to compile, `c.QueryPanels undefined` / `undefined: maxParallelPanels`.

- [ ] **Step 2: Implementation.** Create `internal/metrics/query_panels.go`:

```go
package metrics

import (
	"context"
	"errors"
	"slices"
	"sync"
)

// maxParallelPanels caps the Prometheus queries one page load runs at once.
const maxParallelPanels = 4

// QueryPanels runs Query for every distinct panel id over one range, at most
// maxParallelPanels at a time. Every id and the range are checked before the
// first request, so one bad id never leaves Prometheus half-asked. A panel
// whose query failed is left out of the map — one dark card, as when each
// panel was its own request; only when every panel failed is it an error.
func (c *Client) QueryPanels(ctx context.Context, ids []string, rng string) (map[string][]Series, error) {
	ids = slices.Compact(slices.Sorted(slices.Values(ids)))
	if len(ids) == 0 {
		return nil, ErrUnknownPanel
	}
	for _, id := range ids {
		if _, ok := lookup(id); !ok {
			return nil, ErrUnknownPanel
		}
	}
	if _, ok := rangeSeconds[rng]; !ok {
		return nil, ErrBadRange
	}

	results := make([][]Series, len(ids))
	errs := make([]error, len(ids))
	sem := make(chan struct{}, maxParallelPanels)
	var wg sync.WaitGroup
	for i, id := range ids {
		wg.Go(func() {
			sem <- struct{}{}
			defer func() { <-sem }()
			results[i], errs[i] = c.Query(ctx, id, rng)
		})
	}
	wg.Wait()

	out := make(map[string][]Series, len(ids))
	for i, id := range ids {
		if errs[i] == nil {
			out[id] = results[i]
		}
	}
	if len(out) == 0 {
		return nil, errors.Join(errs...)
	}
	return out, nil
}
```

Run the Step 1 command. Expected: PASS (all `QuerySuite` tests).

- [ ] **Step 3: Failing handler test.** Create `internal/bootstrap/metrics_test.go`:

```go
package bootstrap

import (
	"encoding/json/v2"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/metrics"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// MetricsHandlerSuite drives /api/metrics/query against a Prometheus stand-in.
type MetricsHandlerSuite struct{ suite.Suite }

func TestMetricsHandlerSuite(t *testing.T) { suite.Run(t, new(MetricsHandlerSuite)) }

func (s *MetricsHandlerSuite) handler(prom http.HandlerFunc) http.Handler {
	srv := httptest.NewServer(prom)
	s.T().Cleanup(srv.Close)
	return InitMetricsHandler(metrics.NewClient(srv.URL), slog.New(slog.DiscardHandler))
}

func (s *MetricsHandlerSuite) get(h http.Handler, owner bool, query string) *httptest.ResponseRecorder {
	ctx := authhttp.NewTestContext(s.T().Context(), owner, "")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/metrics/query?"+query, nil))
	return rec
}

func emptyPromVector(w http.ResponseWriter, _ *http.Request) {
	_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[]}}`))
}

func (s *MetricsHandlerSuite) TestAnswersEveryPanelUnderItsID() {
	rec := s.get(s.handler(emptyPromVector), true, "panel=stat-up&panel=alerts&range=1h")

	assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
	assert.Equal(s.T(), rec.Header().Get("Cache-Control"), "no-store")
	var body map[string][]metrics.Series
	assert.NilError(s.T(), json.Unmarshal(rec.Body.Bytes(), &body))
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(body)), []string{"alerts", "stat-up"})
}

func (s *MetricsHandlerSuite) TestRefusesWhatTheRegistryDoesNotKnow() {
	h := s.handler(emptyPromVector)
	for _, q := range []string{"range=1h", "panel=stat-up&panel=nope&range=1h", "panel=stat-up&range=99y"} {
		assert.Equal(s.T(), s.get(h, true, q).Code, http.StatusBadRequest, q)
	}
}

func (s *MetricsHandlerSuite) TestANonOwnerIsRefused() {
	rec := s.get(s.handler(emptyPromVector), false, "panel=stat-up&range=1h")
	assert.Equal(s.T(), rec.Code, http.StatusForbidden)
}

func (s *MetricsHandlerSuite) TestAnUpstreamFailureIsABadGateway() {
	rec := s.get(s.handler(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}), true, "panel=stat-up&range=1h")
	assert.Equal(s.T(), rec.Code, http.StatusBadGateway)
}
```

Run: `go test -race -run TestMetricsHandlerSuite ./internal/bootstrap/`. Expected: FAIL to compile, `cannot use metrics.NewClient(srv.URL) … as config.Config value`.

- [ ] **Step 4: Handler + wiring.** In `bootstrap/metrics.go`, replace `InitMetricsHandler` with:

```go
// InitPrometheus builds the one Prometheus client the metrics proxy and the
// console summary's alerts card share.
func InitPrometheus(cfg config.Config) *metrics.Client {
	return metrics.NewClient(cfg.PrometheusURL)
}

// InitMetricsHandler builds the owner-only Prometheus proxy behind
// /api/metrics/query: a plain http.Handler on the root router (wrapped with
// Authenticate for the owner check), outside the openapi strict handlers. The
// client sends panel IDs plus one range; the metrics client resolves each ID to
// server-side PromQL, so no query reaches Prometheus as free-form input.
func InitMetricsHandler(client *metrics.Client, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authhttp.IsOwner(r.Context()) {
			apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden, "root only")
			return
		}

		q := r.URL.Query()
		series, err := client.QueryPanels(r.Context(), q["panel"], q.Get("range"))
		switch {
		case errors.Is(err, metrics.ErrUnknownPanel) || errors.Is(err, metrics.ErrBadRange):
			apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, "unknown panel or range")
			return
		case err != nil:
			// Log the upstream detail once; return a generic error so Prometheus
			// internals never leak to the browser.
			logger.Warn("metrics: prometheus query failed", "panels", q["panel"], "err", err)
			apperr.Write(w, http.StatusBadGateway, apperr.SlugInternal, "metric upstream unavailable")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.NewEncoder(w).Encode(series); err != nil {
			logger.Warn("metrics: encode response failed", "err", err)
		}
	})
}
```

Drop the now-unused `config` import only if nothing else uses it (`InitPrometheus` still does). In `bootstrap/serve.go`, replace `metricsHandler := InitMetricsHandler(cfg, logger)` with:

```go
	prom := InitPrometheus(cfg)
	metricsHandler := InitMetricsHandler(prom, logger)
```

Run the Step 3 command, then `go test -race ./...` in gateway-service. Expected: all `ok`.

- [ ] **Step 5: OpenAPI.** In `/api/metrics/query`, replace the `panel` parameter:

```yaml
        - in: query
          name: panel
          required: true
          style: form
          explode: true
          description: >
            One or more panel IDs, repeated (`?panel=a&panel=b`); repeats collapse
            to one key. Every ID is checked before any query runs. Instant panels
            return one point per series; the rest are range queries of roughly
            200 points.
          schema:
            type: array
            minItems: 1
            items:
              type: string
              enum:
                [stat-up, stat-rps, stat-errors, stat-p99, stat-queue, services-up,
                 red-rate, red-errors, red-latency, red-http,
                 domain-conversions, domain-conversion-p95, domain-queue,
                 domain-upload, domain-auth, domain-twofa,
                 runtime-memory, runtime-goroutines, runtime-gc, runtime-fds,
                 alerts]
```

Replace the `'200'` response:

```yaml
        '200':
          description: >
            The series of every requested panel, keyed by panel ID. Panels run in
            parallel, at most four at a time; a panel whose query failed is
            absent from the map, and the answer is 502 only when every panel failed.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MetricsPanels' }
```

and add the schema after `MetricSeries`:

```yaml
    MetricsPanels:
      type: object
      description: Series per requested panel ID; a panel whose query failed is absent.
      additionalProperties:
        type: array
        items: { $ref: '#/components/schemas/MetricSeries' }
```

Change `summary` to `Owner-only Prometheus query for one or more panels`. Run: `make -C backend openapi-gen && (cd frontend && yarn openapi:generate)`. Expected: exit 0.

- [ ] **Step 6: Docs.** Root `CLAUDE.md` endpoint list: ``- `GET /api/metrics/query?panel=a&panel=b&range=1h` — owner only; `{panel: MetricSeries[]}`, four Prometheus queries at a time. Every id is validated before the first query, a failed panel is absent from the map, 502 only when all failed.``

- [ ] **Step 7: Gate.** Run `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check`. Expected: exit 0.

- [ ] **Step 8: Commit.**

```bash
git add backend/services/gateway-service/internal/metrics/query_panels.go \
  backend/services/gateway-service/internal/metrics/query_panels_test.go \
  backend/services/gateway-service/internal/bootstrap/metrics.go \
  backend/services/gateway-service/internal/bootstrap/metrics_test.go \
  backend/services/gateway-service/internal/bootstrap/serve.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go \
  backend/services/gateway-service/api/openapi.yaml frontend/src/shared/api/dto.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(gateway): metrics query answers several panels at once

/api/metrics/query takes repeated panel and returns {panel: series}. Every
id is checked first, then Prometheus is asked four at a time. The metrics
page goes from 19 requests per tick to one.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task D3c-be: `POST /api/territories/{slug}/placements/batch`

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to` (+ `golang-testing`, `golang-database`, `golang-security`, `golang-grpc`, `golang-error-handling`).

**Design:** New catalog RPC `CreatePlacements{territory_slug, items: CreatePlacementRequest[]}`. Every item is **pinned to the request's slug**, the one `RequireTerritoryAccess` checked, whatever the item carries. The single-create validation is extracted into `preparePlacement` in both services and shared. Catalog checks the union of all items' panorama ids against the territory once, instead of once per item. Storage extracts `insertPlacement(tx)` from `CreatePlacement` and loops it inside one `audittx.Run`, so the batch lands whole or not at all.

**Files:**
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto`; regenerate both catalog pb files
- Modify: `backend/services/catalog-service/internal/storage/create_placement.go`; create `…/storage/create_placements.go`
- Modify: `backend/services/catalog-service/internal/service/create_placement.go`; create `…/service/create_placements.go`
- Modify: `backend/services/catalog-service/internal/service/catalog.go`, `…/service/placements_test.go`; regenerate `…/service/mocks/repository_mock.go`
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/create_placement.go`, `…/grpcapi/converters.go`, `…/grpcapi/server.go`; create `…/grpcapi/create_placements.go`; regenerate `…/grpcapi/mocks/service_mock.go`
- Modify: `backend/services/catalog-service/internal/storage/batch_integration_test.go`
- Modify: `backend/services/gateway-service/internal/clients/catalog/placements.go`; create `…/clients/catalog/placements_test.go`
- Modify: `backend/services/gateway-service/internal/service/gateway.go`, `…/service/placements.go`, `…/service/placements_test.go`; create `…/service/create_placements.go`; regenerate `…/service/mocks/catalog_mock.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/server.go`, `…/httpapi/placements.go`, `…/httpapi/placement_converter.go`; create `…/httpapi/placements_test.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/route_permissions.go`, `…/authhttp/route_permissions_test.go`
- Modify: `backend/services/gateway-service/api/openapi.yaml`; regenerate `openapi_gen.go`, `openapi_spec_gen.go`, `frontend/src/shared/api/dto.ts`
- Modify: `CLAUDE.md`, `backend/CLAUDE.md` (Placements endpoint block)

**Interfaces:**
- Produces (catalog Repository): `CreatePlacements(ctx context.Context, ps []domain.Placement) ([]domain.Placement, error)` (each item carries its territory)
- Produces (catalog service/grpcapi Service): `CreatePlacements(ctx context.Context, territorySlug string, items []domain.Placement) ([]domain.Placement, error)`
- Produces (gateway `service.Catalog`, client): `CreatePlacements(ctx context.Context, territorySlug string, ps []domain.Placement) ([]domain.Placement, error)`
- Produces (gateway `httpapi.Service`, `*service.Gateway`): `CreatePlacements(ctx context.Context, territorySlug string, items []domain.Placement) ([]domain.Placement, error)`
- Produces (JSON): as in the contract table.

- [ ] **Step 1: Proto.** Add under `rpc CreatePlacement(…)`:

```proto
  // CreatePlacements lands 1–100 placements on one territory in one
  // transaction: all of them, or none.
  rpc CreatePlacements(CreatePlacementsRequest) returns (CreatePlacementsResponse);
```

Add after `message CreatePlacementResponse`:

```proto
message CreatePlacementsRequest {
  string territory_slug = 1;
  // 1–100. Each item's own territory_slug is ignored: the batch lands on the
  // territory above, the one the gateway's territory gate checked.
  repeated CreatePlacementRequest items = 2;
}
message CreatePlacementsResponse {
  repeated Placement placements = 1; // in items order
}
```

Run: `make -C backend proto-gen`. Expected: exit 0.

- [ ] **Step 2: Failing storage test.** Append to `batch_integration_test.go`:

```go
func (s *BatchSuite) TestAPlacementBatchLandsWholeOrNotAtAll() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "batch-yard", s.admin)
	s.seedModel(ctx, "batch-pump")
	unit := domain.Vec3{X: 1, Y: 1, Z: 1}

	got, err := s.pg.CreatePlacements(ctx, []domain.Placement{
		{TerritorySlug: "batch-yard", ModelSlug: "batch-pump", Scale: unit},
		{TerritorySlug: "batch-yard", ModelSlug: "batch-pump", Position: domain.Vec3{X: 2}, Scale: unit},
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[1].Position.X, 2.0)
	assert.Equal(s.T(), got[0].TerritorySlug, "batch-yard")
	assert.Assert(s.T(), got[0].ID < got[1].ID, "answered in items order")

	_, err = s.pg.CreatePlacements(ctx, []domain.Placement{
		{TerritorySlug: "batch-yard", ModelSlug: "batch-pump", Scale: unit},
		{TerritorySlug: "batch-yard", ModelSlug: "no-such-model", Scale: unit},
	})
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
	listed, err := s.pg.ListPlacements(ctx, "batch-yard")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(listed), 2, "the refused batch must leave its first item behind nowhere")
}
```

Run: `cd backend/services/catalog-service && GOWORK=off go test -race -tags=integration -run TestBatchSuite ./internal/storage/`. Expected: FAIL to compile, `s.pg.CreatePlacements undefined`.

- [ ] **Step 3: Storage.** In `storage/create_placement.go`, lift the query into a package const named `createPlacementQuery` (same SQL text). Replace the method body and add two helpers:

```go
func (r *PG) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	var out domain.Placement
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var err error
		out, err = insertPlacement(ctx, tx, p)
		return err
	})
	if err != nil {
		return domain.Placement{}, createPlacementError("storage.CreatePlacement", err)
	}
	return out, nil
}

// insertPlacement runs createPlacementQuery for one placement inside tx.
func insertPlacement(ctx context.Context, tx pgx.Tx, p domain.Placement) (domain.Placement, error) {
	return scanPlacement(tx.QueryRow(ctx, createPlacementQuery,
		p.TerritorySlug, p.ModelSlug,
		p.Position.X, p.Position.Y, p.Position.Z,
		p.Rotation.X, p.Rotation.Y, p.Rotation.Z,
		p.Scale.X, p.Scale.Y, p.Scale.Z,
		p.Label, p.VisiblePanoramaIDs,
	))
}

// createPlacementError maps an insert failure onto the domain. No row means one
// side of the territory/model WHERE did not match; the not-found signal is
// enough for transport to answer 404.
func createPlacementError(op string, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrTerritoryNotFound
	}
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == "23514" && pgErr.ConstraintName == "placements_scale_positive" {
		return fmt.Errorf("%s: %w: scale must be positive", op, domain.ErrInvalidInput)
	}
	return fmt.Errorf("%s: %w", op, err)
}
```

Create `storage/create_placements.go`:

```go
package storage

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreatePlacements inserts every placement in one audited transaction and
// answers them in input order. Any failing item rolls the whole batch back, so
// a refused batch leaves nothing behind.
//
// ponytail: one statement per item inside the transaction; a pgx.Batch would
// save round trips if batches ever approach the 100 cap in practice.
func (r *PG) CreatePlacements(ctx context.Context, ps []domain.Placement) ([]domain.Placement, error) {
	out := make([]domain.Placement, 0, len(ps))
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		for _, p := range ps {
			created, err := insertPlacement(ctx, tx, p)
			if err != nil {
				return err
			}
			out = append(out, created)
		}
		return nil
	})
	if err != nil {
		return nil, createPlacementError("storage.CreatePlacements", err)
	}
	return out, nil
}
```

Run the Step 2 command. Expected: PASS.

- [ ] **Step 4: Failing catalog service tests.** Add `CreatePlacements(ctx context.Context, ps []domain.Placement) ([]domain.Placement, error)` under `CreatePlacement` in `Repository`. Add `CreatePlacements(ctx context.Context, territorySlug string, items []domain.Placement) ([]domain.Placement, error)` under `CreatePlacement` in grpcapi `Service`. Run `cd backend/services/catalog-service && go generate ./internal/service/ ./internal/transport/grpcapi/`. Append to `service/placements_test.go`:

```go
// Every item lands on the batch's territory, whatever it carried: the gateway
// gate checked that territory and no other.
func (s *PlacementsSuite) TestCreateBatchPinsEveryItemToTheTerritory() {
	stray := validPlacement()
	stray.TerritorySlug = "someone-elses"
	stray.Scale = domain.Vec3{}
	want := []domain.Placement{validPlacement(), validPlacement()}
	s.repo.CreatePlacementsMock.Expect(s.ctx, want).Return(want, nil)

	out, err := s.svc.CreatePlacements(s.ctx, "t1", []domain.Placement{stray, validPlacement()})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
}

func (s *PlacementsSuite) TestCreateBatchRejectsAnEmptyOrOversizedBatch() {
	_, err := s.svc.CreatePlacements(s.ctx, "t1", nil)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, err = s.svc.CreatePlacements(s.ctx, "t1", make([]domain.Placement, 101))
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateBatchRejectsABadItem() {
	bad := validPlacement()
	bad.Scale = domain.Vec3{X: 2, Y: 0, Z: 0}
	_, err := s.svc.CreatePlacements(s.ctx, "t1", []domain.Placement{validPlacement(), bad})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

// One allowlist lookup for the whole batch, not one per item.
func (s *PlacementsSuite) TestCreateBatchChecksPanoramasOnce() {
	a, b := validPlacement(), validPlacement()
	a.VisiblePanoramaIDs, b.VisiblePanoramaIDs = []int64{1}, []int64{2}
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Times(1).Return([]int64{1, 2}, nil)
	s.repo.CreatePlacementsMock.Expect(s.ctx, []domain.Placement{a, b}).Return([]domain.Placement{a, b}, nil)

	_, err := s.svc.CreatePlacements(s.ctx, "t1", []domain.Placement{a, b})
	assert.NilError(s.T(), err)
}

func (s *PlacementsSuite) TestCreateBatchRejectsAPanoramaOfAnotherTerritory() {
	a := validPlacement()
	a.VisiblePanoramaIDs = []int64{9}
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Return([]int64{1}, nil)

	_, err := s.svc.CreatePlacements(s.ctx, "t1", []domain.Placement{a})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
```

Run: `go test -race -run TestPlacementsSuite ./internal/service/`. Expected: FAIL to compile, `s.svc.CreatePlacements undefined`.

- [ ] **Step 5: Catalog service.** In `service/create_placement.go`, replace `CreatePlacement` with the version below and add `preparePlacement` (keep `defaultScale`):

```go
func (c *Catalog) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	p, err := preparePlacement(p)
	if err != nil {
		return domain.Placement{}, fmt.Errorf("service.CreatePlacement: %w", err)
	}
	if len(p.VisiblePanoramaIDs) > 0 {
		if err := c.requirePanoramasOnTerritory(ctx, p.TerritorySlug, p.VisiblePanoramaIDs); err != nil {
			return domain.Placement{}, fmt.Errorf("service.CreatePlacement: %w", err)
		}
	}
	return c.repo.CreatePlacement(ctx, p)
}

// preparePlacement checks the slugs, fills the default scale and rejects a
// non-positive one: the checks a single create and every batch item share.
func preparePlacement(p domain.Placement) (domain.Placement, error) {
	if p.TerritorySlug == "" || p.ModelSlug == "" {
		return domain.Placement{}, fmt.Errorf("%w: territory_slug and model_slug are required", domain.ErrInvalidInput)
	}
	p.Scale = defaultScale(p.Scale)
	if p.Scale.X <= 0 || p.Scale.Y <= 0 || p.Scale.Z <= 0 {
		return domain.Placement{}, fmt.Errorf("%w: scale components must be positive", domain.ErrInvalidInput)
	}
	return p, nil
}
```

Create `service/create_placements.go`:

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// maxPlacementBatch bounds one batch: the editor lays copies out in a row, and
// a hundred is more than one drop ever places.
const maxPlacementBatch = 100

// CreatePlacements lands 1–100 placements on territorySlug in one transaction.
// Each item is pinned to territorySlug; the panorama allowlists are checked
// against the territory once for the whole batch.
func (c *Catalog) CreatePlacements(ctx context.Context, territorySlug string, items []domain.Placement) ([]domain.Placement, error) {
	if len(items) == 0 || len(items) > maxPlacementBatch {
		return nil, fmt.Errorf("service.CreatePlacements: %w: a batch holds 1 to %d placements, got %d",
			domain.ErrInvalidInput, maxPlacementBatch, len(items))
	}
	prepared := make([]domain.Placement, len(items))
	var panoramaIDs []int64
	for i, p := range items {
		p.TerritorySlug = territorySlug
		ready, err := preparePlacement(p)
		if err != nil {
			return nil, fmt.Errorf("service.CreatePlacements: item %d: %w", i, err)
		}
		prepared[i] = ready
		panoramaIDs = append(panoramaIDs, ready.VisiblePanoramaIDs...)
	}
	if len(panoramaIDs) > 0 {
		if err := c.requirePanoramasOnTerritory(ctx, territorySlug, panoramaIDs); err != nil {
			return nil, fmt.Errorf("service.CreatePlacements: %w", err)
		}
	}
	return c.repo.CreatePlacements(ctx, prepared)
}
```

Run the Step 4 command. Expected: PASS, including the older `TestCreate*` tests.

- [ ] **Step 6: Catalog transport.** Add to `grpcapi/converters.go`:

```go
// placementFromCreateRequest maps one create request (alone, or an item of a
// batch) onto a domain placement.
func placementFromCreateRequest(req *catalogv1.CreatePlacementRequest) domain.Placement {
	return domain.Placement{
		TerritorySlug:      req.GetTerritorySlug(),
		ModelSlug:          req.GetModelSlug(),
		Position:           vec3FromProto(req.GetPosition()),
		Rotation:           vec3FromProto(req.GetRotation()),
		Scale:              vec3FromProto(req.GetScale()),
		Label:              req.GetLabel(),
		VisiblePanoramaIDs: req.GetVisiblePanoramaIds(),
	}
}
```

In `grpcapi/create_placement.go`, replace the literal with `s.svc.CreatePlacement(ctx, placementFromCreateRequest(req))` and drop the `domain` import. Create `grpcapi/create_placements.go`:

```go
package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) CreatePlacements(ctx context.Context, req *catalogv1.CreatePlacementsRequest) (*catalogv1.CreatePlacementsResponse, error) {
	items := make([]domain.Placement, len(req.GetItems()))
	for i, it := range req.GetItems() {
		items[i] = placementFromCreateRequest(it)
	}
	out, err := s.svc.CreatePlacements(ctx, req.GetTerritorySlug(), items)
	if err != nil {
		return nil, mapError(err)
	}
	resp := &catalogv1.CreatePlacementsResponse{Placements: make([]*catalogv1.Placement, len(out))}
	for i, p := range out {
		resp.Placements[i] = placementToProto(p)
	}
	return resp, nil
}
```

Run: `cd backend/services/catalog-service && go test -race ./...`. Expected: all `ok`.

- [ ] **Step 7: Failing gateway client test.** Create `gateway-service/internal/clients/catalog/placements_test.go`:

```go
// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type placementBatchCC struct {
	catalogv1.CatalogServiceClient
	got *catalogv1.CreatePlacementsRequest
}

func (p *placementBatchCC) CreatePlacements(
	_ context.Context, in *catalogv1.CreatePlacementsRequest, _ ...grpc.CallOption,
) (*catalogv1.CreatePlacementsResponse, error) {
	p.got = in
	out := make([]*catalogv1.Placement, len(in.GetItems()))
	for i, it := range in.GetItems() {
		out[i] = &catalogv1.Placement{Id: int64(i + 1), TerritorySlug: in.GetTerritorySlug(), ModelSlug: it.GetModelSlug()}
	}
	return &catalogv1.CreatePlacementsResponse{Placements: out}, nil
}

type PlacementBatchSuite struct{ suite.Suite }

func TestPlacementBatchSuite(t *testing.T) { suite.Run(t, new(PlacementBatchSuite)) }

func (s *PlacementBatchSuite) TestTheBatchTravelsUnderItsTerritory() {
	cc := &placementBatchCC{}
	got, err := (&Client{cc: cc}).CreatePlacements(s.T().Context(), "yard", []domain.Placement{
		{ModelSlug: "pump", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}},
		{ModelSlug: "tank", Position: domain.Vec3{X: 2}, Scale: domain.Vec3{X: 1, Y: 1, Z: 1}},
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.got.GetTerritorySlug(), "yard")
	assert.Equal(s.T(), cc.got.GetItems()[1].GetPosition().GetX(), 2.0)
	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[1].ModelSlug, "tank")
}
```

Run: `cd backend/services/gateway-service && go test -race -run TestPlacementBatchSuite ./internal/clients/catalog/`. Expected: FAIL to compile, `CreatePlacements undefined`.

- [ ] **Step 8: Gateway client.** In `clients/catalog/placements.go`, extract the request literal:

```go
// createPlacementRequest maps a domain placement onto one create request.
func createPlacementRequest(p domain.Placement) *catalogv1.CreatePlacementRequest {
	return &catalogv1.CreatePlacementRequest{
		TerritorySlug:      p.TerritorySlug,
		ModelSlug:          p.ModelSlug,
		Position:           vec3ToProto(p.Position),
		Rotation:           vec3ToProto(p.Rotation),
		Scale:              vec3ToProto(p.Scale),
		Label:              p.Label,
		VisiblePanoramaIds: p.VisiblePanoramaIDs,
	}
}
```

Make `CreatePlacement` call `c.cc.CreatePlacement(ctx, createPlacementRequest(p))`, then add:

```go
// CreatePlacements lands a batch on territorySlug in one catalog transaction.
func (c *Client) CreatePlacements(ctx context.Context, territorySlug string, ps []domain.Placement) ([]domain.Placement, error) {
	items := make([]*catalogv1.CreatePlacementRequest, len(ps))
	for i, p := range ps {
		items[i] = createPlacementRequest(p)
	}
	resp, err := c.cc.CreatePlacements(ctx, &catalogv1.CreatePlacementsRequest{TerritorySlug: territorySlug, Items: items})
	if err != nil {
		return nil, fmt.Errorf("catalog.CreatePlacements: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.Placement, len(resp.GetPlacements()))
	for i, p := range resp.GetPlacements() {
		out[i] = placementFromProto(p)
	}
	return out, nil
}
```

Run the Step 7 command. Expected: PASS.

- [ ] **Step 9: Failing gateway service tests.** Add `CreatePlacements(ctx context.Context, territorySlug string, ps []domain.Placement) ([]domain.Placement, error)` under `CreatePlacement` in `service.Catalog` (`gateway.go`). Run `go generate ./internal/service/`. Append to `service/placements_test.go`:

```go
func (s *PlacementsSuite) TestCreateBatchPinsEveryItemToTheRouteTerritory() {
	stray := validPlacement()
	stray.TerritorySlug = "someone-elses"
	want := []domain.Placement{validPlacement()}
	s.cat.CreatePlacementsMock.Expect(s.ctx, "t1", want).Return(want, nil)

	out, err := s.svc.CreatePlacements(s.ctx, "t1", []domain.Placement{stray})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 1)
}

func (s *PlacementsSuite) TestCreateBatchIsBoundedBeforeTheCatalogIsAsked() {
	_, err := s.svc.CreatePlacements(s.ctx, "t1", nil)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, err = s.svc.CreatePlacements(s.ctx, "t1", make([]domain.Placement, 101))
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateBatchRejectsAnItemWithoutAModel() {
	bad := validPlacement()
	bad.ModelSlug = ""
	_, err := s.svc.CreatePlacements(s.ctx, "t1", []domain.Placement{bad})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
```

Run: `go test -race -run TestPlacementsSuite ./internal/service/`. Expected: FAIL to compile, `s.svc.CreatePlacements undefined`.

- [ ] **Step 10: Gateway service.** In `service/placements.go`, replace `CreatePlacement` with:

```go
// CreatePlacement validates input, fills in defaults (scale {1,1,1}), and
// persists.
func (g *Gateway) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	ready, err := preparePlacement(p)
	if err != nil {
		return domain.Placement{}, err
	}
	return g.catalog.CreatePlacement(ctx, ready)
}

// preparePlacement checks a new placement and fills the default scale: the
// checks a single create and every batch item share.
func preparePlacement(p domain.Placement) (domain.Placement, error) {
	if p.TerritorySlug == "" || p.ModelSlug == "" {
		return domain.Placement{}, fmt.Errorf("%w: territory and model slugs are required", domain.ErrInvalidInput)
	}
	p.Scale = defaultScale(p.Scale)
	if p.Scale.X <= 0 || p.Scale.Y <= 0 || p.Scale.Z <= 0 {
		return domain.Placement{}, fmt.Errorf("%w: scale components must be positive", domain.ErrInvalidInput)
	}
	return p, nil
}
```

Create `service/create_placements.go`:

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// maxPlacementBatch mirrors the catalog's ceiling so an oversized batch is a
// 400 before any round trip. The catalog still enforces it.
const maxPlacementBatch = 100

// CreatePlacements validates a batch and lands it on territorySlug in one
// catalog transaction. Every item is pinned to territorySlug (the territory the
// route's gate checked) whatever it carried.
func (g *Gateway) CreatePlacements(ctx context.Context, territorySlug string, items []domain.Placement) ([]domain.Placement, error) {
	if len(items) == 0 || len(items) > maxPlacementBatch {
		return nil, fmt.Errorf("%w: a batch holds 1 to %d placements, got %d",
			domain.ErrInvalidInput, maxPlacementBatch, len(items))
	}
	prepared := make([]domain.Placement, len(items))
	for i, p := range items {
		p.TerritorySlug = territorySlug
		ready, err := preparePlacement(p)
		if err != nil {
			return nil, fmt.Errorf("item %d: %w", i, err)
		}
		prepared[i] = ready
	}
	return g.catalog.CreatePlacements(ctx, territorySlug, prepared)
}
```

Run the Step 9 command. Expected: PASS.

- [ ] **Step 11: Route permission (failing first).** In `authhttp/route_permissions_test.go`, add `"POST /api/territories/{slug}/placements/batch",` to the `TestEveryContentMutationRouteIsGated` list after the single-create line, and append:

```go
// A batch create is N single creates: anything weaker would let a caller
// without placement:create place models through the batch door.
func (s *RoutePermsSuite) TestABatchCreateNeedsTheSingleCreateGrant() {
	assert.DeepEqual(s.T(), routePerms["POST /api/territories/{slug}/placements/batch"],
		routePerms["POST /api/territories/{slug}/placements"])
}
```

Run: `go test -race -run TestRoutePermsSuite ./internal/transport/authhttp/`. Expected: FAIL, `… /placements/batch is not gated`. Then add to `routePerms` after the single-create entry:

```go
	"POST /api/territories/{slug}/placements/batch": {"placement:create"},
```

Re-run. Expected: PASS.

- [ ] **Step 12: OpenAPI.** Add a schema after `PlacementCreate`:

```yaml
    PlacementBatchCreate:
      type: object
      required: [items]
      properties:
        items:
          type: array
          minItems: 1
          maxItems: 100
          items: { $ref: '#/components/schemas/PlacementCreate' }
```

Add a path after `/api/territories/{slug}/placements`:

```yaml
  /api/territories/{slug}/placements/batch:
    parameters:
      - name: slug
        in: path
        required: true
        schema: { type: string }
    post:
      operationId: createPlacements
      summary: Add 1–100 placements to a territory in one transaction
      description: >
        All or nothing: one catalog transaction, so a bad item (unknown model,
        non-positive scale, a panorama of another territory) leaves no rows.
        Answers the created placements in `items` order. Needs
        placement:create; covered by the territory gate like every route under
        /api/territories/{slug}.
      tags: [placements]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PlacementBatchCreate' }
      responses:
        '201':
          description: Created, in items order
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Placement' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/Internal' }
```

Run: `make -C backend openapi-gen && (cd frontend && yarn openapi:generate)`. Expected: exit 0. The gateway build then fails with `missing method CreatePlacements`, which is the RED for the next step.

- [ ] **Step 13: Failing handler test.** Add `CreatePlacements(ctx context.Context, territorySlug string, items []domain.Placement) ([]domain.Placement, error)` under `CreatePlacement` in `httpapi.Service`. Create `httpapi/placements_test.go`:

```go
package httpapi

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type PlacementBatchSuite struct{ suite.Suite }

func TestPlacementBatchSuite(t *testing.T) { suite.Run(t, new(PlacementBatchSuite)) }

// batchStub records what reached the service and echoes the items back with
// ids; err, when set, is returned instead.
type batchStub struct {
	Service
	slug  *string
	items *[]domain.Placement
	err   error
}

func (b batchStub) CreatePlacements(_ context.Context, slug string, items []domain.Placement) ([]domain.Placement, error) {
	*b.slug, *b.items = slug, items
	if b.err != nil {
		return nil, b.err
	}
	out := make([]domain.Placement, len(items))
	for i, p := range items {
		p.ID = int64(i + 1)
		out[i] = p
	}
	return out, nil
}

func (s *PlacementBatchSuite) TestTheBatchLandsOnTheRouteTerritoryInOrder() {
	var slug string
	var items []domain.Placement
	label := "north"
	body := PlacementBatchCreate{Items: []PlacementCreate{
		{ModelSlug: "pump", Position: &Vec3{X: 1}},
		{ModelSlug: "tank", Label: &label, VisiblePanoramaIds: &[]int64{7}},
	}}

	resp, err := New(batchStub{slug: &slug, items: &items}).CreatePlacements(s.T().Context(),
		CreatePlacementsRequestObject{Slug: "yard", Body: &body})
	assert.NilError(s.T(), err)
	created, ok := resp.(CreatePlacements201JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), slug, "yard")
	assert.Equal(s.T(), items[0].TerritorySlug, "yard")
	assert.Equal(s.T(), items[0].Position.X, 1.0)
	assert.Equal(s.T(), items[1].Label, "north")
	assert.DeepEqual(s.T(), items[1].VisiblePanoramaIDs, []int64{7})
	assert.Equal(s.T(), created[1].ModelSlug, "tank")
	assert.Equal(s.T(), created[1].Id, int64(2))
}

func (s *PlacementBatchSuite) TestRefusalsKeepTheirStatus() {
	for _, tc := range []struct {
		err  error
		want string
	}{
		{fmt.Errorf("%w: a batch holds 1 to 100", domain.ErrInvalidInput), "CreatePlacements400JSONResponse"},
		{domain.ErrTerritoryNotFound, "CreatePlacements404JSONResponse"},
	} {
		var slug string
		var items []domain.Placement
		resp, err := New(batchStub{slug: &slug, items: &items, err: tc.err}).CreatePlacements(s.T().Context(),
			CreatePlacementsRequestObject{Slug: "yard", Body: &PlacementBatchCreate{Items: []PlacementCreate{{ModelSlug: "pump"}}}})
		assert.NilError(s.T(), err)
		assert.Equal(s.T(), fmt.Sprintf("%T", resp), "httpapi."+tc.want)
	}
}

func (s *PlacementBatchSuite) TestAMissingBodyIsABadRequest() {
	resp, err := New(batchStub{}).CreatePlacements(s.T().Context(), CreatePlacementsRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	_, ok := resp.(CreatePlacements400JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
}
```

Run: `go test -race -run TestPlacementBatchSuite ./internal/transport/httpapi/`. Expected: FAIL to compile, `New(…).CreatePlacements undefined`.

- [ ] **Step 14: Handler.** Add to `httpapi/placement_converter.go`:

```go
// placementFromCreate maps one PlacementCreate (alone, or an item of a batch)
// onto a domain placement on slug.
func placementFromCreate(slug string, body PlacementCreate) domain.Placement {
	p := domain.Placement{
		TerritorySlug: slug,
		ModelSlug:     body.ModelSlug,
		Position:      vec3PtrFromAPI(body.Position),
		Rotation:      vec3PtrFromAPI(body.Rotation),
		Scale:         vec3PtrFromAPI(body.Scale),
	}
	if body.Label != nil {
		p.Label = *body.Label
	}
	if body.VisiblePanoramaIds != nil {
		p.VisiblePanoramaIDs = *body.VisiblePanoramaIds
	}
	return p
}
```

In `httpapi/placements.go`, change `CreatePlacement` to call `s.svc.CreatePlacement(ctx, placementFromCreate(req.Slug, *req.Body))`, delete its inline label/ids unpacking, and add:

```go
func (s *Server) CreatePlacements(ctx context.Context, req CreatePlacementsRequestObject) (CreatePlacementsResponseObject, error) {
	if req.Body == nil {
		return CreatePlacements400JSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}, nil
	}
	items := make([]domain.Placement, len(req.Body.Items))
	for i, it := range req.Body.Items {
		items[i] = placementFromCreate(req.Slug, it)
	}
	out, err := s.svc.CreatePlacements(ctx, req.Slug, items)
	switch {
	case isInvalid(err):
		return CreatePlacements400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return CreatePlacements404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return CreatePlacements500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(CreatePlacements201JSONResponse, len(out))
	for i, p := range out {
		resp[i] = placementToAPI(p)
	}
	return resp, nil
}
```

Run the Step 13 command, then `go test -race ./...` in gateway-service. Expected: all `ok`, including `TestRoutePermsSpecSuite` and `TestSpecCoverageSuite`.

- [ ] **Step 15: Docs.** Root `CLAUDE.md` endpoint list: ``- `POST /api/territories/{slug}/placements/batch` `{items: PlacementCreate[]}` (1–100) → 201 `Placement[]` in item order. One catalog transaction, so all or nothing; every item is pinned to the URL's territory. `placement:create`.`` In `backend/CLAUDE.md` § Placements, add the line `POST   /api/territories/{slug}/placements/batch    → 201 [Placement…]  (1–100, one transaction)` to the endpoint block.

- [ ] **Step 16: Gate + live check.** Run the `make check` gate and the `TestBatchSuite` integration command. Both must exit 0. Live, as `editor1` on `dji-wp-46-cut` (CSRF token from login):

```bash
curl -s -X POST -H "Authorization: Bearer $EDITOR" -H 'Content-Type: application/json' \
  localhost:8080/api/territories/dji-wp-46-cut/placements/batch \
  -d '{"items":[{"modelSlug":"<a model slug>"},{"modelSlug":"<a model slug>","position":{"x":2,"y":0,"z":0}}]}' | jq 'map(.id)'
```

Expected: two ascending ids. The same call as `cotest` on `dji-wp-46-cut` answers 404. A body with a bogus second `modelSlug` answers 404, and `GET …/placements` shows no new row.

- [ ] **Step 17: Commit.**

```bash
git add backend/proto/rosneft/catalog/v1/catalog.proto backend/proto/gen/go/rosneft/catalog/v1/catalog.pb.go \
  backend/proto/gen/go/rosneft/catalog/v1/catalog_grpc.pb.go \
  backend/services/catalog-service/internal/storage/create_placement.go \
  backend/services/catalog-service/internal/storage/create_placements.go \
  backend/services/catalog-service/internal/storage/batch_integration_test.go \
  backend/services/catalog-service/internal/service/catalog.go \
  backend/services/catalog-service/internal/service/create_placement.go \
  backend/services/catalog-service/internal/service/create_placements.go \
  backend/services/catalog-service/internal/service/placements_test.go \
  backend/services/catalog-service/internal/service/mocks/repository_mock.go \
  backend/services/catalog-service/internal/transport/grpcapi/server.go \
  backend/services/catalog-service/internal/transport/grpcapi/converters.go \
  backend/services/catalog-service/internal/transport/grpcapi/create_placement.go \
  backend/services/catalog-service/internal/transport/grpcapi/create_placements.go \
  backend/services/catalog-service/internal/transport/grpcapi/mocks/service_mock.go \
  backend/services/gateway-service/internal/clients/catalog/placements.go \
  backend/services/gateway-service/internal/clients/catalog/placements_test.go \
  backend/services/gateway-service/internal/service/gateway.go \
  backend/services/gateway-service/internal/service/placements.go \
  backend/services/gateway-service/internal/service/create_placements.go \
  backend/services/gateway-service/internal/service/placements_test.go \
  backend/services/gateway-service/internal/service/mocks/catalog_mock.go \
  backend/services/gateway-service/internal/transport/httpapi/server.go \
  backend/services/gateway-service/internal/transport/httpapi/placements.go \
  backend/services/gateway-service/internal/transport/httpapi/placement_converter.go \
  backend/services/gateway-service/internal/transport/httpapi/placements_test.go \
  backend/services/gateway-service/internal/transport/authhttp/route_permissions.go \
  backend/services/gateway-service/internal/transport/authhttp/route_permissions_test.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go \
  backend/services/gateway-service/api/openapi.yaml frontend/src/shared/api/dto.ts CLAUDE.md backend/CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(catalog,gateway): batch placement create in one transaction

POST /api/territories/{slug}/placements/batch takes 1-100 items, pins each
to the URL's territory and lands them whole or not at all under
audittx.Run. placement:create, behind the territory gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task D3d-be: rename a role and replace its grants in one call

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to` (+ `golang-testing`, `golang-database`, `golang-security`, `golang-grpc`).

**Design:** `UpdateRoleRequest` gets `permission_slugs` plus `replace_permissions`. The flag is needed because proto3 cannot tell "absent" from "empty" in a repeated field, and `[]` must still mean "strip every grant". In auth-service, `Update` replaces `UpdateTitle` (fewer methods, not more). The service runs the existing `assertCanGrant` only when grants are replaced. The store renames and rewrites `role_permissions` in **one** `audittx.Run`, and a refused grant undoes the rename. In the gateway, `PermissionSlugs *[]string` keeps absent and `[]` apart.

**Files:**
- Modify: `backend/proto/rosneft/auth/v1/auth.proto`; regenerate `backend/proto/gen/go/rosneft/auth/v1/auth.pb.go`
- Modify: `backend/services/auth-service/internal/domain/role.go`
- Modify: `backend/services/auth-service/internal/storage/roles/update.go`, `…/storage/roles/set_permissions.go`; create `…/storage/roles/update_integration_test.go`
- Modify: `backend/services/auth-service/internal/service/roles/roles.go` (Store), `…/service/roles/crud.go`, `…/service/roles/roles_test.go`; regenerate `…/service/roles/mocks/store_mock.go`
- Modify: `backend/services/auth-service/internal/transport/grpcapi/server.go` (RolesSvc), `…/grpcapi/roles.go`
- Modify: `backend/services/gateway-service/internal/clients/auth/roles.go`, `…/transport/authhttp/roles.go`; create `…/transport/authhttp/roles_test.go`
- Modify: `backend/services/gateway-service/api/openapi.yaml`; regenerate `openapi_gen.go`, `openapi_spec_gen.go`, `frontend/src/shared/api/dto.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces (auth domain): `type RoleUpdate struct { Slug, Title string; PermissionSlugs []string; ReplacePermissions bool }`
- Produces (auth store): `func (s *Store) Update(ctx context.Context, u domain.RoleUpdate, scopeAdminID string, allAccess bool) (domain.Role, error)`. Replaces `UpdateTitle`.
- Produces (auth service, `RolesSvc`): `func (s *Service) Update(ctx context.Context, actorID string, u domain.RoleUpdate, scopeAdminID string, allAccess bool) (domain.Role, error)`. Replaces `UpdateTitle`.
- Produces (gateway client): `func (c *Client) UpdateRole(ctx context.Context, token, slug, title string, perms *[]string) (*authv1.Role, error)`
- Produces (JSON): `PATCH /api/auth/roles/{slug}` `{title, permissionSlugs?}`

- [ ] **Step 1: Proto.** Replace `message UpdateRoleRequest` in `auth.proto`:

```proto
message UpdateRoleRequest {
  string slug = 1;
  string title = 2;
  string token = 3; // actor; only the role's group (or Root) may change it
  // Applied only when replace_permissions is set, in the rename's transaction,
  // under the same no-escalation check as SetRolePermissions. The flag exists
  // because proto3 cannot tell an absent repeated field from an empty one, and
  // an empty set must still mean "strip every grant".
  repeated string permission_slugs = 4;
  bool replace_permissions = 5;
}
```

Run: `make -C backend proto-gen`. Expected: exit 0.

- [ ] **Step 2: Domain.** Append to `auth-service/internal/domain/role.go`:

```go
// RoleUpdate is one edit of a role: a new title and, when ReplacePermissions is
// set, a new permission set. The flag, not a nil slice, says "leave the grants
// alone"; an empty PermissionSlugs with the flag set strips them all.
type RoleUpdate struct {
	Slug               string
	Title              string
	PermissionSlugs    []string
	ReplacePermissions bool
}
```

- [ ] **Step 3: Failing store test.** Create `auth-service/internal/storage/roles/update_integration_test.go`:

```go
//go:build integration

package roles_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/roles"
)

// UpdateSuite pins that a rename and a grant rewrite share one transaction:
// the rollback is Postgres', so a mock cannot show it.
type UpdateSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *roles.Store
}

func TestUpdateSuite(t *testing.T) { suite.Run(t, new(UpdateSuite)) }

func (s *UpdateSuite) SetupSuite() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, dsn))

	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.store = roles.New(s.pool)
}

func (s *UpdateSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *UpdateSuite) TestRenamesAndRegrantsTogether() {
	ctx := s.T().Context()
	_, err := s.store.Create(ctx, domain.Role{Slug: "surveyor", Title: "Surveyor"})
	assert.NilError(s.T(), err)

	got, err := s.store.Update(ctx, domain.RoleUpdate{
		Slug: "surveyor", Title: "Chief surveyor",
		PermissionSlugs: []string{"territory:read"}, ReplacePermissions: true,
	}, "", true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Title, "Chief surveyor")
	assert.DeepEqual(s.T(), got.PermissionSlugs, []string{"territory:read"})
}

func (s *UpdateSuite) TestARefusedGrantLeavesTheOldTitle() {
	ctx := s.T().Context()
	_, err := s.store.Create(ctx, domain.Role{Slug: "auditor", Title: "Auditor"})
	assert.NilError(s.T(), err)

	_, err = s.store.Update(ctx, domain.RoleUpdate{
		Slug: "auditor", Title: "Renamed", PermissionSlugs: []string{"no:such"}, ReplacePermissions: true,
	}, "", true)
	assert.ErrorIs(s.T(), err, domain.ErrPermissionUnknown)
	got, err := s.store.Get(ctx, "auditor")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Title, "Auditor")
}

func (s *UpdateSuite) TestATitleOnlyUpdateKeepsTheGrants() {
	ctx := s.T().Context()
	_, err := s.store.Create(ctx, domain.Role{Slug: "reader", Title: "Reader", PermissionSlugs: []string{"territory:read"}})
	assert.NilError(s.T(), err)

	got, err := s.store.Update(ctx, domain.RoleUpdate{Slug: "reader", Title: "Reader II"}, "", true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Title, "Reader II")
	assert.DeepEqual(s.T(), got.PermissionSlugs, []string{"territory:read"})
}
```

Run: `cd backend/services/auth-service && GOWORK=off go test -race -tags=integration -run TestUpdateSuite ./internal/storage/roles/`. Expected: FAIL to compile, `s.store.Update undefined`.

- [ ] **Step 4: Store.** In `storage/roles/set_permissions.go`, split `replacePermissions`:

```go
func (s *Store) replacePermissions(ctx context.Context, slug string, permSlugs []string) error {
	return audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var roleID string
		if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE slug = $1`, slug).Scan(&roleID); err != nil {
			return fmt.Errorf("roles.replacePermissions: role id: %w", err)
		}
		return writePermissions(ctx, tx, roleID, permSlugs)
	})
}

// writePermissions replaces one role's role_permissions rows inside tx.
func writePermissions(ctx context.Context, tx pgx.Tx, roleID string, permSlugs []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return fmt.Errorf("roles.writePermissions: clear: %w", err)
	}
	for _, ps := range permSlugs {
		var permID string
		if err := tx.QueryRow(ctx, `SELECT id FROM permissions WHERE slug = $1`, ps).Scan(&permID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.ErrPermissionUnknown
			}
			return fmt.Errorf("roles.writePermissions: perm %q: %w", ps, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)`, roleID, permID); err != nil {
			return fmt.Errorf("roles.writePermissions: insert: %w", err)
		}
	}
	return nil
}
```

Replace the whole body of `storage/roles/update.go` (keeping its imports) with:

```go
// Update renames a role and, when u.ReplacePermissions is set, rewrites its
// permission set in the same transaction: the Roles screen saves both at once,
// and a refused grant must not leave the rename standing. Refused for system
// roles and for roles outside the actor's group (see assertMutable). Wrapped
// in audittx.Run so both changes are attributed.
func (s *Store) Update(ctx context.Context, u domain.RoleUpdate, scopeAdminID string, allAccess bool) (domain.Role, error) {
	if err := s.assertMutable(ctx, u.Slug, scopeAdminID, allAccess); err != nil {
		return domain.Role{}, err
	}
	const q = `UPDATE roles SET title = $2, updated_at = now() WHERE slug = $1 RETURNING id`

	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var roleID string
		if err := tx.QueryRow(ctx, q, u.Slug, u.Title).Scan(&roleID); err != nil {
			return err
		}
		if !u.ReplacePermissions {
			return nil
		}
		return writePermissions(ctx, tx, roleID, u.PermissionSlugs)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Role{}, domain.ErrRoleNotFound
	}
	if err != nil {
		return domain.Role{}, fmt.Errorf("roles.Update: %w", err)
	}
	return s.Get(ctx, u.Slug)
}
```

Run the Step 3 command. It still fails to compile at `service/roles` (Store interface), which is expected; the storage package itself builds. Continue.

- [ ] **Step 5: Failing service tests.** In `service/roles/roles.go`, replace `UpdateTitle(…)` in `Store` with `Update(ctx context.Context, u domain.RoleUpdate, scopeAdminID string, allAccess bool) (domain.Role, error)`, then run `cd backend/services/auth-service && go generate ./internal/service/roles/`. Append to `service/roles/roles_test.go`:

```go
// A rename that carries grants is checked like SetPermissions: the PATCH must
// not become the way around the escalation guard.
func (s *RolesSuite) TestUpdateWithGrantsBlocksEscalation() {
	s.actors.GetByIDMock.Expect(s.ctx, "editor").Return(domain.User{ID: "editor", Permissions: []string{"placement:write"}}, nil)
	_, err := s.svc.Update(s.ctx, "editor", domain.RoleUpdate{
		Slug: "viewer", Title: "Viewer", PermissionSlugs: []string{"model:delete"}, ReplacePermissions: true,
	}, "", false)
	assert.ErrorIs(s.T(), err, domain.ErrPrivilegeEscalation)
}

// A title-only edit grants nothing, so it asks nobody (no GetByID expectation:
// minimock fails the test if it is called).
func (s *RolesSuite) TestATitleOnlyUpdateSkipsTheGrantCheck() {
	u := domain.RoleUpdate{Slug: "viewer", Title: "Viewer"}
	s.st.UpdateMock.Expect(s.ctx, u, "admin-1", false).Return(domain.Role{Slug: "viewer", Title: "Viewer"}, nil)
	r, err := s.svc.Update(s.ctx, "editor", u, "admin-1", false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), r.Title, "Viewer")
}

func (s *RolesSuite) TestUpdateRejectsAnEmptyTitle() {
	_, err := s.svc.Update(s.ctx, "owner", domain.RoleUpdate{Slug: "viewer"}, "", true)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}
```

Run: `go test -race -run TestRolesSuite ./internal/service/roles/`. Expected: FAIL to compile, `s.svc.Update undefined`.

- [ ] **Step 6: Service + transport.** In `service/roles/crud.go`, replace `UpdateTitle` with:

```go
// Update renames a role and, when u.ReplacePermissions is set, replaces its
// grants in the same store transaction. Grants are checked as SetPermissions
// checks them: a non-owner cannot hand out what it lacks.
func (s *Service) Update(ctx context.Context, actorID string, u domain.RoleUpdate, scopeAdminID string, allAccess bool) (domain.Role, error) {
	if u.Slug == "" || u.Title == "" {
		return domain.Role{}, fmt.Errorf("roles.Update: %w: slug and title required", domain.ErrInvalidInput)
	}
	if u.ReplacePermissions {
		if err := s.assertCanGrant(ctx, actorID, u.PermissionSlugs); err != nil {
			return domain.Role{}, err
		}
	}
	return s.store.Update(ctx, u, scopeAdminID, allAccess)
}
```

In `transport/grpcapi/server.go` `RolesSvc`, replace the `UpdateTitle` line with `Update(ctx context.Context, actorID string, u domain.RoleUpdate, scopeAdminID string, allAccess bool) (domain.Role, error)`. In `transport/grpcapi/roles.go` (add the `domain` import), rewrite `UpdateRole`:

```go
func (s *Server) UpdateRole(ctx context.Context, req *authv1.UpdateRoleRequest) (*authv1.Role, error) {
	actorID, owningAdmin, allAccess, err := s.roleActor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	r, err := s.roles.Update(ctx, actorID, domain.RoleUpdate{
		Slug:               req.GetSlug(),
		Title:              req.GetTitle(),
		PermissionSlugs:    req.GetPermissionSlugs(),
		ReplacePermissions: req.GetReplacePermissions(),
	}, owningAdmin, allAccess)
	if err != nil {
		return nil, mapError(err)
	}
	return roleToProto(r), nil
}
```

Run: `go test -race ./...` in auth-service, then the Step 3 integration command. Expected: all `ok`, and `TestUpdateSuite` PASS.

- [ ] **Step 7: Failing gateway test.** Create `gateway-service/internal/transport/authhttp/roles_test.go`:

```go
package authhttp

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
)

// rolesStub hands the UpdateRole request it received back to the test. The
// channel, not a field, because the gRPC server answers on its own goroutine.
type rolesStub struct {
	authv1.UnimplementedAuthServiceServer
	got chan *authv1.UpdateRoleRequest
}

func (r rolesStub) UpdateRole(_ context.Context, req *authv1.UpdateRoleRequest) (*authv1.Role, error) {
	r.got <- req
	return &authv1.Role{Slug: req.GetSlug(), Title: req.GetTitle(), PermissionSlugs: req.GetPermissionSlugs()}, nil
}

type RolesSuite struct{ suite.Suite }

func TestRolesSuite(t *testing.T) { suite.Run(t, new(RolesSuite)) }

// patch drives PATCH /api/auth/roles/{slug} against a loopback auth-service and
// returns what that service was asked.
func (s *RolesSuite) patch(body string) (*httptest.ResponseRecorder, *authv1.UpdateRoleRequest) {
	stub := rolesStub{got: make(chan *authv1.UpdateRoleRequest, 1)}
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(s.T(), err)
	srv := grpc.NewServer()
	authv1.RegisterAuthServiceServer(srv, stub)
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)
	client, err := auth.Dial(lis.Addr().String())
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = client.Close() })

	h := &Handlers{client: client, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	r := chi.NewRouter()
	r.Patch("/api/auth/roles/{slug}", h.updateRole)
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(s.T().Context(), http.MethodPatch, "/api/auth/roles/viewer", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(rec, req)
	return rec, <-stub.got
}

func (s *RolesSuite) TestATitleAloneLeavesTheGrants() {
	rec, got := s.patch(`{"title":"Viewer"}`)
	assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
	assert.Equal(s.T(), got.GetSlug(), "viewer")
	assert.Equal(s.T(), got.GetTitle(), "Viewer")
	assert.Assert(s.T(), !got.GetReplacePermissions())
}

func (s *RolesSuite) TestPermissionsTravelWithTheTitle() {
	rec, got := s.patch(`{"title":"Viewer","permissionSlugs":["territory:read"]}`)
	assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
	assert.Assert(s.T(), got.GetReplacePermissions())
	assert.DeepEqual(s.T(), got.GetPermissionSlugs(), []string{"territory:read"})
}

// [] is a real request, "strip every grant", and must not read as "absent".
func (s *RolesSuite) TestAnEmptyListStillReplaces() {
	_, got := s.patch(`{"title":"Viewer","permissionSlugs":[]}`)
	assert.Assert(s.T(), got.GetReplacePermissions())
	assert.Equal(s.T(), len(got.GetPermissionSlugs()), 0)
}
```

Run: `cd backend/services/gateway-service && go test -race -run TestRolesSuite ./internal/transport/authhttp/`. Expected: FAIL: `TestPermissionsTravelWithTheTitle` and `TestAnEmptyListStillReplaces` assert `ReplacePermissions` is false.

- [ ] **Step 8: Gateway.** In `clients/auth/roles.go`, replace `UpdateRole`:

```go
// UpdateRole renames a role; a non-nil perms also replaces its grants in the
// same auth-service transaction. nil leaves them untouched; an empty list
// strips them.
func (c *Client) UpdateRole(ctx context.Context, token, slug, title string, perms *[]string) (*authv1.Role, error) {
	req := &authv1.UpdateRoleRequest{Token: token, Slug: slug, Title: title}
	if perms != nil {
		req.PermissionSlugs, req.ReplacePermissions = *perms, true
	}
	return c.cc.UpdateRole(ctx, req)
}
```

In `authhttp/roles.go`, replace `updateRole`:

```go
func (h *Handlers) updateRole(w http.ResponseWriter, r *http.Request) {
	// A pointer keeps "absent" and [] apart: absent leaves the grants alone, []
	// strips them all.
	var req struct {
		Title           string
		PermissionSlugs *[]string
	}
	if !decode(w, r, &req) {
		return
	}
	role, err := h.client.UpdateRole(r.Context(), sessionToken(r), chi.URLParam(r, "slug"), req.Title, req.PermissionSlugs)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, roleToJSON(role))
}
```

Run the Step 7 command. Expected: PASS.

- [ ] **Step 9: OpenAPI.** Replace `UpdateRoleRequest`:

```yaml
    UpdateRoleRequest:
      type: object
      required: [title]
      properties:
        title: { type: string }
        permissionSlugs:
          type: array
          items: { type: string }
          description: >
            Optional. Present (even as []) replaces the role's permissions in the
            rename's transaction, under the same no-escalation check as
            PUT …/permissions. Absent leaves them untouched.
```

In `/api/auth/roles/{slug}` `patch`, set `summary: Rename a role and optionally replace its permissions (requires roles:manage)` and add `'400': { $ref: '#/components/responses/BadRequest' }`. Run: `make -C backend openapi-gen && (cd frontend && yarn openapi:generate)`. Expected: exit 0.

- [ ] **Step 10: Docs.** Root `CLAUDE.md` endpoint list: ``- `PATCH /api/auth/roles/{slug}` takes `permissionSlugs` beside `title`: present (even `[]`) replaces the grants in the rename's auth transaction, with the escalation check; absent leaves them. `PUT …/permissions` stays, and the SPA no longer calls it.``

- [ ] **Step 11: Gate.** Run the `make check` gate and the Step 3 integration command. Both must exit 0.

- [ ] **Step 12: Commit.**

```bash
git add backend/proto/rosneft/auth/v1/auth.proto backend/proto/gen/go/rosneft/auth/v1/auth.pb.go \
  backend/services/auth-service/internal/domain/role.go \
  backend/services/auth-service/internal/storage/roles/update.go \
  backend/services/auth-service/internal/storage/roles/set_permissions.go \
  backend/services/auth-service/internal/storage/roles/update_integration_test.go \
  backend/services/auth-service/internal/service/roles/roles.go \
  backend/services/auth-service/internal/service/roles/crud.go \
  backend/services/auth-service/internal/service/roles/roles_test.go \
  backend/services/auth-service/internal/service/roles/mocks/store_mock.go \
  backend/services/auth-service/internal/transport/grpcapi/server.go \
  backend/services/auth-service/internal/transport/grpcapi/roles.go \
  backend/services/gateway-service/internal/clients/auth/roles.go \
  backend/services/gateway-service/internal/transport/authhttp/roles.go \
  backend/services/gateway-service/internal/transport/authhttp/roles_test.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go \
  backend/services/gateway-service/api/openapi.yaml frontend/src/shared/api/dto.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(auth,gateway): rename a role and replace its grants in one call

PATCH /api/auth/roles/{slug} accepts permissionSlugs beside title. When
present they are rewritten in the rename's transaction under the same
escalation check, and a refused grant undoes the rename.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task D4-be: `GET /api/console/summary`

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to` (+ `golang-testing`, `golang-concurrency`, `golang-security`, `golang-error-handling`).

**Design:**
- A new package `internal/transport/summary` holds the gate table (a copy of `guard.ts` `SCREENS`), the result types and the fan-out. It is a plain handler on the root router behind `Authenticate`, like `/api/jobs`, and outside the ETag chain because the answer is `no-store`.
- `bootstrap/summary.go` wires one `Count` per card from the sources each console screen already reads, always with the caller's own token or scope:
  - users/roles: auth client
  - content: `svc.ListTerritories(scope)` fail-closed plus `ListModels`
  - access: D3a's `svc.ListTerritoryAdmins`
  - audit24h: new `svc.CountAuditDay` (Limit 1 + IncludeTotal)
  - alerts: D3b's Prometheus client + new `metrics.FiringRules`
- The fan-out is a `sync.WaitGroup`, not an errgroup: a failure is local to its card, so there is nothing to propagate or cancel.

**Files:**
- Create: `backend/services/gateway-service/internal/transport/summary/summary.go`, `…/summary/summary_test.go`
- Create: `backend/services/gateway-service/internal/metrics/alerts.go`, `…/metrics/alerts_test.go`
- Create: `backend/services/gateway-service/internal/service/count_audit_day.go`, `…/service/count_audit_day_test.go`
- Create: `backend/services/gateway-service/internal/bootstrap/summary.go`, `…/bootstrap/summary_test.go`
- Modify: `backend/services/gateway-service/internal/bootstrap/transport.go`, `…/bootstrap/serve.go`, `…/bootstrap/transport_test.go`, `…/bootstrap/spec_coverage_test.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit.go`, `…/httpapi/audit_mine.go`, `…/httpapi/audit_csv.go` (export `AuditPrincipal`)
- Modify: `backend/services/gateway-service/api/openapi.yaml`, `…/api/oapi-codegen.yaml`; regenerate `openapi_gen.go`, `openapi_spec_gen.go`, `frontend/src/shared/api/dto.ts`
- Modify: `CLAUDE.md`, `backend/CLAUDE.md` (§ Tenant isolation)

**Interfaces:**
- Consumes: `(*service.Gateway).ListTerritoryAdmins(ctx, scopeAdminID string) (map[string][]string, error)` (D3a); `InitPrometheus(cfg) *metrics.Client` (D3b).
- Produces (summary): `type Count func(ctx context.Context) (any, error)`, `type Counts map[string]Count`, `type Users struct{Total, Frozen int}`, `type Roles struct{Roles, Permissions int}`, `type Content struct{Territories, Models int}`, `func Handler(counts Counts, logger *slog.Logger) http.HandlerFunc`
- Produces: `func metrics.FiringRules(series []metrics.Series) int`
- Produces: `func (g *Gateway) CountAuditDay(ctx context.Context, sc domain.AuditScope, now time.Time) (int64, error)`
- Produces: `func httpapi.AuditPrincipal(ctx context.Context) domain.AuditPrincipal` (renamed from `auditPrincipal`)
- Produces: `func InitConsoleSummary(svc *service.Gateway, authClient *auth.Client, prom *metrics.Client, logger *slog.Logger) http.Handler`. `InitRouter` gains a `summaryHandler http.Handler` parameter after `metricsHandler`.
- Produces (JSON): see the contract table.

- [ ] **Step 1: Failing summary handler tests.** Create `internal/transport/summary/summary_test.go`:

```go
package summary_test

import (
	"context"
	"encoding/json/v2"
	"errors"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/summary"
)

type SummarySuite struct{ suite.Suite }

func TestSummarySuite(t *testing.T) { suite.Run(t, new(SummarySuite)) }

var cards = []string{"access", "alerts", "audit24h", "content", "roles", "users"}

// answering returns one source per card that answers 1 and records that it ran.
func answering(ran *sync.Map) summary.Counts {
	out := summary.Counts{}
	for _, key := range cards {
		out[key] = func(context.Context) (any, error) {
			ran.Store(key, true)
			return 1, nil
		}
	}
	return out
}

func (s *SummarySuite) serve(p authhttp.TestPrincipal, counts summary.Counts) (*httptest.ResponseRecorder, map[string]any) {
	ctx := authhttp.NewTestContextFor(s.T().Context(), p)
	rec := httptest.NewRecorder()
	summary.Handler(counts, slog.New(slog.DiscardHandler)).
		ServeHTTP(rec, httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/console/summary", nil))
	var body map[string]any
	assert.NilError(s.T(), json.Unmarshal(rec.Body.Bytes(), &body))
	return rec, body
}

func ranKeys(ran *sync.Map) []string {
	var out []string
	ran.Range(func(k, _ any) bool { out = append(out, k.(string)); return true })
	slices.Sort(out)
	return out
}

func (s *SummarySuite) TestRootOpensEveryCard() {
	var ran sync.Map
	rec, body := s.serve(authhttp.TestPrincipal{UserID: "root", IsOwner: true}, answering(&ran))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(body)), cards)
}

// A Company Owner holds the grants below and is not Root: access and alerts
// are Root's screens, so their sources are never asked.
func (s *SummarySuite) TestACompanyOwnerSeesItsOwnScreens() {
	var ran sync.Map
	_, body := s.serve(authhttp.TestPrincipal{UserID: "co", OwningAdmin: "co", AuditCompany: "co",
		Perms: []string{"users:read", "roles:read", "territory:write", "audit:read"}}, answering(&ran))
	want := []string{"audit24h", "content", "roles", "users"}
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(body)), want)
	assert.DeepEqual(s.T(), ranKeys(&ran), want)
}

func (s *SummarySuite) TestModelWriteAloneOpensContent() {
	var ran sync.Map
	_, body := s.serve(authhttp.TestPrincipal{UserID: "m", Perms: []string{"model:write"}}, answering(&ran))
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(body)), []string{"content"})
}

func (s *SummarySuite) TestAViewerGetsAnEmptyObject() {
	var ran sync.Map
	_, body := s.serve(authhttp.TestPrincipal{UserID: "v", Perms: []string{"territory:read"}}, answering(&ran))
	assert.Equal(s.T(), len(body), 0)
	assert.Equal(s.T(), len(ranKeys(&ran)), 0)
}

func (s *SummarySuite) TestAFailedSourceIsNullForItsCardOnly() {
	var ran sync.Map
	counts := answering(&ran)
	counts["alerts"] = func(context.Context) (any, error) { return 3, errors.New("prometheus down") }

	rec, body := s.serve(authhttp.TestPrincipal{UserID: "root", IsOwner: true}, counts)
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	v, ok := body["alerts"]
	assert.Assert(s.T(), ok, "a failed card stays in the answer")
	assert.Assert(s.T(), v == nil, "as null, got %v", v)
	assert.Equal(s.T(), body["users"], 1.0)
}

func (s *SummarySuite) TestTheAnswerIsNeverCached() {
	var ran sync.Map
	rec, _ := s.serve(authhttp.TestPrincipal{UserID: "root", IsOwner: true}, answering(&ran))
	assert.Equal(s.T(), rec.Header().Get("Cache-Control"), "no-store")
	assert.Equal(s.T(), rec.Header().Get("Content-Type"), "application/json")
}
```

Run: `cd backend/services/gateway-service && go test -race ./internal/transport/summary/`. Expected: FAIL. The package `summary` does not exist.

- [ ] **Step 2: Summary package.** Create `internal/transport/summary/summary.go`:

```go
// Package summary serves GET /api/console/summary: Home's console cards as
// numbers, one request instead of one per card source.
package summary

import (
	"context"
	"encoding/json/v2"
	"log/slog"
	"net/http"
	"slices"
	"sync"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// Users is the users card: live accounts (ListUsers leaves the deleted out)
// and how many of them are frozen.
type Users struct {
	Total  int `json:"total"`
	Frozen int `json:"frozen"`
}

// Roles is the roles card: the roles the caller sees, and the permission
// catalog's size.
type Roles struct {
	Roles       int `json:"roles"`
	Permissions int `json:"permissions"`
}

// Content is the content card: the caller's visible territories, every model.
type Content struct {
	Territories int `json:"territories"`
	Models      int `json:"models"`
}

// Count reads one card's numbers with the caller's own session.
type Count func(ctx context.Context) (any, error)

// Counts maps a card key to its source.
type Counts map[string]Count

type principal struct {
	owner bool
	perms []string
}

func (p principal) can(perm string) bool { return p.owner || slices.Contains(p.perms, perm) }

// gates is frontend/src/app/router/guard.ts SCREENS, card for card: a card
// opens exactly when its console screen does. Change the two together.
var gates = map[string]func(principal) bool{
	"users":    func(p principal) bool { return p.can("users:read") },
	"roles":    func(p principal) bool { return p.can("roles:read") },
	"content":  func(p principal) bool { return p.can("territory:write") || p.can("model:write") },
	"access":   func(p principal) bool { return p.owner },
	"audit24h": func(p principal) bool { return p.can("audit:read") },
	"alerts":   func(p principal) bool { return p.owner },
}

// Handler answers one key per card the caller can open. A closed card is absent
// and its source is never asked; a source that fails is null for that card
// alone, logged, and does not fail the response.
func Handler(counts Counts, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		p := principal{owner: authhttp.IsOwner(ctx), perms: authhttp.Perms(ctx)}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.MarshalWrite(w, collect(ctx, p, counts, logger)); err != nil {
			logger.Warn("console summary: encode failed", "err", err)
		}
	}
}

// collect runs every open card's source in parallel. A WaitGroup rather than
// an errgroup: a failure is local to its card, so there is nothing to cancel.
func collect(ctx context.Context, p principal, counts Counts, logger *slog.Logger) map[string]any {
	var (
		mu  sync.Mutex
		wg  sync.WaitGroup
		out = make(map[string]any, len(counts))
	)
	for key, count := range counts {
		if open, ok := gates[key]; !ok || !open(p) {
			continue
		}
		wg.Go(func() {
			v, err := count(ctx)
			if err != nil {
				logger.Warn("console summary: source failed", "card", key, "err", err)
				v = nil
			}
			mu.Lock()
			out[key] = v
			mu.Unlock()
		})
	}
	wg.Wait()
	return out
}
```

Run the Step 1 command. Expected: PASS.

- [ ] **Step 3: Failing alerts test.** Create `internal/metrics/alerts_test.go`:

```go
package metrics

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type AlertsSuite struct{ suite.Suite }

func TestAlertsSuite(t *testing.T) { suite.Run(t, new(AlertsSuite)) }

func alert(name, service, severity, state string) Series {
	return Series{Label: name, Labels: map[string]string{
		"alertname": name, "service": service, "severity": severity, "alertstate": state,
	}}
}

// Counted the way the SPA's alertsOf groups them: one rule per
// alertname/service/severity, firing if any instance is.
func (s *AlertsSuite) TestFiringRulesCountsRulesNotInstances() {
	got := FiringRules([]Series{
		alert("TargetDown", "mesh-worker", "critical", "firing"),
		alert("TargetDown", "mesh-worker", "critical", "firing"), // second replica
		alert("TargetDown", "mesh-worker", "warning", "firing"),
		alert("HighLatency", "gateway", "warning", "pending"),
	})
	assert.Equal(s.T(), got, 2)
}

func (s *AlertsSuite) TestNothingFiringIsZero() {
	assert.Equal(s.T(), FiringRules(nil), 0)
}
```

Run: `go test -race -run TestAlertsSuite ./internal/metrics/`. Expected: FAIL to compile, `undefined: FiringRules`.

- [ ] **Step 4: FiringRules.** Create `internal/metrics/alerts.go`:

```go
package metrics

import "cmp"

// FiringRules counts alert rules with at least one firing series, keyed the
// way the SPA's alertsOf keys them (alertname, service, severity), so a rule
// firing on two replicas counts once.
func FiringRules(series []Series) int {
	firing := map[[3]string]bool{}
	for _, s := range series {
		if s.Labels["alertstate"] != "firing" {
			continue
		}
		name := cmp.Or(s.Labels["alertname"], s.Label)
		firing[[3]string{name, s.Labels["service"], s.Labels["severity"]}] = true
	}
	return len(firing)
}
```

Run the Step 3 command. Expected: PASS.

- [ ] **Step 5: Failing audit count test.** Create `internal/service/count_audit_day_test.go`:

```go
package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

type CountAuditDaySuite struct {
	suite.Suite
	audit *mocks.AuditMock
	svc   *service.Gateway
	ctx   context.Context
}

func TestCountAuditDaySuite(t *testing.T) { suite.Run(t, new(CountAuditDaySuite)) }

func (s *CountAuditDaySuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.audit = mocks.NewAuditMock(mc)
	s.svc = service.New(mocks.NewCatalogMock(mc), mocks.NewContentMock(mc), mocks.NewMeshMock(mc), mocks.NewUploadMock(mc), s.audit, mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
}

var now = time.Date(2026, 9, 23, 14, 37, 12, 0, time.UTC)

// The 24 hourly buckets the journal page draws start at the running hour minus
// 23: bucket 0 is 15:00 yesterday when it is 14:37 now.
func (s *CountAuditDaySuite) TestCountsTheBucketsTheJournalDraws() {
	s.audit.ListEntriesMock.Expect(s.ctx, domain.AuditQuery{
		CompanyID: "co-1", From: time.Date(2026, 9, 22, 15, 0, 0, 0, time.UTC), Limit: 1, IncludeTotal: true,
	}).Return(domain.AuditPage{Total: 42}, nil)

	n, err := s.svc.CountAuditDay(s.ctx, domain.AuditScope{Company: "co-1"}, now)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int64(42))
}

func (s *CountAuditDaySuite) TestRootCountsEveryCompany() {
	s.audit.ListEntriesMock.Expect(s.ctx, domain.AuditQuery{
		AllCompanies: true, From: time.Date(2026, 9, 22, 15, 0, 0, 0, time.UTC), Limit: 1, IncludeTotal: true,
	}).Return(domain.AuditPage{Total: 7}, nil)

	n, err := s.svc.CountAuditDay(s.ctx, domain.AuditScope{All: true}, now)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int64(7))
}
```

Run: `go test -race -run TestCountAuditDaySuite ./internal/service/`. Expected: FAIL to compile, `s.svc.CountAuditDay undefined`.

- [ ] **Step 6: CountAuditDay.** Create `internal/service/count_audit_day.go`:

```go
package service

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// CountAuditDay counts the journal rows in the 24 hourly buckets the audit page
// draws, from the start of the hour 23 hours before now's, within sc. One row
// with IncludeTotal: the rows themselves are not wanted, only the count, so
// nothing is labelled and auth is not asked.
func (g *Gateway) CountAuditDay(ctx context.Context, sc domain.AuditScope, now time.Time) (int64, error) {
	page, err := g.audit.ListEntries(ctx, domain.AuditQuery{
		AllCompanies: sc.All,
		CompanyID:    sc.Company,
		ActorID:      sc.Actor,
		From:         now.Truncate(time.Hour).Add(-23 * time.Hour),
		Limit:        1,
		IncludeTotal: true,
	})
	if err != nil {
		return 0, err
	}
	return page.Total, nil
}
```

Run the Step 5 command. Expected: PASS.

- [ ] **Step 7: Export `AuditPrincipal`.** In `httpapi/audit.go`, rename `auditPrincipal` to `AuditPrincipal` and start its doc comment with `AuditPrincipal assembles …`. Update the calls in `audit.go` (two), `audit_mine.go` and `audit_csv.go`. Run: `go test -race ./internal/transport/httpapi/`. Expected: `ok`.

- [ ] **Step 8: Failing wiring tests.** Create `internal/bootstrap/summary_test.go`:

```go
package bootstrap

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/summary"
)

// ConsoleCountsSuite pins that each card counts only what its screen would
// show this caller. The auth and Prometheus clients are nil: the cards under
// test never reach them.
type ConsoleCountsSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	svc *service.Gateway
}

func TestConsoleCountsSuite(t *testing.T) { suite.Run(t, new(ConsoleCountsSuite)) }

func (s *ConsoleCountsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.svc = service.New(s.cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
}

// tenant-a's owner counts tenant-a's territories, never tenant-b's.
func (s *ConsoleCountsSuite) TestContentCountsOnlyTheCallersTerritories() {
	ctx := authhttp.NewTestContext(s.T().Context(), false, "admin-a")
	s.cat.ListTerritoriesMock.Expect(ctx, "admin-a").Return([]domain.Territory{{Slug: "tenant-a-scene"}}, nil)
	s.cat.ListModelsMock.Expect(ctx).Return([]domain.Model{{Slug: "pump"}, {Slug: "tank"}}, nil)

	got, err := consoleCounts(s.svc, nil, nil)["content"](ctx)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, summary.Content{Territories: 1, Models: 2})
}

// An empty scope means "every territory" to the catalog, so a non-Root caller
// without one must count none, exactly as GET /api/territories answers [].
func (s *ConsoleCountsSuite) TestContentFailsClosedOnAnEmptyScope() {
	ctx := authhttp.NewTestContext(s.T().Context(), false, "")
	s.cat.ListModelsMock.Expect(ctx).Return([]domain.Model{{Slug: "pump"}}, nil)

	got, err := consoleCounts(s.svc, nil, nil)["content"](ctx)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, summary.Content{Territories: 0, Models: 1})
}

func (s *ConsoleCountsSuite) TestAccessSumsEveryTerritorysGrants() {
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")
	s.cat.ListTerritoriesMock.Expect(ctx, "").Return([]domain.Territory{{Slug: "a"}, {Slug: "b"}}, nil)
	s.cat.ListTerritoryAdminsMock.Expect(ctx, []string{"a", "b"}).
		Return(map[string][]string{"a": {"u1", "u2"}, "b": {"u1"}}, nil)

	got, err := consoleCounts(s.svc, nil, nil)["access"](ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got, 3)
}

func (s *ConsoleCountsSuite) TestUsersCountsTheFrozenAmongTheLive() {
	got := countUsers([]*authv1.User{{Status: "active"}, {Status: "frozen"}, {Status: "active"}})
	assert.DeepEqual(s.T(), got, summary.Users{Total: 3, Frozen: 1})
}
```

Run: `go test -race -run TestConsoleCountsSuite ./internal/bootstrap/`. Expected: FAIL to compile, `undefined: consoleCounts`.

- [ ] **Step 9: Wiring.** Create `internal/bootstrap/summary.go`:

```go
package bootstrap

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/metrics"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/httpapi"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/summary"
)

// InitConsoleSummary builds GET /api/console/summary. Each card reads the
// source its console screen reads, with the caller's own token or scope, so a
// count never reaches past what that screen would show.
func InitConsoleSummary(svc *service.Gateway, authClient *auth.Client, prom *metrics.Client, logger *slog.Logger) http.Handler {
	return summary.Handler(consoleCounts(svc, authClient, prom), logger)
}

func consoleCounts(svc *service.Gateway, authClient *auth.Client, prom *metrics.Client) summary.Counts {
	return summary.Counts{
		"users": func(ctx context.Context) (any, error) {
			list, err := authClient.ListUsers(ctx, authhttp.Token(ctx), "", false)
			if err != nil {
				return nil, err
			}
			return countUsers(list), nil
		},
		"roles": func(ctx context.Context) (any, error) {
			roles, err := authClient.ListRoles(ctx, authhttp.Token(ctx))
			if err != nil {
				return nil, err
			}
			perms, err := authClient.ListPermissions(ctx)
			if err != nil {
				return nil, err
			}
			return summary.Roles{Roles: len(roles), Permissions: len(perms)}, nil
		},
		"content": func(ctx context.Context) (any, error) { return countContent(ctx, svc) },
		"access": func(ctx context.Context) (any, error) {
			scope, _ := authhttp.Scope(ctx)
			bySlug, err := svc.ListTerritoryAdmins(ctx, scope)
			if err != nil {
				return nil, err
			}
			grants := 0
			for _, ids := range bySlug {
				grants += len(ids)
			}
			return grants, nil
		},
		"audit24h": func(ctx context.Context) (any, error) {
			sc, err := service.AuditScope(httpapi.AuditPrincipal(ctx))
			if err != nil {
				return nil, err
			}
			n, err := svc.CountAuditDay(ctx, sc, time.Now())
			return n, err
		},
		"alerts": func(ctx context.Context) (any, error) {
			series, err := prom.Query(ctx, "alerts", "1h")
			if err != nil {
				return nil, err
			}
			return metrics.FiringRules(series), nil
		},
	}
}

// countUsers counts what the Users card says: live accounts (ListUsers
// without includeDeleted already leaves the deleted out) and the frozen among
// them.
func countUsers(list []*authv1.User) summary.Users {
	frozen := 0
	for _, u := range list {
		if u.GetStatus() == "frozen" {
			frozen++
		}
	}
	return summary.Users{Total: len(list), Frozen: frozen}
}

// countContent counts what the Content screen lists: the caller's visible
// territories, fail-closed exactly as GET /api/territories, and every model.
func countContent(ctx context.Context, svc *service.Gateway) (summary.Content, error) {
	var c summary.Content
	if scope, all := authhttp.Scope(ctx); all || scope != "" {
		territories, err := svc.ListTerritories(ctx, scope)
		if err != nil {
			return summary.Content{}, err
		}
		c.Territories = len(territories)
	}
	models, err := svc.ListModels(ctx)
	if err != nil {
		return summary.Content{}, err
	}
	c.Models = len(models)
	return c, nil
}
```

Run the Step 8 command. Expected: PASS.

- [ ] **Step 10: Router.** In `bootstrap/transport.go`, add a `summaryHandler http.Handler` parameter after `metricsHandler http.Handler` in `InitRouter`. Add the line `//	  /api/console/summary → Authenticate → per-card gates → fan-out (no-store)` to its doc diagram, and register the route after the metrics route:

```go
	// Home's console cards as numbers. Root router like /api/jobs: the answer is
	// no-store, so the ETag chain would only hash it. Each card is gated and
	// scoped inside the handler; see transport/summary.
	r.With(authH.Authenticate).Get("/api/console/summary", summaryHandler.ServeHTTP)
```

In `serve.go`, after `metricsHandler := …`, add `summaryHandler := InitConsoleSummary(svc, authClient, prom, logger)` and pass it: `InitRouter(svc, assetProxy, metricsHandler, summaryHandler, authH, logger, cfg, backends)`. In `transport_test.go` and `spec_coverage_test.go`, add one more `http.NotFoundHandler(),` after the existing two. Run: `go test -race ./internal/bootstrap/`. Expected: FAIL. `TestEveryRouteIsDocumented` reports `GET /api/console/summary (path missing)`, which is the RED for the next step.

- [ ] **Step 11: OpenAPI.** In `api/oapi-codegen.yaml`, add `- console` to `exclude-tags` and the header line `#   - console → Home's console summary (InitConsoleSummary)`. In `openapi.yaml`, add a schema after `MetricSeries`:

```yaml
    ConsoleSummary:
      type: object
      description: >
        One key per console card the caller can open. A card they cannot open
        is absent and its source is never asked. A card whose source failed is
        null. The gates mirror the SPA's console screens.
      properties:
        users:
          type: object
          nullable: true
          required: [total, frozen]
          description: users:read. Live accounts (deleted excluded) and how many are frozen.
          properties:
            total: { type: integer, minimum: 0 }
            frozen: { type: integer, minimum: 0 }
        roles:
          type: object
          nullable: true
          required: [roles, permissions]
          description: roles:read. Roles the caller sees; size of the permission catalog.
          properties:
            roles: { type: integer, minimum: 0 }
            permissions: { type: integer, minimum: 0 }
        content:
          type: object
          nullable: true
          required: [territories, models]
          description: territory:write or model:write. The caller's visible territories; every model.
          properties:
            territories: { type: integer, minimum: 0 }
            models: { type: integer, minimum: 0 }
        access:
          type: integer
          nullable: true
          minimum: 0
          description: Root. Territory-admin assignments summed over every territory.
        audit24h:
          type: integer
          nullable: true
          minimum: 0
          description: >
            audit:read. Journal rows from the start of the hour 23 hours ago, in
            the caller's audit scope: the 24 buckets the journal page draws.
        alerts:
          type: integer
          nullable: true
          minimum: 0
          description: Root. Alert rules firing (alertname/service/severity; replicas count once).
```

Add a path before `/healthz`:

```yaml
  /api/console/summary:
    get:
      tags: [console]
      operationId: getConsoleSummary
      summary: Home's console cards as numbers, in one request
      description: >
        Each card is read in parallel with the caller's own session and scope,
        from the source its console screen reads. Answers `Cache-Control:
        no-store`. A Viewer, who opens no console screen, gets `{}`.
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ConsoleSummary' }
        '401': { $ref: '#/components/responses/Unauthorized' }
```

Run: `make -C backend openapi-gen && (cd frontend && yarn openapi:generate) && (cd backend/services/gateway-service && go test -race ./...)`. Expected: all `ok`.

- [ ] **Step 12: Docs.**
  - Root `CLAUDE.md` endpoint list: ``- `GET /api/console/summary` — Home's card numbers in one request: `users {total, frozen}`, `roles {roles, permissions}`, `content {territories, models}`, `access`, `audit24h`, `alerts`. A card the caller cannot open is absent (the gates copy `app/router/guard.ts` `SCREENS`, so change both together); a failed source is `null`. `no-store`.``
  - `backend/CLAUDE.md` § Tenant isolation, in the paragraph listing `/api/jobs`: ``The same holds for `/api/territory-admins` (Root gate, set through the caller's scope) and `/api/console/summary` (each card reads with the caller's own token or scope; content fails closed on an empty scope).``

- [ ] **Step 13: Gate + tenant check.** Run `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check`. Expected: exit 0. Live, on the two-tenant fixture:

```bash
for who in "$ROOT" "$COTEST" "$COTEST2" "$GUEST1"; do
  curl -s -H "Authorization: Bearer $who" localhost:8080/api/console/summary | jq -c .
done
```

Expected:
- root: all six keys
- `cotest` and `cotest2`: no `access` or `alerts` keys, and `content.territories` counts only their own territory (1 each on a fresh fixture)
- `guest1`: `{}`

- [ ] **Step 14: Commit.**

```bash
git add backend/services/gateway-service/internal/transport/summary/summary.go \
  backend/services/gateway-service/internal/transport/summary/summary_test.go \
  backend/services/gateway-service/internal/metrics/alerts.go \
  backend/services/gateway-service/internal/metrics/alerts_test.go \
  backend/services/gateway-service/internal/service/count_audit_day.go \
  backend/services/gateway-service/internal/service/count_audit_day_test.go \
  backend/services/gateway-service/internal/bootstrap/summary.go \
  backend/services/gateway-service/internal/bootstrap/summary_test.go \
  backend/services/gateway-service/internal/bootstrap/transport.go \
  backend/services/gateway-service/internal/bootstrap/serve.go \
  backend/services/gateway-service/internal/bootstrap/transport_test.go \
  backend/services/gateway-service/internal/bootstrap/spec_coverage_test.go \
  backend/services/gateway-service/internal/transport/httpapi/audit.go \
  backend/services/gateway-service/internal/transport/httpapi/audit_mine.go \
  backend/services/gateway-service/internal/transport/httpapi/audit_csv.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go \
  backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go \
  backend/services/gateway-service/api/openapi.yaml backend/services/gateway-service/api/oapi-codegen.yaml \
  frontend/src/shared/api/dto.ts CLAUDE.md backend/CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(gateway): console summary for Home's cards

GET /api/console/summary answers each card the caller can open as numbers,
read in parallel with their own session. A closed card is absent and never
asked; a failed source is null for its card alone.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

## Spec statements that do not match the code

1. **D2, "`… WHERE territory_id = ANY($1)`".** A listed row has no id: `domain.Territory` and `domain.Model` carry no `ID`, and the proto keeps it out on purpose (catalog.proto, `ResolveTerritorySlugs` comment). The plan matches `t.slug = ANY($1)` through the join instead. That uses the same unique `(…_id, lod)` index plus the unique slug index, and still makes one query per list.
2. **D3a, "over the caller's visible territories … the two-tenant test pins that".** The per-slug `GET /api/territories/{slug}/admins` is **Root only** (`httpapi/territory_admins.go`, `IsOwner`), and so is the Access screen (`guard.ts`: `access` → `p.isOwner`). If the batch followed the spec wording literally, it would show a Company Owner assignment data that the single read refuses. The plan keeps the Root gate and still resolves the set through `authhttp.Scope` → `ListTerritories`. The two-tenant check becomes "Company Owner → 403, Root → every tenant's keys".
3. **D4, "the plan pins the table from `console-nav`".** `widgets/console-nav` only renders a `disabled` flag. The gates live in `frontend/src/app/router/guard.ts` `SCREENS`, and the table above comes from there.
4. **D4, "Fan-out through `errgroup`".** Each card fails independently to `null`, so there is no error to propagate or cancel. An errgroup would need every `Go` to return nil. The plan uses `sync.WaitGroup.Go`. D3b does use `errgroup.WithContext` + `SetLimit(4)`, where cancel-on-first-error is the point.
5. **D4 `audit24h`.** The SPA's number was capped at 200 (`WINDOW_LIMIT`, a fetch artifact). The server count is exact, so the frontend decides whether to keep a `200+` wording.
6. **D3b, resolved.** A failed panel is left out of the map and the page shows one dark card as today; 502 only when every panel failed (the frontend contract).
7. **D3b, `metrics-gateway.ts` breaks at runtime.** The response shape changes from array to object, so the SPA's metrics page is broken between the backend and frontend D3b commits. Deploy them together.
8. **Not in the spec, noted only:** the scene bundle's `buildModelOptions` still makes one `ListModelArtifacts` call per model. After D2, `ListModels` already carries each model's full artifacts, bbox included, so that fan-out could go. It is out of scope here.

---

## Part D — frontend tasks

> Sections for `docs/superpowers/plans/2026-09-23-edit-and-batching.md`. Spec:
> `docs/superpowers/specs/2026-09-23-edit-and-batching-design.md`, section D.
> These tasks run **after** the backend D tasks have landed their openapi
> changes. Order below is deliberate: D4 (Task DF-6) comes before D3 (Tasks DF-7…DF-10)
> because it deletes Home's last use of `adminsQuery` and `panelQuery`, which D3
> then replaces in place.

## Frontend ground rules (every task)

- Work in `/Users/vbncursed/programming/rosneft/frontend`. **yarn only, never npm.**
- Type-check with `yarn lint` (`tsc -b --noEmit && oxlint`). A bare
  `tsc --noEmit` checks nothing here: the root tsconfig is solution-style.
- One spec: `yarn vitest run <path>`. Whole gate: `yarn lint && yarn test:coverage && yarn build`
  (coverage thresholds 90/85/90/90; `src/architecture.spec.ts` fails any source
  file without a sibling `*.spec.ts(x)`).
- Stage by path only, never `git add -A` / `git add .` — a parallel session
  works in `backend/`. Check `git diff --cached --name-only` before each commit
  and `git show --stat HEAD | grep -c '^ backend/'` (must print 0) after it.
- Frontend-only commits use `--no-verify` (the pre-commit hook runs the Go
  gate) and say so in the message.
- Never `git stash/checkout/reset/restore`, never `pkill -f vite`.

## API contract the backend must match (the frontend code below is written against it)

Generated types come from `yarn openapi:generate` →
`frontend/src/shared/api/dto.ts` (`openapi-typescript ../backend/services/gateway-service/api/openapi.yaml`).
Schema **names** below are load-bearing: the frontend reads them as
`components["schemas"][…]`.

| Endpoint | Schema(s) | Shape |
|---|---|---|
| `GET /api/territories`, `GET /api/models` | `Territory.lods`, `Model.lods` | `lods: LodArtifact[]`, sorted by `lod`, `[]` when nothing converted. **Not in `required`** — single GET, PATCH, create and `/scene` do not have to fill it, and a required field would break every DTO literal in the specs. |
| `GET /api/territory-admins` | `TerritoryAdminsMap` | `type: object`, `additionalProperties: {type: array, items: {type: string}}` — `{ [slug]: userId[] }` over the caller's visible territories. A territory with no admins may be absent or `[]` (the SPA reads absent, `null` and `[]` alike). |
| `GET /api/metrics/query?panel=a&panel=b&range=1h` | `MetricsPanels` | `type: object`, `additionalProperties: {type: array, items: {$ref: MetricSeries}}`. `panel` becomes `{type: array, items: {enum…}}`, `style: form`, `explode: true`. **A panel whose Prometheus query failed is absent from the map** (one dark card, as today); the request answers 502 only when every panel failed. See finding 3. |
| `POST /api/territories/{slug}/placements/batch` | request `PlacementBatchCreate` `{items: PlacementCreate[]}` (`minItems: 1`, `maxItems: 100`, `required: [items]`); response 201 `type: array, items: {$ref: Placement}` | created rows in request order |
| `PATCH /api/auth/roles/{slug}` | `UpdateRoleRequest` → `{title: string, permissionSlugs?: string[]}` (`title` stays required) | 200 `AuthRole`. **Field is `permissionSlugs`, not `permissions`** — see finding 5. |
| `GET /api/console/summary` | `ConsoleSummary` | below |

`ConsoleSummary` (openapi 3.0.3, so nullability is `nullable: true` on each inline object; `format: int64` integers):

```yaml
ConsoleSummary:
  type: object
  description: >
    One key per console card the caller may open; a card the caller cannot
    open is absent and its source is never queried. A source that failed is
    null for that card only. Cache-Control: no-store.
  properties:
    users:
      type: object
      nullable: true
      required: [total, frozen]
      properties:
        total: { type: integer, format: int64, description: "Accounts in the caller's own GET /api/auth/users?includeDeleted=true answer whose status is not deleted" }
        frozen: { type: integer, format: int64, description: "Of those, status = frozen" }
    roles:
      type: object
      nullable: true
      required: [roles, permissions]
      properties:
        roles: { type: integer, format: int64, description: "len(GET /api/auth/roles) for the caller" }
        permissions: { type: integer, format: int64, description: "len(GET /api/auth/permissions) for the caller" }
    content:
      type: object
      nullable: true
      required: [territories, models]
      properties:
        territories: { type: integer, format: int64, description: "len(GET /api/territories) — the caller's visible set" }
        models: { type: integer, format: int64, description: "len(GET /api/models)" }
    access: { type: integer, nullable: true, description: "Root. Territory-admin assignments summed over the caller's visible territories (= sum of lengths in GET /api/territory-admins)" }
    audit24h: { type: integer, nullable: true, description: "audit:read. Company audit rows with at >= date_trunc('hour', now() at UTC) - 23 hours — the 24 buckets the audit page draws. Exact, not capped." }
    alerts: { type: integer, nullable: true, description: "Root. Distinct (alertname, service, severity) triples with a series labelled alertstate=firing" }
```

Card gates (from `frontend/src/app/router/guard.ts` `SCREENS`, which Home's
console items come from — the backend must use the same):

| key | card open when |
|---|---|
| `users` | `users:read` |
| `roles` | `roles:read` |
| `content` | `territory:write` **or** `model:write` |
| `access` | owner (Root) |
| `audit24h` | `audit:read` |
| `alerts` | owner (Root) |

(`can()` answers true for every grant when the principal is the owner, so Root gets all six.)

Example: `{"users":{"total":12,"frozen":1},"roles":{"roles":5,"permissions":31},"content":{"territories":4,"models":9},"access":7,"audit24h":42,"alerts":0}`

---

### Task DF-0: Regenerate the frontend DTOs

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

**Files:**
- Modify (generated): `frontend/src/shared/api/dto.ts`

**Interfaces:**
- Consumes: the backend D tasks' `backend/services/gateway-service/api/openapi.yaml`.
- Produces: `components["schemas"]` entries `TerritoryAdminsMap`, `MetricsPanels`, `ConsoleSummary`, `PlacementBatchCreate`, optional `lods` on `Territory` and `Model`, optional `permissionSlugs` on `UpdateRoleRequest`.

- [ ] **Step 1: Regenerate**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn openapi:generate`
Expected: exits 0 and rewrites `src/shared/api/dto.ts`. (If it crashes in `ts.factory`, someone removed the `openapi-typescript/typescript: 5.9.3` pin from `resolutions` — put it back, see `frontend/CLAUDE.md`.)

- [ ] **Step 2: Check the contract landed**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && grep -nE '^        (TerritoryAdminsMap|MetricsPanels|ConsoleSummary|PlacementBatchCreate): ' src/shared/api/dto.ts && grep -n 'lods?: components\["schemas"\]\["LodArtifact"\]\[\]' src/shared/api/dto.ts && grep -n 'permissionSlugs?: string\[\]' src/shared/api/dto.ts`
Expected: four schema lines, two `lods?:` lines (Territory, Model), at least one `permissionSlugs?:` line. Anything missing: stop and send it back to the backend task — do not hand-edit `dto.ts`.

- [ ] **Step 3: Nothing else broke**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint`
Expected: exits 0. (If `lods` came out required, every DTO literal in the specs fails here — that is the contract violation, fix the openapi, not the specs.)

- [ ] **Step 4: Commit** (skip if a backend task already committed the regenerated file — `git status --short frontend/src/shared/api/dto.ts` prints nothing)

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/shared/api/dto.ts
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
chore(frontend): regenerate gateway DTOs for the batching endpoints

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-1: Trust a query for a minute; creates say what they changed

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

Why the upload changes ride here: today nothing invalidates `["territories"]`,
`["models"]` or `["jobs"]` after an upload — the catalogs only showed the new row
because staleTime 0 refetched on every mount. With a 60 s staleTime a freshly
uploaded territory would be missing from the catalog for up to a minute.

**Files:**
- Modify: `frontend/src/app/query/query-client.ts:20-22`
- Test: `frontend/src/app/query/query-client.spec.ts`
- Modify: `frontend/src/pages/upload-territory/model/use-upload-territory.ts:1,44-46,101-103`
- Test: `frontend/src/pages/upload-territory/model/use-upload-territory.spec.tsx`
- Modify: `frontend/src/pages/upload-models/model/use-upload-models.ts:1,48-50,149-155`
- Test: `frontend/src/pages/upload-models/model/use-upload-models.spec.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `queryClient` defaults `{ retry: shouldRetry, staleTime: 60_000, refetchOnWindowFocus: false }`. Query keys `["territories"]`, `["models"]`, `["jobs"]` are invalidated after a successful create.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/app/query/query-client.spec.ts` (and add `queryClient` to the import from `./query-client`):

```ts
describe("queryClient defaults", () => {
  it("trusts an answer for a minute and does not refetch on window focus", () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      retry: shouldRetry,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    });
  });
});
```

Append inside `describe("useUploadTerritory", …)` in `use-upload-territory.spec.tsx`:

```ts
  // The catalog and the jobs strip trust their lists for a minute, so a
  // territory that exists only on the gateway would be missing from both.
  it("marks the territory list and the jobs stale once the territory exists", async () => {
    runChunkedUpload.mockResolvedValue({ hash: "h".repeat(64), size: 1024 });
    createTerritory.mockResolvedValue({
      territory: { slug: "refinery-block-c", title: "Refinery Block C" },
      job: { id: "job-1" },
    });
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onFiles([file()]));
    act(() => result.current.onForm({ title: "Refinery Block C" }));

    act(() => result.current.onSubmit());
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ queryKey: ["territories"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["jobs"] });
  });
```

Append inside `describe("useUploadModels", …)` in `use-upload-models.spec.tsx`:

```ts
  it("marks the model list and the jobs stale once a row is created", async () => {
    runChunkedUpload.mockImplementation((f: File) => Promise.resolve({ hash: `h-${f.name}`, size: f.size }));
    createModel.mockResolvedValue({ model: { slug: "a", title: "A" }, job: { id: "job-a" } });
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("a.zip")]));
    act(() => result.current.onTitle(result.current.rows[0].id, "A"));

    act(() => result.current.onRun());
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ queryKey: ["models"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["jobs"] });
  });

  it("marks nothing stale when nothing was created", async () => {
    runChunkedUpload.mockRejectedValue(new Error("network drop"));
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("a.zip")]));
    act(() => result.current.onTitle(result.current.rows[0].id, "A"));

    act(() => result.current.onRun());
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(spy).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/app/query/query-client.spec.ts src/pages/upload-territory/model/use-upload-territory.spec.tsx src/pages/upload-models/model/use-upload-models.spec.tsx`
Expected: 3 failures — the defaults (`staleTime` missing from the received object), and two `expected "spy" to be called with arguments: [ { queryKey: [ 'territories' ] } ]` / `[ 'models' ]`. The "marks nothing stale" case passes already (it guards the next step).

- [ ] **Step 3: Implement**

`frontend/src/app/query/query-client.ts`, replace the `queryClient` export:

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      // A minute of trust: screens that share a list (the catalogs, Content,
      // Home) stop re-asking on every navigation and every tab switch. Polls
      // keep their own refetchInterval; a write invalidates what it changed.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});
```

`frontend/src/pages/upload-territory/model/use-upload-territory.ts`:
change line 1 to `import { useQuery, useQueryClient } from "@tanstack/react-query";`,
add `const client = useQueryClient();` right after `const me = useQuery(meQuery).data ?? null;`,
and replace the `.then(({ territory, job }) => navigate(…))` step with:

```ts
      .then(({ territory, job }) => {
        // The catalog and the jobs strip trust their lists for a minute; this
        // territory and its job are not in either yet.
        void client.invalidateQueries({ queryKey: ["territories"] });
        void client.invalidateQueries({ queryKey: ["jobs"] });
        return navigate({ href: `/territories/${encodeURIComponent(territory.slug)}?jobId=${job.id}` });
      })
```

`frontend/src/pages/upload-models/model/use-upload-models.ts`:
change line 1 to `import { useQuery, useQueryClient } from "@tanstack/react-query";`,
add `const client = useQueryClient();` right after `const me = useQuery(meQuery).data ?? null;`,
and insert before `if (cancelled) return;` (a cancel after a row landed still created it):

```ts
    if (created.length > 0) {
      // The library and the jobs strip trust their lists for a minute; these
      // rows and their jobs are not in either yet.
      void client.invalidateQueries({ queryKey: ["models"] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    }
```

- [ ] **Step 4: Run them to see them pass**

Run: the command from Step 2.
Expected: `Test Files  3 passed`.

- [ ] **Step 5: Whole suite and types**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint && yarn vitest run`
Expected: lint exits 0; every file passes (the specs build their own `QueryClient`, so the defaults change touches no other test).

- [ ] **Step 6: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/app/query/query-client.ts frontend/src/app/query/query-client.spec.ts \
  frontend/src/pages/upload-territory/model/use-upload-territory.ts frontend/src/pages/upload-territory/model/use-upload-territory.spec.tsx \
  frontend/src/pages/upload-models/model/use-upload-models.ts frontend/src/pages/upload-models/model/use-upload-models.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): trust a query for a minute and stop refetching on focus

staleTime 60 s, refetchOnWindowFocus off. Uploads now invalidate the lists
and the jobs they add to — until now only staleTime 0 made a new territory
or model show up in its catalog.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-2: The viewer marks its bundle stale instead of refetching it

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

Every list on the viewer seeds once and is optimistic afterwards (see the hook's
doc comment), so the refetch after each write changes nothing on screen. TanStack
v5 takes `refetchType` inside the filters object (the spec's
`invalidateQueries(["scene", slug], {refetchType})` is the v4 spelling).
`["territories"]` and `["models"]` are marked stale too: a placement changes the
catalog's `placementCount` and the library's `usageCount`, and with a 60 s
staleTime nothing else would.

**Files:**
- Modify: `frontend/src/pages/territory-viewer/model/use-territory-viewer.ts:87-89`
- Test: `frontend/src/pages/territory-viewer/model/use-territory-viewer.spec.tsx:470-477`

**Interfaces:**
- Consumes: Task DF-1 (nothing by name).
- Produces: `onChanged()` invalidates `["scene", slug]`, `["territories"]`, `["models"]` with `refetchType: "none"`.

- [ ] **Step 1: Write the failing test**

Replace the test `"refetches the bundle once the batch has landed"` in `use-territory-viewer.spec.tsx` with:

```ts
    it("marks the bundle and the catalogs stale, without refetching, once the batch has landed", async () => {
      createPlacement.mockResolvedValue(placement(10));
      const r = mount();
      const state = await ready(r);
      const spy = vi.spyOn(client, "invalidateQueries");
      const fetched = getSceneBundle.mock.calls.length;

      await act(async () => state.picker.onPlace("storage-tank-500", 1));

      expect(spy).toHaveBeenCalledWith({ queryKey: ["scene", SLUG], refetchType: "none" });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["territories"], refetchType: "none" });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["models"], refetchType: "none" });
      expect(client.getQueryState(["scene", SLUG])?.isInvalidated).toBe(true);
      expect(getSceneBundle.mock.calls.length).toBe(fetched);
    });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/pages/territory-viewer/model/use-territory-viewer.spec.tsx -t "without refetching"`
Expected: FAIL — `expected "spy" to be called with arguments: [ { queryKey: [ 'scene', 'refinery-block-c' ], refetchType: 'none' } ]`.

- [ ] **Step 3: Implement**

In `use-territory-viewer.ts` replace the `onChanged` callback:

```ts
  // Marked stale, never refetched from here: every list on this page seeds
  // once and is optimistic afterwards, so a refetch changes nothing on screen.
  // The next mount reads fresh — this route, and the catalogs whose placement
  // and usage counts a write here changes.
  const onChanged = useCallback(() => {
    for (const queryKey of [["scene", slug], ["territories"], ["models"]]) {
      void client.invalidateQueries({ queryKey, refetchType: "none" });
    }
  }, [client, slug]);
```

- [ ] **Step 4: Run the viewer spec**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/pages/territory-viewer`
Expected: all files pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/pages/territory-viewer/model/use-territory-viewer.ts frontend/src/pages/territory-viewer/model/use-territory-viewer.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): viewer writes mark the scene stale instead of refetching it

The page's lists are optimistic and seeded once; the refetch after every
placement, panorama, document and measurement write changed nothing on
screen. The bundle and the two catalogs are marked stale for the next mount.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-3: The conversion page reads the scene bundle and lets the stream replace the poll

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

The route (`app/router/territory-route.tsx`) already holds `["scene", slug]` —
its loader primed it — so `GET /territories/{slug}` and `GET …/artifacts` were
duplicates. `hasLod0` is exactly `sceneReady(bundle)`. "Stream open" is read as
"useJobStream is delivering a live frame": before the first frame, after `lost`
and on a platform without `EventSource` it returns null, so the poll stays the
whole story there. `useJobStream`'s terminal-frame invalidation moves from
`["artifacts","territory",slug]` (nothing reads that key for a territory any
more) to `["scene", slug]`.

**Files:**
- Modify: `frontend/src/pages/territory-conversion/model/conversion-view.ts` (add `jobsPoll`)
- Test: `frontend/src/pages/territory-conversion/model/conversion-view.spec.ts`
- Modify: `frontend/src/pages/territory-conversion/model/use-territory-conversion.ts` (whole file)
- Test: `frontend/src/pages/territory-conversion/model/use-territory-conversion.spec.tsx` (whole file)
- Modify: `frontend/src/entities/conversion/model/use-job-stream.ts:24`
- Test: `frontend/src/entities/conversion/model/use-job-stream.spec.tsx:74-82`

**Interfaces:**
- Consumes: `sceneQuery`, `getSceneBundle`, `sceneReady`, `type SceneBundle` from `@/entities/scene`; `pollInterval`, `isLive` from `@/entities/conversion`.
- Produces: `jobsPoll(jobs: TargetJob[] | undefined, ctx: { slug: string; hasLod0: boolean; streamed: TargetJob | null }): number | false` in `conversion-view.ts`. `TerritoryConversionState` unchanged.

- [ ] **Step 1: Write the failing pure test**

In `conversion-view.spec.ts` add `jobsPoll` to the import from `./conversion-view` and append:

```ts
describe("jobsPoll", () => {
  const at = (streamed: TargetJob | null, hasLod0 = false) => ({ slug: "t", hasLod0, streamed });

  it("is off while the stream delivers a live frame, whatever the list says", () => {
    expect(jobsPoll([job()], at(job()))).toBe(false);
    expect(jobsPoll([], at(job({ status: "pending" })))).toBe(false);
  });

  it("is back on the catalog's rule once the stream is lost or finished", () => {
    expect(jobsPoll([job()], at(null))).toBe(5000);
    expect(jobsPoll([job()], at(job({ status: "succeeded" })))).toBe(5000);
  });

  it("waits for a job the reconciler has not queued yet, and stops once a LOD0 is there", () => {
    expect(jobsPoll([], at(null))).toBe(5000);
    expect(jobsPoll([], at(null, true))).toBe(false);
    expect(jobsPoll(undefined, at(null))).toBe(5000);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/pages/territory-conversion/model/conversion-view.spec.ts`
Expected: FAIL — `jobsPoll is not a function` (or the lint-time "has no exported member 'jobsPoll'").

- [ ] **Step 3: Implement `jobsPoll`**

In `conversion-view.ts` change the second import to
`import { isLive, pollInterval, stageLabel, type PipelinePhase, type TargetJob } from "@/entities/conversion";`
and add after `shouldOpenViewer`:

```ts
const WAIT_MS = 5000;

/**
 * The page's jobs poll. Off while the SSE stream delivers a live frame — it
 * is the fresher source and the poll would only repeat it — and back the
 * moment the stream is lost, finishes or never answers (the stream hook is
 * null then). Otherwise the catalog's rule, plus a wait for a job the
 * reconciler has not queued yet: nothing else would bring that row into view.
 */
export function jobsPoll(
  jobs: TargetJob[] | undefined,
  { slug, hasLod0, streamed }: { slug: string; hasLod0: boolean; streamed: TargetJob | null },
): number | false {
  if (streamed && isLive(streamed)) return false;
  const waiting = !hasLod0 && !jobs?.some((j) => j.kind === "territory" && j.slug === slug);
  return pollInterval(jobs) || (waiting ? WAIT_MS : false);
}
```

Run Step 2's command. Expected: PASS.

- [ ] **Step 4: Rewrite the hook spec against the scene bundle**

Replace the top of `use-territory-conversion.spec.tsx` (imports through the fixtures) and every test that used `getTerritory` / `listArtifacts`. The whole file becomes:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { useTerritoryConversion } from "./use-territory-conversion";

const { getSceneBundle, listJobs, useJobStream, navigate } = vi.hoisted(() => ({
  getSceneBundle: vi.fn(),
  listJobs: vi.fn(),
  useJobStream: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/entities/scene", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSceneBundle,
}));
vi.mock("@/entities/conversion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listJobs,
  useJobStream,
}));

const TERRITORY = { slug: "t", title: "Tenant A", sourceBlobHash: "a".repeat(64), placementCount: 0 };
const ZERO = { x: 0, y: 0, z: 0 };
const LOD0 = {
  lod: 0,
  hash: "h0",
  size: 1,
  vertices: 1,
  faces: 1,
  bboxMin: ZERO,
  bboxMax: { x: 1, y: 1, z: 1 },
  chain: [{ lod: 0, hash: "h0", size: 1 }],
};
const bundle = (artifact: typeof LOD0 | null = null) => ({
  territory: TERRITORY,
  artifact,
  placements: [],
  modelOptions: [],
  panoramas: [],
  documents: [],
  measurements: [],
});
const RUNNING = { kind: "territory", slug: "t", status: "running", progress: 0.4, stage: "parsing", errorMessage: null };
const FAILED = { kind: "territory", slug: "t", status: "failed", progress: null, stage: null, errorMessage: "blob not found" };

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
// A fresh client per mount: two mounts in one test are two page loads, and a
// shared cache would answer the second one with the first one's rows.
const render = (jobId: string | null = null) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useTerritoryConversion("t", jobId), { wrapper });
};
const ready = async (r: ReturnType<typeof render>) => {
  await waitFor(() => expect(r.result.current.status).toBe("ready"));
  const s = r.result.current;
  if (s.status !== "ready") throw new Error("not ready");
  return s;
};

describe("useTerritoryConversion", () => {
  beforeEach(() => {
    getSceneBundle.mockReset().mockResolvedValue(bundle());
    listJobs.mockReset().mockResolvedValue([]);
    useJobStream.mockReset().mockReturnValue(null);
    navigate.mockReset();
  });

  it("is loading until the bundle and the jobs answered, then queued with no record and no LOD0", async () => {
    const r = render();
    expect(r.result.current.status).toBe("loading");
    const s = await ready(r);
    expect(s.phase).toBe("queued");
    expect(s.job).toBeNull();
    expect(s.hasLod0).toBe(false);
    expect(s.territory).toEqual(TERRITORY);
  });

  // The territory and its LOD chain come from the bundle the route already
  // holds; the page asks for nothing per territory beyond it.
  it("asks for the bundle and the jobs, and nothing else", async () => {
    await ready(render());
    expect(getSceneBundle).toHaveBeenCalledTimes(1);
    expect(getSceneBundle).toHaveBeenCalledWith("t");
    expect(listJobs).toHaveBeenCalledTimes(1);
  });

  it("is missing on a 404, unavailable on any other first failure", async () => {
    getSceneBundle.mockRejectedValue(new HttpError(404, null, "Territory not found"));
    const r = render();
    await waitFor(() => expect(r.result.current.status).toBe("missing"));

    getSceneBundle.mockResolvedValue(bundle());
    // messageOf only surfaces an HttpError's own message; a bare Error reads as the generic sentence.
    listJobs.mockRejectedValue(new HttpError(503, null, "jobs down"));
    const r2 = render();
    await waitFor(() => expect(r2.result.current).toEqual({ status: "unavailable", error: "jobs down" }));
  });

  it("reads the phase off the polled row: running, and failed with the worker's message", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    expect((await ready(render())).phase).toBe("running");

    listJobs.mockResolvedValue([FAILED]);
    getSceneBundle.mockResolvedValue(bundle(LOD0));
    const s = await ready(render());
    expect(s.phase).toBe("failed");
    expect(s.job?.errorMessage).toBe("blob not found");
    expect(s.hasLod0).toBe(true);
  });

  it("lets the stream outrank the poll once it has answered", async () => {
    listJobs.mockResolvedValue([{ ...RUNNING, progress: 0.1 }]);
    useJobStream.mockReturnValue({ ...RUNNING, progress: 0.9 });
    const s = await ready(render("j1"));
    expect(useJobStream).toHaveBeenCalledWith("j1", "t");
    expect(s.job?.progress).toBe(0.9);

    // The terminal frame lands a round trip before the bundle does; the page
    // must draw the last step rather than flash back to "queued".
    useJobStream.mockReturnValue({ ...RUNNING, status: "succeeded", stage: "registering", progress: 1 });
    expect((await ready(render("j1"))).phase).toBe("running");
  });

  it("reads a mount that is already ready without navigating or touching the scene cache", async () => {
    getSceneBundle.mockResolvedValue(bundle(LOD0));
    const r = render();
    expect((await ready(r)).phase).toBe("ready");
    expect(client.getQueryState(["scene", "t"])?.isInvalidated).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  // There is no handoff to another app: the route reads ["scene", slug] and
  // branches on it, so a finish watched from this page has to re-read that key
  // or the reader sits on a "ready" conversion page forever.
  it("re-reads the scene bundle when a running conversion finishes on this page", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    const r = render();
    expect((await ready(r)).phase).toBe("running");

    listJobs.mockResolvedValue([]);
    getSceneBundle.mockResolvedValue(bundle(LOD0));
    await client.refetchQueries({ queryKey: ["jobs"] });
    await waitFor(() => expect(getSceneBundle).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(r.result.current).toMatchObject({ status: "ready", phase: "ready" }));
  });

  // A finish watched on this page opens the viewer, in-app and exactly once.
  // The jobId is dropped with the query: the route branches on its absence, so
  // navigating to the bare path is what turns this page into the viewer.
  it("navigates to the territory path once when a watched conversion finishes", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    const r = render("j1");
    expect((await ready(r)).phase).toBe("running");
    expect(navigate).not.toHaveBeenCalled();

    listJobs.mockResolvedValue([]);
    getSceneBundle.mockResolvedValue(bundle(LOD0));
    await client.refetchQueries({ queryKey: ["jobs"] });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/territories/t" }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  const jobsRefetchInterval = () => {
    const q = client.getQueryCache().find({ queryKey: ["jobs"] })!;
    // refetchInterval lives on the observer's options, which QueryOptions does not declare.
    const interval = (q.options as { refetchInterval?: unknown }).refetchInterval;
    return typeof interval === "function" ? (interval(q) as number | false) : interval;
  };

  it("polls while it waits for a job that does not exist yet, and stops once a LOD0 lands", async () => {
    await ready(render());
    expect(jobsRefetchInterval()).toBe(5000);

    getSceneBundle.mockResolvedValue(bundle(LOD0));
    await ready(render());
    expect(jobsRefetchInterval()).toBe(false);

    getSceneBundle.mockResolvedValue(bundle());
    listJobs.mockResolvedValue([RUNNING]);
    await ready(render());
    expect(jobsRefetchInterval()).toBe(5000);
  });

  it("leaves the jobs to the stream while it delivers a live frame", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    useJobStream.mockReturnValue(RUNNING);
    await ready(render("j1"));
    expect(jobsRefetchInterval()).toBe(false);
  });

  it("keeps the page when a background refetch fails", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    const r = render();
    await ready(r);
    listJobs.mockRejectedValue(new Error("blip"));
    await client.refetchQueries({ queryKey: ["jobs"] });
    expect(r.result.current.status).toBe("ready");
  });
});
```

In `use-job-stream.spec.tsx` replace the terminal-frame test:

```ts
  it("re-reads the scene bundle and the jobs list on a terminal frame", () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useJobStream("j1", "t"), { wrapper });
    act(() => handlers.onJob(job()));
    expect(spy).not.toHaveBeenCalled();
    act(() => handlers.onJob(job({ status: "succeeded" })));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["scene", "t"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["jobs"] });
  });
```

- [ ] **Step 5: Run them to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/pages/territory-conversion src/entities/conversion/model/use-job-stream.spec.tsx`
Expected: the hook spec fails (it still calls `getTerritory`/`listArtifacts`, which are real and unmocked — `loading` never becomes `ready`, or `expected "spy" … [ 'scene', 't' ]` for the stream spec).

- [ ] **Step 6: Implement**

`frontend/src/entities/conversion/model/use-job-stream.ts` line 24 becomes:

```ts
          void client.invalidateQueries({ queryKey: ["scene", slug] });
```

`frontend/src/pages/territory-conversion/model/use-territory-conversion.ts` becomes:

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { finishedSince, jobsQuery, listJobs, useJobStream, type TargetJob } from "@/entities/conversion";
import { getSceneBundle, sceneQuery, sceneReady } from "@/entities/scene";
import { territoryPath } from "@/entities/territory";
import { HttpError, messageOf } from "@/shared/api";
import { unanswered } from "@/shared/lib/unanswered";
import {
  jobsPoll,
  phaseOf,
  shouldOpenViewer,
  type Phase,
  type TerritoryConversionPageProps,
} from "./conversion-view";

export type TerritoryConversionState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unavailable"; error: string }
  | ({ status: "ready" } & TerritoryConversionPageProps);

/**
 * The conversion page's data: the scene bundle the route already holds (the
 * territory and its LOD chain), and the job on record — from the SSE channel
 * when a jobId is known and answering, otherwise the jobs poll, which stays
 * off while the stream is live. Ready once both have answered, missing only on
 * a genuine 404, and a background refetch failure never blanks the page.
 */
export function useTerritoryConversion(slug: string, jobId: string | null): TerritoryConversionState {
  const client = useQueryClient();
  const navigate = useNavigate();
  // queryFn stays a direct import so a spec's vi.mock of the barrel reaches the fetch.
  const scene = useQuery({ ...sceneQuery(slug), queryFn: () => getSceneBundle(slug) });
  const hasLod0 = scene.data ? sceneReady(scene.data) : false;
  const streamed = useJobStream(jobId, slug);
  const jobs = useQuery({
    ...jobsQuery,
    queryFn: listJobs,
    refetchInterval: (q) => jobsPoll(q.state.data, { slug, hasLod0, streamed }),
  });

  // A territory whose job just left the list has a new LOD chain (or, after a
  // failure, the same old one): re-read the bundle the route branches on — a
  // territory that finishes under the reader's eyes has to become the viewer,
  // and this key is the only thing that tells the route so.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    for (const { kind, slug: targetSlug } of finishedSince(previousJobs.current, jobs.data)) {
      if (kind === "territory") void client.invalidateQueries({ queryKey: ["scene", targetSlug] });
    }
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);

  const polled = jobs.data?.find((j) => j.kind === "territory" && j.slug === slug);
  // The stream, once it has answered, is up to four seconds fresher than the poll.
  const job = streamed ?? polled;
  const phase: Phase | null = scene.data && jobs.data ? phaseOf(hasLod0, job) : null;

  // A finish watched here opens the viewer, in-app. The target is the bare
  // path: dropping the `?jobId` is exactly what makes the route re-branch, and
  // a `navigate` keeps the document.
  const previousPhase = useRef<Phase | null>(null);
  useEffect(() => {
    if (phase === null) return;
    if (shouldOpenViewer(previousPhase.current, phase)) void navigate({ to: territoryPath(slug) });
    previousPhase.current = phase;
  }, [phase, slug, navigate]);

  if (scene.isPending || jobs.isPending) return { status: "loading" };
  const sceneError = unanswered(scene);
  if (sceneError instanceof HttpError && sceneError.status === 404) return { status: "missing" };
  const otherError = sceneError ?? unanswered(jobs);
  if (otherError) return { status: "unavailable", error: messageOf(otherError) };

  return {
    status: "ready",
    territory: scene.data!.territory,
    phase: phase!,
    job: job ?? null,
    hasLod0,
  };
}
```

- [ ] **Step 7: Run them to see them pass**

Run: the command from Step 5.
Expected: all pass.

- [ ] **Step 8: Types, then the route and the screen**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint && yarn vitest run src/app src/pages/territory-conversion src/entities/conversion`
Expected: exit 0, all pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/pages/territory-conversion/model/conversion-view.ts frontend/src/pages/territory-conversion/model/conversion-view.spec.ts \
  frontend/src/pages/territory-conversion/model/use-territory-conversion.ts frontend/src/pages/territory-conversion/model/use-territory-conversion.spec.tsx \
  frontend/src/entities/conversion/model/use-job-stream.ts frontend/src/entities/conversion/model/use-job-stream.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): conversion page reads the route's scene bundle; stream pauses the poll

GET /territories/{slug} and /artifacts duplicated the bundle the route
already primed. The 5 s jobs poll is off while the SSE stream delivers a
live frame and back when it is lost or finishes.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-4: User mutations write the answer instead of refetching the list

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

Every call but delete answers the full `AuthUser`; delete answers 204, and what a
deleted account looks like (status, dates) is the gateway's to say, so delete
alone still invalidates.

**Files:**
- Modify: `frontend/src/pages/users/model/use-users.ts:40-56,99-135`
- Test: `frontend/src/pages/users/model/use-users.spec.tsx`

**Interfaces:**
- Consumes: `usersQuery` (key `["users"]`), `type User` from `@/entities/user`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `use-users.spec.tsx`, replace the last two lines of `"freezes only after confirmation, then reports and refetches"` and rename it:

```ts
  it("freezes only after confirmation, then writes the answer into the list without a refetch", async () => {
    // …body unchanged down to the notice assertion…
    expect(result.current.notices[0]?.message).toBe("Account frozen");
    expect(result.current.users.users?.[0].status).toBe("frozen");
    expect(listCalls()).toBe(1);
  });
```

Append to `"creates a user, selects them and closes the dialog"`:

```ts
    expect(result.current.users.users?.map((u) => u.id)).toEqual(["u-1", "u-2"]);
    expect(result.current.users.selected?.id).toBe("u-2");
    expect(listCalls()).toBe(1);
```

Append to `"replaces the role set of whoever is open"`:

```ts
    expect(result.current.users.users?.[0].roleSlugs).toEqual(["guest", "admin"]);
    expect(listCalls()).toBe(1);
```

Add a new test:

```ts
  // A delete answers 204: there is no user to write, and what a deleted
  // account looks like is the gateway's to say.
  it("refetches the list after a delete", async () => {
    const base = fetchMock.getMockImplementation() as (u: string, i?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? new Response(null, { status: 204 }) : base(url, init),
    );
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("u-1"));
    act(() => result.current.ask("delete"));
    act(() => result.current.confirm());
    await waitFor(() => expect(listCalls()).toBe(2));
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/pages/users/model/use-users.spec.tsx`
Expected: FAIL — `expected 2 to be 1` on `listCalls()` in the freeze, create and roles tests (the refetch still happens). The delete test passes already.

- [ ] **Step 3: Implement**

In `use-users.ts` change `run`'s return type so the answer can be written:

```ts
const run = ({ kind, user }: PendingAction): Promise<User | void> => {
```

Below `const refresh = …` add:

```ts
  // The gateway answers every change but a delete with the whole user: write
  // it into the list rather than asking for the list again.
  const put = (user: User) =>
    client.setQueryData(usersQuery.queryKey, (list) =>
      list && (list.some((u) => u.id === user.id) ? list.map((u) => (u.id === user.id ? user : u)) : [...list, user]),
    );
```

Replace the three `onSuccess` handlers:

```ts
  const action = useMutation({
    mutationFn: run,
    onSuccess: (user, { kind }) => {
      notify.success(DONE[kind]);
      if (user) put(user);
      else void refresh();
    },
    onError: fail,
    onSettled: () => setPending(null),
  });

  const creation = useMutation({
    mutationFn: createUser,
    onSuccess: (user) => {
      notify.success("User created");
      setCreating(false);
      setSelectedId(user.id);
      put(user);
    },
    onError: fail,
  });

  const roleChange = useMutation({
    mutationFn: ({ id, roleSlugs }: { id: string; roleSlugs: string[] }) =>
      setUserRoles(id, roleSlugs),
    onSuccess: (user) => {
      notify.success("Roles updated");
      setAddingRole(false);
      put(user);
    },
    onError: fail,
  });
```

Update the hook's doc comment's last sentence to: "every outcome reports through notify and lands in the list from the gateway's own answer (a delete, which has none, refetches)." — and the `unanswered` comment's "every mutation calls refresh()" to "a delete calls refresh()".

- [ ] **Step 4: Run to see them pass**

Run: the command from Step 2. Expected: PASS.

- [ ] **Step 5: Types**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/pages/users/model/use-users.ts frontend/src/pages/users/model/use-users.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): user mutations write the returned user into the list

Freeze, unfreeze, restore, 2FA policy, roles and create all answer the whole
user; only delete (204) still refetches.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-5: Catalogs read `lods` off the list payload (D2)

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

What the mappers read from `Artifact`: `toTerritoryCard`, `toModelCard`,
`toContentItem` and the Content inspector read **only `lod` and `size`**
(`lodLabel`, `totalSize`, `.length`). Nothing reads `bbox`, `contentType`,
`createdAt`, `vertices` or `faces`, so `LodArtifact` is enough — no field is
missing. The domain gets `LodSummary = Pick<Artifact, "lod" | "size">`; the
mapper signatures keep their `artifacts` parameter (widened to `LodSummary[]`),
so their specs do not change. `lods` is optional on `Territory`/`Model` because
only the list endpoints carry it.

A finished job used to invalidate `["artifacts", kind, slug]`; the LODs now ride
on the list, so it invalidates the list — once, however many finished.

Behaviour change to expect: Home's model cards passed `[]` for artifacts, so
every model on Home read "pending"/"—"; they now show their real status and size.

**Files:**
- Modify: `frontend/src/entities/content/model/artifact.ts`, `frontend/src/entities/content/index.ts`
- Modify: `frontend/src/entities/territory/model/territory.ts`, `frontend/src/entities/territory/api/to-territory.ts`, `frontend/src/entities/territory/model/territory-card.ts`
- Test: `frontend/src/entities/territory/api/to-territory.spec.ts`
- Modify: `frontend/src/entities/model/model/model.ts`, `frontend/src/entities/model/api/to-model.ts`, `frontend/src/entities/model/model/model-card.ts`
- Test: `frontend/src/entities/model/api/to-model.spec.ts`
- Modify: `frontend/src/pages/content/model/catalog.ts` (param types only)
- Modify: `frontend/src/pages/territory-catalog/model/use-territory-catalog.ts` + spec
- Modify: `frontend/src/pages/model-library/model/use-model-library.ts` + spec
- Modify: `frontend/src/pages/content/model/use-content.ts` + spec
- Modify: `frontend/src/pages/home/model/use-home.ts` + spec

**Interfaces:**
- Consumes: DTO `Territory.lods?: LodArtifact[]`, `Model.lods?: LodArtifact[]` (Task DF-0).
- Produces: `export type LodSummary = Pick<Artifact, "lod" | "size">` from `@/entities/content`; `Territory.lods?: LodSummary[]`; `Model.lods?: LodSummary[]`; `lodLabel(a: LodSummary[])`, `totalSize(a: LodSummary[])`; `toTerritoryCard(t, artifacts: LodSummary[], job?)`; `toModelCard(m, artifacts: LodSummary[], job?)`; `toContentItem(kind, entity, artifacts: LodSummary[], job?)`; `inspectorDetails(item, artifacts: LodSummary[], updatedAt, job?)`; `ContentState.artifactsOf: (kind, slug) => LodSummary[]`.

- [ ] **Step 1: Write the failing mapper tests**

Append inside `describe("toTerritory", …)`:

```ts
  // Only GET /api/territories carries the LOD summary; absent means "not listed", not "none".
  it("keeps the list payload's LODs, and leaves them out when the answer has none", () => {
    const lods = [{ lod: 0, hash: "h0", size: 30 }, { lod: 1, hash: "h1", size: 12 }];
    expect(toTerritory({ slug: "t", title: "T", sourceBlobHash: "a".repeat(64), lods }).lods).toEqual(lods);
    expect(toTerritory({ slug: "t", title: "T", sourceBlobHash: "a".repeat(64) })).not.toHaveProperty("lods");
  });
```

Append inside `describe("toModel", …)`:

```ts
  it("keeps the list payload's LODs, and leaves them out when the answer has none", () => {
    const lods = [{ lod: 0, hash: "h0", size: 30 }];
    expect(toModel({ slug: "m", title: "M", sourceBlobHash: "b".repeat(64), lods }).lods).toEqual(lods);
    expect(toModel({ slug: "m", title: "M", sourceBlobHash: "b".repeat(64) })).not.toHaveProperty("lods");
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/entities/territory/api/to-territory.spec.ts src/entities/model/api/to-model.spec.ts`
Expected: FAIL — `expected undefined to deeply equal [ { lod: 0, … } ]`.

- [ ] **Step 3: Implement the domain field and the widened helpers**

`entities/content/model/artifact.ts` — add after the `Artifact` type, and widen the two helpers:

```ts
/** One LOD as the list payloads carry it — the level and the bytes are all a catalog reads. */
export type LodSummary = Pick<Artifact, "lod" | "size">;

/** "LOD 0-2", "LOD 0", or "—" when nothing has been converted. */
export function lodLabel(artifacts: LodSummary[]): string {
  // body unchanged
}

export const totalSize = (artifacts: LodSummary[]): number =>
  artifacts.reduce((sum, a) => sum + a.size, 0);
```

`entities/content/index.ts`: `export { lodLabel, totalSize, type Artifact, type LodSummary, type Vec3 } from "./model/artifact";`

`entities/territory/model/territory.ts`: add `import type { LodSummary } from "@/entities/content";` and, after `placementCount`:

```ts
  /** Converted LODs, sorted by level. Only the list endpoint fills it. */
  lods?: LodSummary[];
```

`entities/territory/api/to-territory.ts`, after the `placementCount` line:

```ts
    ...(d.lods ? { lods: d.lods } : {}),
```

`entities/model/model/model.ts`: add `import type { LodSummary } from "@/entities/content";` and, after `usageCount`:

```ts
  /** Converted LODs, sorted by level. Only the list endpoint fills it. */
  lods?: LodSummary[];
```

`entities/model/api/to-model.ts`, after the `usageCount` line:

```ts
    ...(d.lods ? { lods: d.lods } : {}),
```

Widen the mapper parameters (bodies unchanged):
- `entities/territory/model/territory-card.ts`: import `type LodSummary` instead of `type Artifact`; `sizeChip = (artifacts: LodSummary[])`; `toTerritoryCard(t: Territory, artifacts: LodSummary[], job?: TargetJob)`; doc comment "Maps a territory plus its LODs and (maybe) live job onto one catalog card."
- `entities/model/model/model-card.ts`: import `type LodSummary` instead of `type Artifact`; `toModelCard(model: Model, artifacts: LodSummary[], job?: TargetJob)`.
- `pages/content/model/catalog.ts`: import `type LodSummary` instead of `type Artifact`; `toContentItem(kind, entity, artifacts: LodSummary[], job?)`; `inspectorDetails(item, artifacts: LodSummary[], updatedAt, job?)`.

Run Step 2's command. Expected: PASS.

- [ ] **Step 4: Rewrite the four hook specs**

`pages/territory-catalog/model/use-territory-catalog.spec.tsx`:
- `T1` gains `lods: [{ lod: 0, hash: "h", size: 1024 }]`, `T2` gains `lods: []`.
- Delete the two `/api/territories/t-…/artifacts` routes from the `beforeEach` mock.
- Rename the first test to `"is loading until the list and the jobs answered, then ready with cards"` (body unchanged).
- Add after it:

```ts
  it("asks for the list once, never once per row", async () => {
    const { result } = renderHook(() => useTerritoryCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(
      fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/territories")),
    ).toEqual(["/api/territories"]);
  });
```

- Replace `"re-reads a row's artifacts once its job stops being live, turning the card ready"` with:

```ts
  it("re-reads the list once a row's job stops being live, turning the card ready", async () => {
    JOBS = [
      { id: "j1", kind: "territory", slug: "t-1", status: "running", progress: 0.5, stage: "parsing" },
    ];
    let listCalls = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/territories" && method === "GET") {
        listCalls += 1;
        return json([listCalls === 1 ? { ...T1, lods: [] } : T1, T2]);
      }
      if (url === "/api/jobs" && method === "GET") return json(JOBS);
      return json({ code: "forbidden", message: "You don't have permission to do this" }, 403);
    });

    const { result } = renderHook(() => useTerritoryCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.cards?.[0]).toMatchObject({ slug: "t-1", status: "converting" });
    expect(listCalls).toBe(1);

    JOBS = [];
    await act(async () => {
      await client.refetchQueries({ queryKey: ["jobs"] });
    });
    await waitFor(() => expect(listCalls).toBe(2));
    await waitFor(() =>
      expect(result.current.cards?.[0]).toMatchObject({ slug: "t-1", status: "ready" }),
    );
  });
```

`pages/model-library/model/use-model-library.spec.tsx`:
- Replace `let M1_ARTIFACTS …` with `let M1_LODS: unknown[] = [{ lod: 0, hash: "h", size: 1024 }];`, and in `beforeEach` `M1_LODS = [{ lod: 0, hash: "h", size: 1024 }];`.
- The list route becomes `if (url === "/api/models" && method === "GET") return json([{ ...M1, lods: M1_LODS }, { ...M2, lods: [] }]);` and the two `/api/models/m-…/artifacts` routes are deleted.
- Rename the first test to `"is loading until the list and the jobs answered, then ready with cards"`.
- Add:

```ts
  it("asks for the list once, never once per row", async () => {
    const { result } = renderHook(() => useModelLibrary(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(
      fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/models")),
    ).toEqual(["/api/models"]);
  });
```

- In `"re-reads a row's artifacts once its job leaves the live set…"` rename to `"re-reads the list once a row's job leaves the live set, so the card catches up to ready"`, replace `M1_ARTIFACTS = [];` with `M1_LODS = [];`, replace the block that set `M1_ARTIFACTS = [{ slug: "m-1", … }]` (and its three-line comment) with:

```ts
    // The worker finishes and the list now carries m-1's LOD0; nothing but
    // the finished job refetches the list.
    M1_LODS = [{ lod: 0, hash: "h", size: 1024 }];
```

`pages/content/model/use-content.spec.tsx`:
- `TERRITORY` gains `lods: [{ lod: 0, hash: "h", size: 1024 }]`, `MODEL` gains `lods: []`.
- Delete the two `…/artifacts` routes from `beforeEach`.
- Rename the first test to `"is loading until the lists and the jobs answered, then ready with rows and storage"`.
- In `"selects a row and hands the inspector its artifacts and date"` the expectation becomes `expect(result.current.artifactsOf("territory", "t-1")).toEqual([{ lod: 0, hash: "h", size: 1024 }]);`.
- Replace `"re-reads a row's artifacts once its job stops being live"` with:

```ts
  it("re-reads the list a finished job's row sits in, and only that one", async () => {
    JOBS = [{ id: "j1", kind: "territory", slug: "t-1", status: "running" }];
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const gets = (url: string) => fetchMock.mock.calls.filter(([u]) => u === url).length;
    const territories = gets("/api/territories");
    const models = gets("/api/models");
    JOBS = [];
    await act(async () => {
      await client.refetchQueries({ queryKey: ["jobs"] });
    });
    await waitFor(() => expect(gets("/api/territories")).toBe(territories + 1));
    expect(gets("/api/models")).toBe(models);
  });

  it("asks for the two lists, the jobs and the principal — never once per row", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/territories") return json(["a", "b", "c"].map((slug) => ({ ...TERRITORY, slug })));
      if (url === "/api/models") return json(["x", "y"].map((slug) => ({ ...MODEL, slug })));
      if (url === "/api/jobs") return json([]);
      return json(PRINCIPAL);
    });
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toHaveLength(5);
    expect(result.current.storageBytes).toBe(3 * 1024);
    expect(fetchMock.mock.calls.map(([u]) => String(u)).toSorted()).toEqual([
      "/api/auth/me",
      "/api/jobs",
      "/api/models",
      "/api/territories",
    ]);
  });
```

`pages/home/model/use-home.spec.tsx`:
- `TERRITORIES` gain `lods: n === 5 ? [{ lod: 0, hash: "h", size: 1024 }] : []` inside the map; delete `const LOD0 …`.
- In `ROUTER` delete the two `/artifacts` lines.
- First test: rename to `"is loading until territories, models and jobs answered, then ready"`, and replace its last two lines with:

```ts
    // The LODs ride on the list: no card asks for its own.
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/artifacts"))).toBe(false);
```

- Replace `"re-reads a shown territory's artifacts once its job leaves the live set"` with:

```ts
  it("re-reads the territory list once a shown territory's job leaves the live set", async () => {
    JOBS = [
      { id: "j1", kind: "territory", slug: "t5", status: "running", progress: 0.5, stage: "parsing" },
    ];
    let listCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/territories") {
        listCalls += 1;
        return json(listCalls === 1 ? TERRITORIES.map((t) => ({ ...t, lods: [] })) : TERRITORIES);
      }
      return ROUTER(url);
    });
    const { result } = renderHook(() => useHome(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.territories.cards[0]).toMatchObject({ slug: "t5", status: "converting" });
    expect(listCalls).toBe(1);

    JOBS = [];
    await act(async () => {
      await client.refetchQueries({ queryKey: ["jobs"] });
    });
    await waitFor(() => expect(listCalls).toBe(2));
    await waitFor(() =>
      expect(result.current.territories.cards[0]).toMatchObject({ slug: "t5", status: "ready" }),
    );
  });
```

- [ ] **Step 5: Run to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/pages/territory-catalog src/pages/model-library src/pages/content src/pages/home/model/use-home.spec.tsx`
Expected: FAIL — rows read "pending" (the hooks still ask `/artifacts`, which now fall through to the 403 branch and never answer) and the "asks for the list once" cases see `/api/territories/t-1/artifacts`.

- [ ] **Step 6: Implement the four hooks**

`pages/territory-catalog/model/use-territory-catalog.ts`:
- Imports: `import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";` and delete the `artifactsQuery` import.
- Delete the `refs` / `artifacts = useQueries(…)` block.
- The doc comment becomes: "Everything the Territory Catalog screen decides: the list — which carries every territory's LODs — and the jobs poll. Two queries whatever the row count."
- `cards`:

```ts
  const cards = territories.data
    ? territories.data.map((t) => toTerritoryCard(t, t.lods ?? [], jobOf(t.slug)))
    : null;
```

- `failed` / `loading`:

```ts
  const failed = unanswered(territories) ?? unanswered(jobs);
  const loading = territories.isPending || jobs.isPending;
```

- The effect:

```ts
  // A territory whose job just finished has new LODs (or, after a failure,
  // the same old ones), and they ride on the list: re-read it once, however
  // many finished. /api/jobs drops a succeeded job on its next poll and
  // nothing else would ever refetch the list.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    if (finishedSince(previousJobs.current, jobs.data).some((j) => j.kind === "territory"))
      void client.invalidateQueries({ queryKey: ["territories"] });
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);
```

`pages/model-library/model/use-model-library.ts` — the same four edits with `models`/`"model"`/`["models"]`:

```ts
  const cards = models.data
    ? models.data.map((m) => toModelCard(m, m.lods ?? [], jobOf(m.slug)))
    : null;
  // …
  const failed = unanswered(models) ?? unanswered(jobs);
  const loading = models.isPending || jobs.isPending;

  // A model whose job just finished has new LODs, and they ride on the list:
  // re-read it once, or the card drops back to "pending" on the stale list.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    if (finishedSince(previousJobs.current, jobs.data).some((j) => j.kind === "model"))
      void client.invalidateQueries({ queryKey: ["models"] });
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);
```

(doc comment: "Everything the Model Library screen decides: the list — which carries every model's LODs — and the jobs poll. Two queries whatever the row count.")

`pages/content/model/use-content.ts`:
- Imports: `useMutation, useQuery, useQueryClient` (no `useQueries`); from `@/entities/content` import `totalSize, type ContentItem, type ContentKind, type LodSummary` (drop `artifactsQuery`, `type Artifact`).
- `ContentState.artifactsOf: (kind: ContentKind, slug: string) => LodSummary[];`
- Delete `refs` and the `useQueries` block; replace `artifactsOf` with:

```ts
  const artifactsOf = (kind: ContentKind, slug: string) => entityOf(kind, slug)?.lods ?? [];
```

  (move it below `entityOf`, which it now reads).
- `items`:

```ts
  const items = listed
    ? [
        ...territories.data.map((t) =>
          toContentItem("territory", t, t.lods ?? [], jobOf("territory", t.slug)),
        ),
        ...models.data.map((m) => toContentItem("model", m, m.lods ?? [], jobOf("model", m.slug))),
      ]
    : null;
```

- `failed` / `loading`:

```ts
  const failed = unanswered(territories) ?? unanswered(models) ?? unanswered(jobs);
  const loading = territories.isPending || models.isPending || jobs.isPending;
```

- The effect:

```ts
  // A row whose job just finished has new LODs, and they ride on its list:
  // re-read each list a finished job sits in, once.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    const kinds = new Set(finishedSince(previousJobs.current, jobs.data).map((j) => j.kind));
    for (const kind of kinds) void client.invalidateQueries({ queryKey: LIST_KEY[kind] });
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);
```

- `storageBytes`:

```ts
    storageBytes: [...(territories.data ?? []), ...(models.data ?? [])].reduce(
      (sum, e) => sum + totalSize(e.lods ?? []),
      0,
    ),
```

- Doc comment: "Everything the Content screen decides. Two lists — each row carries its own LODs — and the jobs poll; ready once all three have answered."

`pages/home/model/use-home.ts`:
- Imports: `useInfiniteQuery, useQuery, useQueryClient` (no `useQueries`); delete the `artifactsQuery` import.
- Delete the `artifacts = useQueries(…)` block.
- Effect:

```ts
  // A shown card whose job just finished has new LODs, and they ride on its
  // list: re-read each list a finished job sits in, or the card flips back to
  // pending.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    const kinds = new Set(finishedSince(previousJobs.current, jobs.data).map((j) => j.kind));
    for (const kind of kinds)
      void client.invalidateQueries({ queryKey: [kind === "territory" ? "territories" : "models"] });
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);
```

- `failed` / `loading`:

```ts
  const failed = unanswered(territories) ?? unanswered(models) ?? unanswered(jobs);
  const loading = territories.isPending || models.isPending || jobs.isPending;
```

- `modelCards`: `toModelCard(m, m.lods ?? [], jobOf("model", m.slug))`.
- territory cards: `bareCard(toTerritoryCard(t, t.lods ?? [], jobOf("territory", t.slug)))`.
- Doc comment: "Everything Home decides. Three lists (each row carries its own LODs), the jobs poll and the first page of the reader's own journal — nothing per row. The feed never blocks the page."

- [ ] **Step 7: Run to see them pass**

Run: the command from Step 5. Expected: all pass.

- [ ] **Step 8: Types and the full gate**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint && yarn test:coverage`
Expected: lint exit 0; every test passes; coverage over 90/85/90/90. (`artifactsQuery` stays: `pages/model-detail` still reads it.)

- [ ] **Step 9: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/entities/content frontend/src/entities/territory frontend/src/entities/model \
  frontend/src/pages/content frontend/src/pages/territory-catalog frontend/src/pages/model-library \
  frontend/src/pages/home/model/use-home.ts frontend/src/pages/home/model/use-home.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): catalogs read LODs off the list payload, not one query per row

Territory catalog, model library, Content and Home drop their
useQueries(artifactsQuery) loops; the mappers read t.lods / m.lods. A
finished job now re-reads the list it belongs to. Home's model cards show
their real status and size instead of reading an empty artifact list.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-6: Home's console counters come from one summary call (D4)

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

Hint wording stays here; the hint functions take numbers. The audit hint loses
its `200+` cap: the cap existed only because the counter fetched at most
`WINDOW_LIMIT` rows, and the server now counts exactly.

**Files:**
- Create: `frontend/src/pages/home/model/console-summary.ts`
- Test: `frontend/src/pages/home/model/console-summary.spec.ts`
- Modify: `frontend/src/pages/home/model/console-hints.ts`
- Test: `frontend/src/pages/home/model/console-hints.spec.ts`
- Modify: `frontend/src/pages/home/model/use-console-counters.ts` (whole file)
- Test: `frontend/src/pages/home/model/use-console-counters.spec.tsx` (whole file)

**Interfaces:**
- Consumes: DTO `components["schemas"]["ConsoleSummary"]` (Task DF-0).
- Produces: `consoleSummaryQuery` (key `["console-summary"]`, `staleTime: 0`), `type ConsoleSummary`; `usersHint(total: number, frozen: number)`, `rolesHint(roles: number, permissions: number)`, `auditHint(events: number)`, `metricsHint(firing: number)`; `contentHint`, `accessHint`, `hintOf`, `STATIC_HINTS`, `ConsoleKey`, `ConsoleHint` unchanged. `useConsoleCounters(items)` signature unchanged.

- [ ] **Step 1: Write the failing tests**

`frontend/src/pages/home/model/console-summary.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleSummaryQuery } from "./console-summary";

afterEach(() => vi.unstubAllGlobals());

describe("consoleSummaryQuery", () => {
  it("keys the summary once and never trusts it past the render that asked — the gateway says no-store", () => {
    expect(consoleSummaryQuery.queryKey).toEqual(["console-summary"]);
    expect(consoleSummaryQuery.staleTime).toBe(0);
  });

  it("reads GET /api/console/summary", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ access: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const run = consoleSummaryQuery.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual({ access: 3 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/console/summary");
  });
});
```

`frontend/src/pages/home/model/console-hints.spec.ts` becomes:

```ts
import { describe, expect, it } from "vitest";
import { accessHint, auditHint, contentHint, hintOf, metricsHint, rolesHint, usersHint } from "./console-hints";

describe("console hints", () => {
  it("counts users, naming the frozen only when there are any", () => {
    expect(usersHint(2, 0)).toBe("2 users");
    expect(usersHint(2, 1)).toBe("2 users · 1 frozen");
    expect(usersHint(1, 0)).toBe("1 user");
  });
  it("counts roles and permissions", () => {
    expect(rolesHint(3, 24)).toBe("3 roles · 24 permissions");
    expect(rolesHint(1, 1)).toBe("1 role · 1 permission");
  });
  it("counts content, grants and alerts", () => {
    expect(contentHint(4, 57)).toBe("4 territories · 57 models");
    expect(accessHint(6)).toBe("6 grants");
    expect(accessHint(1)).toBe("1 grant");
    expect(metricsHint(0)).toBe("no alerts firing");
    expect(metricsHint(1)).toBe("1 alert firing");
    expect(metricsHint(2)).toBe("2 alerts firing");
  });
  it("counts the events of the last 24 hours, exactly", () => {
    expect(auditHint(2)).toBe("2 events · 24h");
    expect(auditHint(1)).toBe("1 event · 24h");
    expect(auditHint(250)).toBe("250 events · 24h");
  });
  it("answers static while locked or loading, unavailable when failed, and the count otherwise", () => {
    expect(hintOf("users", { locked: true, loading: false, failed: false }, "12 users")).toEqual({ kind: "static", text: "people and roles" });
    expect(hintOf("users", { locked: false, loading: true, failed: false }, null)).toEqual({ kind: "static", text: "people and roles" });
    expect(hintOf("users", { locked: false, loading: false, failed: true }, null)).toEqual({ kind: "unavailable", text: "count unavailable" });
    expect(hintOf("users", { locked: false, loading: false, failed: false }, "12 users")).toEqual({ kind: "count", text: "12 users" });
    // An answered query that still could not be counted is unavailable, not blank.
    expect(hintOf("users", { locked: false, loading: false, failed: false }, null)).toEqual({ kind: "unavailable", text: "count unavailable" });
    // A key Home has no static line for says nothing rather than "undefined".
    expect(hintOf("tasks", { locked: true, loading: false, failed: false }, null)).toEqual({ kind: "static", text: "" });
  });
});
```

`frontend/src/pages/home/model/use-console-counters.spec.tsx` becomes:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleNavItem } from "@/widgets/console-nav";
import { useConsoleCounters } from "./use-console-counters";

const ITEMS: ConsoleNavItem[] = [
  { key: "users", label: "Users", href: "/console/users" },
  { key: "roles", label: "Roles & Permissions", href: "/console/roles" },
  { key: "content", label: "Content", href: "/console/content" },
  { key: "access", label: "Territory access", href: "/console/access" },
  { key: "audit", label: "Audit journal", href: "/console/audit" },
  { key: "metrics", label: "Metrics", href: "/console/metrics" },
];
const SUMMARY = {
  users: { total: 2, frozen: 1 },
  roles: { roles: 2, permissions: 3 },
  content: { territories: 2, models: 1 },
  access: 2,
  audit24h: 1,
  alerts: 1,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const urls = () => fetchMock.mock.calls.map(([u]) => String(u));

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn(async (url: string) =>
    url === "/api/console/summary" ? json(SUMMARY) : json({ code: "not_found", message: "no" }, 404),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useConsoleCounters", () => {
  it("counts every open card off one summary call", async () => {
    const { result } = renderHook(() => useConsoleCounters(ITEMS), { wrapper });
    await waitFor(() =>
      expect(Object.values(result.current).every((h) => h.kind === "count")).toBe(true),
    );
    expect(result.current.users.text).toBe("2 users · 1 frozen");
    expect(result.current.roles.text).toBe("2 roles · 3 permissions");
    expect(result.current.content.text).toBe("2 territories · 1 model");
    expect(result.current.access.text).toBe("2 grants");
    expect(result.current.audit.text).toBe("1 event · 24h");
    expect(result.current.metrics.text).toBe("1 alert firing");
    expect(urls()).toEqual(["/api/console/summary"]);
  });

  it("answers a locked card's static line whatever the summary holds", async () => {
    const locked = ITEMS.map((i) =>
      i.key === "users" || i.key === "metrics" ? { ...i, disabled: true } : i,
    );
    const { result } = renderHook(() => useConsoleCounters(locked), { wrapper });
    await waitFor(() => expect(result.current.roles.kind).toBe("count"));
    expect(result.current.users).toEqual({ kind: "static", text: "people and roles" });
    expect(result.current.metrics).toEqual({ kind: "static", text: "conversion health and alerts" });
  });

  it("asks nothing when every card is locked", () => {
    const { result } = renderHook(
      () => useConsoleCounters(ITEMS.map((i) => ({ ...i, disabled: true }))),
      { wrapper },
    );
    expect(result.current.users).toEqual({ kind: "static", text: "people and roles" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is static while loading and unavailable when the summary never answered", async () => {
    fetchMock.mockImplementation(async () => json({ code: "internal", message: "down" }, 500));
    const { result } = renderHook(() => useConsoleCounters(ITEMS.slice(0, 1)), { wrapper });
    expect(result.current.users).toEqual({ kind: "static", text: "people and roles" });
    await waitFor(() =>
      expect(result.current.users).toEqual({ kind: "unavailable", text: "count unavailable" }),
    );
  });

  // A source that failed is null for its card only; a card the gateway left
  // out is one it would not answer for. Neither is a zero.
  it("reads a nulled or missing card as count unavailable and counts the rest", async () => {
    fetchMock.mockImplementation(async () => json({ ...SUMMARY, users: null, alerts: undefined }));
    const { result } = renderHook(() => useConsoleCounters(ITEMS), { wrapper });
    await waitFor(() => expect(result.current.roles.kind).toBe("count"));
    expect(result.current.users).toEqual({ kind: "unavailable", text: "count unavailable" });
    expect(result.current.metrics).toEqual({ kind: "unavailable", text: "count unavailable" });
  });

  it("reads zero grants as a count, not as not-yet", async () => {
    fetchMock.mockImplementation(async () => json({ access: 0 }));
    const { result } = renderHook(
      () => useConsoleCounters(ITEMS.filter((i) => i.key === "access")),
      { wrapper },
    );
    await waitFor(() => expect(result.current.access).toEqual({ kind: "count", text: "0 grants" }));
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/pages/home/model`
Expected: FAIL — `Failed to resolve import "./console-summary"`, the hints spec (`usersHint(2, 0)` → `users.filter is not a function`), and the counters spec (`urls()` lists `/api/auth/users…`, `/api/territories`, …).

- [ ] **Step 3: Implement**

`frontend/src/pages/home/model/console-summary.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";

export type ConsoleSummary = components["schemas"]["ConsoleSummary"];

/**
 * Home's console counts in one call: the gateway answers only the cards the
 * caller may open and counts each server-side. `no-store` there, so staleTime
 * 0 here — a count that just changed on a console screen must not wait out
 * the client's minute.
 */
export const consoleSummaryQuery = queryOptions({
  queryKey: ["console-summary"],
  queryFn: () => httpGet<ConsoleSummary>("/api/console/summary"),
  staleTime: 0,
});
```

`frontend/src/pages/home/model/console-hints.ts` — replace the imports and the four hint functions (keep `ConsoleHint`, `STATIC_HINTS`, `ConsoleKey`, `contentHint`, `accessHint`, `hintOf` exactly as they are):

```ts
import { plural } from "./home-view";

// …ConsoleHint, STATIC_HINTS, ConsoleKey unchanged…

/** Deleted accounts are not users; the gateway counts them out. */
export const usersHint = (total: number, frozen: number): string =>
  frozen > 0 ? `${plural(total, "user", "users")} · ${frozen} frozen` : plural(total, "user", "users");

export const rolesHint = (roles: number, permissions: number): string =>
  `${plural(roles, "role", "roles")} · ${plural(permissions, "permission", "permissions")}`;

// …contentHint, accessHint unchanged…

/** The same 24 hourly buckets the audit page draws, counted by the gateway. */
export const auditHint = (events: number): string => `${plural(events, "event", "events")} · 24h`;

export const metricsHint = (firing: number): string =>
  firing === 0 ? "no alerts firing" : `${plural(firing, "alert", "alerts")} firing`;

// …hintOf unchanged…
```

`frontend/src/pages/home/model/use-console-counters.ts` becomes:

```ts
import { useQuery } from "@tanstack/react-query";
import { unanswered } from "@/shared/lib/unanswered";
import type { ConsoleNavItem } from "@/widgets/console-nav";
import {
  accessHint,
  auditHint,
  contentHint,
  hintOf,
  metricsHint,
  rolesHint,
  usersHint,
  type ConsoleHint,
  type ConsoleKey,
} from "./console-hints";
import { consoleSummaryQuery, type ConsoleSummary } from "./console-summary";

/**
 * One count per open console card, all from `GET /api/console/summary`. A
 * locked card reads its static line whatever the summary holds, and nothing
 * is asked when every card is locked — a disabled query stays `isPending`
 * forever, so `isLoading` is what "loading" reads here. A card the summary
 * nulls (its source failed) or leaves out reads "count unavailable".
 */
export function useConsoleCounters(items: ConsoleNavItem[]): Record<ConsoleKey, ConsoleHint> {
  const open = (key: string) => items.some((i) => i.key === key && !i.disabled);
  const summary = useQuery({ ...consoleSummaryQuery, enabled: items.some((i) => !i.disabled) });
  const failed = unanswered(summary) !== null;

  const hint = (key: ConsoleKey, count: (s: ConsoleSummary) => string | null): ConsoleHint =>
    hintOf(
      key,
      { locked: !open(key), loading: summary.isLoading, failed },
      summary.data ? count(summary.data) : null,
    );

  return {
    users: hint("users", ({ users }) => (users ? usersHint(users.total, users.frozen) : null)),
    roles: hint("roles", ({ roles }) => (roles ? rolesHint(roles.roles, roles.permissions) : null)),
    content: hint("content", ({ content }) =>
      content ? contentHint(content.territories, content.models) : null,
    ),
    access: hint("access", ({ access }) => (access != null ? accessHint(access) : null)),
    audit: hint("audit", ({ audit24h }) => (audit24h != null ? auditHint(audit24h) : null)),
    metrics: hint("metrics", ({ alerts }) => (alerts != null ? metricsHint(alerts) : null)),
  };
}
```

- [ ] **Step 4: Run to see them pass**

Run: the command from Step 2. Expected: all pass.

- [ ] **Step 5: Types and the Home screen**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint && yarn vitest run src/pages/home`
Expected: exit 0, all pass. (`adminsQuery` and `panelQuery` now have one consumer each — the access page and the metrics page — which DF-7 and DF-8 replace.)

- [ ] **Step 6: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/pages/home/model/console-summary.ts frontend/src/pages/home/model/console-summary.spec.ts \
  frontend/src/pages/home/model/console-hints.ts frontend/src/pages/home/model/console-hints.spec.ts \
  frontend/src/pages/home/model/use-console-counters.ts frontend/src/pages/home/model/use-console-counters.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): Home's console counters read one summary call

GET /api/console/summary replaces users, roles, permissions, territories,
models, one admins call per territory, the 24h audit window and the alerts
panel. The hint wording stays here; the hints take numbers. The audit count
is exact now, so its 200+ cap is gone.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-7: Territory access reads every admin set in one call (D3.1)

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

After DF-6 the access page is the last consumer of `adminsQuery` /
`getTerritoryAdmins`; both are replaced, not kept beside the new ones.
`setTerritoryAdmins` (the PUT) stays.

**Files:**
- Modify: `frontend/src/entities/territory/api/admins-gateway.ts`
- Test: `frontend/src/entities/territory/api/admins-gateway.spec.ts`
- Modify: `frontend/src/entities/territory/api/admins-query.ts`
- Test: `frontend/src/entities/territory/api/admins-query.spec.ts`
- Modify: `frontend/src/entities/territory/index.ts:16-17`
- Modify: `frontend/src/pages/territory-access/model/use-territory-access.ts`
- Test: `frontend/src/pages/territory-access/model/use-territory-access.spec.tsx`

**Interfaces:**
- Consumes: DTO `components["schemas"]["TerritoryAdminsMap"]` (Task DF-0).
- Produces: `listTerritoryAdmins(): Promise<Record<string, string[]>>`; `territoryAdminsQuery` (key `["territory-admins"]`). Removed: `getTerritoryAdmins`, `adminsQuery`.

- [ ] **Step 1: Write the failing tests**

In `admins-gateway.spec.ts` change the import to `import { listTerritoryAdmins, setTerritoryAdmins } from "./admins-gateway";` and replace the first test:

```ts
  it("reads every territory's admin set in one call, defending against the gateway's null for none", async () => {
    fetchMock.mockResolvedValueOnce(json({ "t-1": ["u-1", "u-2"], "t-2": null }));
    await expect(listTerritoryAdmins()).resolves.toEqual({ "t-1": ["u-1", "u-2"], "t-2": [] });
    expect(request()).toEqual({ url: "/api/territory-admins", method: "GET", body: undefined });
  });
```

`admins-query.spec.ts` becomes:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("./admins-gateway", () => ({ listTerritoryAdmins: vi.fn(async () => ({ "t-1": ["u-1"] })) }));
const { territoryAdminsQuery } = await import("./admins-query");

describe("territoryAdminsQuery", () => {
  it("is one cache entry for every territory and delegates to the gateway", async () => {
    expect(territoryAdminsQuery.queryKey).toEqual(["territory-admins"]);
    const run = territoryAdminsQuery.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual({ "t-1": ["u-1"] });
  });
});
```

In `use-territory-access.spec.tsx`:
- In `beforeEach` replace the two `/api/territories/t-…/admins` GET routes with
  `if (url === "/api/territory-admins" && method === "GET") return json({ "t-1": ["u-1"], "t-2": null });`
  (keep the `/api/territories/t-1/admins` PUT route).
- Add a helper under `puts`: `const adminReads = () => fetchMock.mock.calls.filter(([u, i]) => u === "/api/territory-admins" && !(i as RequestInit | undefined)?.method).length;`
- Rename the first test to `"is loading until the admin map answered, then ready with rows and grants"` and append `expect(adminReads()).toBe(1);` plus `expect(fetchMock.mock.calls.some(([u]) => /\/api\/territories\/[^/]+\/admins$/.test(String(u)))).toBe(false);`.
- In `"saves the whole draft with one PUT, toasts and refetches that territory only"` rename to `"saves the whole draft with one PUT, toasts and re-reads the admin map once"` and replace the two trailing count assertions with `await waitFor(() => expect(adminReads()).toBe(2));`.
- In `"keeps the saved draft on screen until the refetch lands"` the override becomes:

```ts
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/territory-admins" && (init?.method ?? "GET") === "GET") {
        refetches += 1;
        if (refetches > 1) {
          await held;
          return json({ "t-1": ["u-1", "u-2"], "t-2": null });
        }
      }
      return base(url, init);
    });
```

- [ ] **Step 2: Run to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/entities/territory/api src/pages/territory-access`
Expected: FAIL — `listTerritoryAdmins is not a function`, `territoryAdminsQuery` undefined, and the page spec stuck in `loading` (the per-territory GETs now 403).

- [ ] **Step 3: Implement**

`entities/territory/api/admins-gateway.ts`:

```ts
import { httpGet, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";

type AdminsMap = components["schemas"]["TerritoryAdminsMap"];

const route = (slug: string) => `/api/territories/${encodeURIComponent(slug)}/admins`;

/**
 * Every visible territory's admin set in one call. Root only on the gateway;
 * the screen behind this is owner-gated to match. `?? []`: a Go nil slice
 * marshals as JSON null when nobody is assigned.
 */
export const listTerritoryAdmins = async (): Promise<Record<string, string[]>> =>
  Object.fromEntries(
    Object.entries(await httpGet<AdminsMap>("/api/territory-admins")).map(([slug, ids]) => [slug, ids ?? []]),
  );

/** Replaces the whole set — the gateway's PUT semantics. */
export const setTerritoryAdmins = async (slug: string, userIds: string[]): Promise<void> => {
  await httpPut<unknown>(route(slug), { userIds });
};
```

`entities/territory/api/admins-query.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { listTerritoryAdmins } from "./admins-gateway";

/** One cache entry for every territory's admin set. */
export const territoryAdminsQuery = queryOptions({
  queryKey: ["territory-admins"],
  queryFn: listTerritoryAdmins,
});
```

`entities/territory/index.ts` lines 16-17:

```ts
export { listTerritoryAdmins, setTerritoryAdmins } from "./api/admins-gateway";
export { territoryAdminsQuery } from "./api/admins-query";
```

`pages/territory-access/model/use-territory-access.ts`:
- Imports: `import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";` and in the `@/entities/territory` import replace `adminsQuery` with `territoryAdminsQuery`.
- Doc comment first sentence: "Everything the Territory access screen decides. One admin map for every territory; drafts are kept per slug so switching territories loses nothing; save is one PUT of the whole set."
- Replace `const slugs = …` and the whole `useQueries` block with:

```ts
  const admins = useQuery(territoryAdminsQuery);
  const adminsBySlug = admins.data ?? {};
```

- Replace every `admins.bySlug` with `adminsBySlug` (four places: `rows`, `savedIds`, the returned `adminsBySlug`, `grantsOf`).
- `onSuccess`:

```ts
    onSuccess: () => {
      notify.success("Access saved");
      void client.invalidateQueries({ queryKey: territoryAdminsQuery.queryKey });
    },
```

- The comment above `failed` ("a save invalidates one admins query") becomes "a save re-reads the admin map"; then:

```ts
  const failed = unanswered(territories) ?? unanswered(users) ?? unanswered(admins);
  const loading = territories.isPending || users.isPending || admins.isPending;
```

- [ ] **Step 4: Run to see them pass**

Run: the command from Step 2. Expected: all pass.

- [ ] **Step 5: Types — no stragglers**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint && grep -rn "adminsQuery\|getTerritoryAdmins" src | grep -v territoryAdminsQuery`
Expected: lint exit 0; grep prints nothing.

- [ ] **Step 6: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/entities/territory/api/admins-gateway.ts frontend/src/entities/territory/api/admins-gateway.spec.ts \
  frontend/src/entities/territory/api/admins-query.ts frontend/src/entities/territory/api/admins-query.spec.ts \
  frontend/src/entities/territory/index.ts \
  frontend/src/pages/territory-access/model/use-territory-access.ts frontend/src/pages/territory-access/model/use-territory-access.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): territory access reads every admin set in one call

GET /api/territory-admins replaces one GET per territory; a save re-reads
the map once. adminsQuery and getTerritoryAdmins had no other consumer and
are gone.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-8: The metrics page asks for every panel in one request (D3.2)

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

Today it is 20 requests per 30 s tick (`PANELS` has 20 ids — the spec's "19" is
off by one). A panel the gateway leaves out of the map is one dark card,
as a failed panel is today; the whole page is unavailable only when the request
itself never answered. What changes: a failed refetch now keeps the *whole*
previous dashboard (one query), where it used to keep each panel's own last data.

**Files:**
- Modify: `frontend/src/entities/metric/api/metrics-gateway.ts`
- Test: `frontend/src/entities/metric/api/metrics-gateway.spec.ts`
- Modify: `frontend/src/entities/metric/api/panel-query.ts`
- Test: `frontend/src/entities/metric/api/panel-query.spec.ts`
- Modify: `frontend/src/entities/metric/index.ts:22-23`
- Modify: `frontend/src/pages/metrics/model/use-metrics.ts`
- Test: `frontend/src/pages/metrics/model/use-metrics.spec.tsx`

**Interfaces:**
- Consumes: DTO `components["schemas"]["MetricsPanels"]`, `components["schemas"]["MetricSeries"]` (Task DF-0).
- Produces: `fetchPanels(panels: PanelId[], range: MetricsRange): Promise<PanelSeries>`; `type PanelSeries = Partial<Record<PanelId, MetricSeries[]>>`; `panelsQuery(range: MetricsRange)` (key `["metrics", range]`, 30 s poll, `staleTime: 0`). Removed: `fetchPanel`, `panelQuery`.

- [ ] **Step 1: Write the failing tests**

`metrics-gateway.spec.ts` — import `fetchPanels` instead of `fetchPanel`, keep `series`, `json`, `fetchMock`, `request`, and replace the `describe` body:

```ts
describe("metrics gateway", () => {
  it("asks for every panel in one request and maps each one's series", async () => {
    fetchMock.mockResolvedValueOnce(json({ "red-rate": [series], alerts: [] }));
    const out = await fetchPanels(["red-rate", "alerts"], "1h");
    expect(request()).toEqual({
      url: "/api/metrics/query?panel=red-rate&panel=alerts&range=1h",
      method: "GET",
    });
    expect(out).toEqual({
      "red-rate": [{ label: "gateway", points: [{ t: 1, v: 1 }], labels: { service: "gateway" } }],
      alerts: [],
    });
  });

  it("defaults missing labels and points, and reads a null panel as no series", async () => {
    fetchMock.mockResolvedValueOnce(json({ "services-up": [{ label: "gateway" }], alerts: null }));
    await expect(fetchPanels(["services-up", "alerts"], "15m")).resolves.toEqual({
      "services-up": [{ label: "gateway", points: [], labels: {} }],
      alerts: [],
    });
  });

  it("leaves a panel the gateway could not answer out of the map", async () => {
    fetchMock.mockResolvedValueOnce(json({ "red-rate": [series] }));
    expect(await fetchPanels(["red-rate", "alerts"], "1h")).not.toHaveProperty("alerts");
  });

  it("rejects with the status and the gateway's message on failure", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "unavailable", message: "Prometheus unreachable" }, 502));
    await expect(fetchPanels(["red-rate"], "1h")).rejects.toMatchObject({
      status: 502,
      message: "Prometheus unreachable",
    });
  });
});
```

`panel-query.spec.ts` becomes:

```ts
import { describe, expect, it, vi } from "vitest";
import { PANELS } from "../model/panel-catalog";

vi.mock("./metrics-gateway", () => ({ fetchPanels: vi.fn(async () => ({ alerts: [] })) }));
const { panelsQuery } = await import("./panel-query");
const { fetchPanels } = await import("./metrics-gateway");

describe("panelsQuery", () => {
  it("keys by range, polls every 30s in a visible tab, never trusts staleness", () => {
    const q = panelsQuery("15m");
    expect(q.queryKey).toEqual(["metrics", "15m"]);
    expect(q.refetchInterval).toBe(30_000);
    expect(q.refetchIntervalInBackground).toBe(false);
    expect(q.staleTime).toBe(0);
  });

  it("asks the gateway for every panel in the catalog at once", async () => {
    const run = panelsQuery("1h").queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual({ alerts: [] });
    expect(fetchPanels).toHaveBeenCalledWith(Object.keys(PANELS), "1h");
  });
});
```

`use-metrics.spec.tsx`:
- Replace the `fetchMock = vi.fn(…)` in `beforeEach` with:

```ts
  fetchMock = vi.fn(async (url: string) => {
    if (allFail) return json(UNREACHABLE, 502);
    const answered = new URL(url, "http://x").searchParams
      .getAll("panel")
      .filter((panel) => panel !== "stat-errors" && !failing.has(panel));
    return json(Object.fromEntries(answered.map((p) => [p, PANEL_BODY[p] ?? [dto(p, [0.5, 1])]])));
  });
```

- Delete `panelOf`; keep `rangeOf`; add `const panelsOf = (url: string) => new URL(url, "http://x").searchParams.getAll("panel");`
- In `"keeps the screen ready when one panel fails, and marks that card"` the expected result becomes `{ kind: "unavailable", message: "Prometheus did not answer" }`.
- Replace `"keeps a panel's last data on screen when its refetch fails — stale beats empty"` with:

```ts
  it("keeps the last dashboard on screen when a refetch fails — stale beats empty", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.results["red-rate"]?.kind).toBe("value"));

    allFail = true;
    await act(() => client.refetchQueries({ queryKey: ["metrics", "1h"] }));

    // The refetch really happened and really failed — otherwise the assertion
    // below would pass just as well if the query key had drifted.
    expect(client.getQueryState(["metrics", "1h"])?.status).toBe("error");
    expect(result.current.status).toBe("ready");
    expect(result.current.results["red-rate"]).toEqual({
      kind: "value",
      series: [{ label: "gateway", points: points(140, 142), labels: {} }],
    });
  });
```

- In `"does not count 0 firing when the alerts panel failed…"` the expected alerts result becomes `{ kind: "unavailable", message: "Prometheus did not answer" }`.
- Rename `"is unavailable only when every panel failed"` to `"is unavailable when the request never answered"` (body unchanged).
- In `"re-queries every panel on a range change"` replace the `asked` helper with:

```ts
    const asked = (range: string) =>
      new Set(
        fetchMock.mock.calls
          .map(([url]) => url as string)
          .filter((url) => rangeOf(url) === range)
          .flatMap(panelsOf),
      );
```

- Add:

```ts
  it("asks once per tick, for every panel", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(panelsOf(fetchMock.mock.calls[0][0] as string)).toHaveLength(20);

    await act(() => client.refetchQueries({ queryKey: ["metrics", "1h"] }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/entities/metric/api src/pages/metrics`
Expected: FAIL — `fetchPanels is not a function`, `panelsQuery` undefined, and the page spec (the old hook sends 20 single-panel requests, each answered with a map, so every card reads the wrong shape; "asks once per tick" sees 20 calls).

- [ ] **Step 3: Implement**

`entities/metric/api/metrics-gateway.ts`:

```ts
import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { PanelId } from "../model/panel-catalog";
import type { MetricsRange } from "../model/range";
import type { MetricSeries } from "../model/series";

type SeriesDto = components["schemas"]["MetricSeries"];
type PanelsDto = components["schemas"]["MetricsPanels"];

/** Each answered panel's series; a panel Prometheus could not answer is absent. */
export type PanelSeries = Partial<Record<PanelId, MetricSeries[]>>;

const toSeries = (s: SeriesDto): MetricSeries => ({
  label: s.label,
  points: s.points ?? [],
  labels: s.labels ?? {},
});

/** Every asked panel over one range, in one request. A null panel is no series. */
export async function fetchPanels(panels: PanelId[], range: MetricsRange): Promise<PanelSeries> {
  const query = new URLSearchParams([...panels.map((p) => ["panel", p]), ["range", range]]);
  const body = await httpGet<PanelsDto>(`/api/metrics/query?${query.toString()}`);
  return Object.fromEntries(
    Object.entries(body).map(([id, series]) => [id, (series ?? []).map(toSeries)]),
  );
}
```

`entities/metric/api/panel-query.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { PANELS, type PanelId } from "../model/panel-catalog";
import type { MetricsRange } from "../model/range";
import { fetchPanels } from "./metrics-gateway";

const POLL_MS = 30_000;
const ALL = Object.keys(PANELS) as PanelId[];

/** Every panel over one range, one cache entry, polled while the tab is visible. The route answers no-store, so there is no ETag to lose. */
export const panelsQuery = (range: MetricsRange) =>
  queryOptions({
    queryKey: ["metrics", range],
    queryFn: () => fetchPanels(ALL, range),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
```

`entities/metric/index.ts` lines 22-23:

```ts
export { fetchPanels, type PanelSeries } from "./api/metrics-gateway";
export { panelsQuery } from "./api/panel-query";
```

`pages/metrics/model/use-metrics.ts`:
- Imports: `import { useQuery } from "@tanstack/react-query";`; from `@/entities/metric` import `alertsOf, PANELS, panelsQuery, servicesOf, type AlertSummary, type MetricsRange, type PanelId, type PanelSeries, type ServiceHealth` (drop `panelQuery`).
- Below `const ALL …` add:

```ts
const NO_ANSWER = "Prometheus did not answer";

/** A panel the gateway left out of an answered map failed on its own: one dark card. */
const resultOf = (data: PanelSeries | undefined, id: PanelId): PanelResult => {
  if (!data) return { kind: "loading" };
  const series = data[id];
  return series ? { kind: "value", series } : { kind: "unavailable", message: NO_ANSWER };
};
```

- Doc comment: "Everything the Metrics screen decides. One query for every panel, keyed on the range the route holds; a panel the gateway could not answer is one dark card, and only a request that never answered makes the dashboard unavailable."
- Replace the `useQueries` block, `series`, and the `status`/`error`/`results` fields:

```ts
  const panels = useQuery(panelsQuery(range));
  const failed = unanswered(panels);
  const results = Object.fromEntries(ALL.map((id) => [id, resultOf(panels.data, id)])) as Partial<
    Record<PanelId, PanelResult>
  >;

  const series = (id: PanelId) => {
    const r = results[id];
    return r?.kind === "value" ? r.series : [];
  };
  const alertsResult = results.alerts;
  const alerts = alertsOf(series("alerts"));

  return {
    status: panels.isPending ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    results,
    // services, alerts, firingCount and the UI state unchanged
```

- [ ] **Step 4: Run to see them pass**

Run: the command from Step 2. Expected: all pass.

- [ ] **Step 5: Types — no stragglers**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint && grep -rn "panelQuery\|fetchPanel\b" src`
Expected: lint exit 0; grep prints nothing.

- [ ] **Step 6: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/entities/metric/api/metrics-gateway.ts frontend/src/entities/metric/api/metrics-gateway.spec.ts \
  frontend/src/entities/metric/api/panel-query.ts frontend/src/entities/metric/api/panel-query.spec.ts \
  frontend/src/entities/metric/index.ts \
  frontend/src/pages/metrics/model/use-metrics.ts frontend/src/pages/metrics/model/use-metrics.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): metrics page asks for every panel in one request

One GET /api/metrics/query?panel=…&panel=…&range=… per 30 s tick instead of
twenty. A panel the gateway leaves out is one dark card; only a request that
never answered makes the dashboard unavailable.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-9: Placing N objects is one batch POST (D3.3)

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

One catalog transaction: the batch lands whole or not at all, so the
"half-way" branch and its test go. The picker caps the count at 99
(`widgets/model-picker/ui/place-objects-modal.tsx` `MAX`), under the endpoint's
100. `createPlacement` has no other caller and is replaced. `placing` keeps its
`{done, total}` shape so the modal is untouched; it now reads `{0, N}` for the
whole request (see finding 6).

**Files:**
- Modify: `frontend/src/entities/placement/api/placements-gateway.ts:10-15`
- Test: `frontend/src/entities/placement/api/placements-gateway.spec.ts`
- Modify: `frontend/src/entities/placement/index.ts:14-19`
- Modify: `frontend/src/features/placements-editor/model/use-placements-editor.ts:1-20,35-40,64-107`
- Test: `frontend/src/features/placements-editor/model/use-placements-editor.spec.tsx`
- Test: `frontend/src/pages/territory-viewer/model/use-territory-viewer.spec.tsx`

**Interfaces:**
- Consumes: `POST /api/territories/{slug}/placements/batch` (Task DF-0 types are not needed — the body is `PlacementCreate[]`, the answer is `Placement[]`).
- Produces: `createPlacements(territorySlug: string, items: PlacementCreate[]): Promise<Placement[]>`. Removed: `createPlacement`. `usePlacementsEditor` API unchanged.

- [ ] **Step 1: Write the failing tests**

`placements-gateway.spec.ts`: import `createPlacements` instead of `createPlacement`; replace the first test:

```ts
  it("POSTs the whole batch to the batch route and maps every created row", async () => {
    fetchMock.mockResolvedValueOnce(json([DTO, { ...DTO, id: 8 }]));
    await expect(createPlacements("north", [BODY, BODY])).resolves.toMatchObject([{ id: 7 }, { id: 8 }]);
    expect(request()).toEqual({
      url: "/api/territories/north/placements/batch",
      method: "POST",
      body: { items: [BODY, BODY] },
    });
  });
```

and in `"percent-encodes the territory slug in every route"` replace `await createPlacement("a b/c", BODY);` with:

```ts
    fetchMock.mockResolvedValueOnce(json([DTO]));
    await createPlacements("a b/c", [BODY]);
```

`use-placements-editor.spec.tsx`:
- Import and mock `createPlacements` instead of `createPlacement` (import list, `vi.mock` factory, `beforeEach` reset).
- Replace the first four tests (`creates N instances…`, `exposes placing progress…`, `a refused create…`, `a batch that fails half-way…`) with:

```ts
  it("creates N instances in one batch, in a row along X at the real-world scale, and resolves to the last id", async () => {
    vi.mocked(createPlacements).mockImplementation(async (_slug, items) =>
      items.map((body, i) => ({ ...placement(100 + i), ...body }) as Placement),
    );
    const { result } = editor();

    let last: number | null = null;
    await act(async () => {
      last = await result.current.s.create("tank", 2);
    });

    expect(createPlacements).toHaveBeenCalledOnce();
    const items = vi.mocked(createPlacements).mock.calls[0][1];
    expect(items[0].position?.x).toBe(0);
    // 2 scene units per GLB times the 0.1 scale, plus a tenth for the gap.
    expect(items[1].position?.x).toBeCloseTo(0.22, 10);
    expect(items[0].scale).toEqual({ x: 0.1, y: 0.1, z: 0.1 });
    expect(result.current.s.placements).toHaveLength(2);
    expect(result.current.s.placements[0].chain).toEqual(CHAIN);
    expect(last).toBe(101);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("exposes placing progress while the batch is in flight", async () => {
    let release!: () => void;
    vi.mocked(createPlacements).mockImplementationOnce(
      () => new Promise<Placement[]>((res) => (release = () => res([placement(1), placement(2)]))),
    );
    const { result } = editor();

    let done!: Promise<number | null>;
    act(() => {
      done = result.current.s.create("tank", 2);
    });
    await waitFor(() => expect(result.current.s.placing).toEqual({ done: 0, total: 2 }));

    await act(async () => {
      release();
      await done;
    });
    expect(result.current.s.placing).toBeNull();
  });

  // One transaction on the gateway: a refused batch created nothing.
  it("a refused batch toasts and leaves the list as it was", async () => {
    vi.mocked(createPlacements).mockRejectedValue(new HttpError(403, null, "You don't have permission to do this"));
    const { result } = editor([placement(1)]);

    let out: number | null = 7;
    await act(async () => {
      out = await result.current.s.create("tank", 2);
    });

    expect(out).toBeNull();
    expect(result.current.s.placements.map((p) => p.id)).toEqual([1]);
    expect(result.current.s.placing).toBeNull();
    expect(result.current.notices[0]?.message).toBe("You don't have permission to do this");
    expect(onChanged).not.toHaveBeenCalled();
  });
```

- In the two `visiblePanoramaIds` tests: `vi.mocked(createPlacements).mockImplementation(async (_slug, items) => items.map((body) => ({ ...placement(1), ...body }) as Placement));` and read `vi.mocked(createPlacements).mock.calls[0][1][0].visiblePanoramaIds`.

`use-territory-viewer.spec.tsx`:
- Rename `createPlacement` → `createPlacements` in the `vi.hoisted` destructure and object, the `vi.mock("@/entities/placement", …)` factory and the `beforeEach` reset.
- `"writes one placement per instance, opens the form on the last and closes the picker"` → rename to `"writes every instance in one batch, opens the form on the last and closes the picker"`, set up `createPlacements.mockResolvedValueOnce([placement(10), placement(11)]);` and assert `expect(createPlacements).toHaveBeenCalledTimes(1);`.
- In the DF-2 test and in `"makes a newly placed object visible in every panorama there is"`: `createPlacements.mockResolvedValue([placement(10)]);` and the latter asserts

```ts
      expect(createPlacements).toHaveBeenCalledWith(SLUG, [
        expect.objectContaining({ visiblePanoramaIds: [1] }),
      ]);
```

- [ ] **Step 2: Run to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/entities/placement src/features/placements-editor src/pages/territory-viewer/model/use-territory-viewer.spec.tsx`
Expected: FAIL — `createPlacements is not a function` / not exported.

- [ ] **Step 3: Implement**

`entities/placement/api/placements-gateway.ts` — replace `createPlacement`:

```ts
/** One transaction for the whole batch (1–100 items); the answer is the created rows, in order. */
export async function createPlacements(
  territorySlug: string,
  items: PlacementCreate[],
): Promise<Placement[]> {
  return (await httpPost<PlacementDto[]>(`${base(territorySlug)}/batch`, { items })).map(toPlacement);
}
```

`entities/placement/index.ts`: in the gateway export list replace `createPlacement,` with `createPlacements,`.

`features/placements-editor/model/use-placements-editor.ts`:
- Import `createPlacements` instead of `createPlacement`.
- `Placing` doc: `/** How big the batch in flight is. Null when nothing is being placed. */`
- Hook doc comment: "The placement editor's state: the list, the in-flight mutation and the batch being placed. Mutations are optimistic — each swaps the server-acknowledged placement into local state — and every success tells the page (`onChanged`)."
- Replace `create`:

```ts
  const create = useCallback(
    async (modelSlug: string, count: number): Promise<number | null> => {
      const total = Math.max(1, Math.floor(count));
      setMutation(creating);
      setPlacing({ done: 0, total });
      try {
        // Both GLBs are normalised to max-axis 2, so scale 1 would draw the
        // model as large as the whole territory. Lay the copies in a row along
        // X — each occupies ~2*scale scene units, and a tenth of that is the gap
        // — so N of them do not stack invisibly on one spot.
        const scale = realWorldScale(
          options.find((option) => option.slug === modelSlug),
          territoryMaxDim,
        );
        const step = 2 * scale * 1.1;
        const items = Array.from({ length: total }, (_, i) => ({
          modelSlug,
          position: { x: i * step, y: 0, z: 0 },
          scale: { x: scale, y: scale, z: scale },
          visiblePanoramaIds: panoramaIds,
        }));
        // One transaction on the gateway: the batch lands whole or not at all.
        const created = (await createPlacements(slug, items)).map(resolve);
        startTransition(() => setPlacements((prev) => [...prev, ...created]));
        onChanged();
        return created.at(-1)?.id ?? null;
      } catch (err) {
        notify.error(messageOf(err));
        return null;
      } finally {
        setPlacing(null);
        setMutation(idle);
      }
    },
    [slug, options, territoryMaxDim, panoramaIds, resolve, onChanged],
  );
```

- [ ] **Step 4: Run to see them pass**

Run: the command from Step 2. Expected: all pass.

- [ ] **Step 5: Types — no stragglers**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn lint && grep -rn "createPlacement\b" src | grep -v "shared/api/dto.ts"`
Expected: lint exit 0; grep prints nothing.

- [ ] **Step 6: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/entities/placement/api/placements-gateway.ts frontend/src/entities/placement/api/placements-gateway.spec.ts \
  frontend/src/entities/placement/index.ts \
  frontend/src/features/placements-editor/model/use-placements-editor.ts frontend/src/features/placements-editor/model/use-placements-editor.spec.tsx \
  frontend/src/pages/territory-viewer/model/use-territory-viewer.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): placing N objects is one batch POST

POST /api/territories/{slug}/placements/batch replaces N sequential POSTs
(and the ponytail note that asked for it). The batch is one transaction, so
the partial-batch branch is gone.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

### Task DF-10: A role saves in one PATCH and refetches only the roles (D1 + D3.4)

**Skills to load:** `ponytail:ponytail`, `clean-code`, `senior-architect`, `superpowers:test-driven-development`, `react-best-practices`, `senior-frontend`, `tailwind-patterns`, `ui-ux-pro-max`, `frontend-design:frontend-design`

"Invalidates `roles` only" taken literally would bring back a fixed bug: a
role's title is embedded in every user (`roleTitles`), and the spec
`"refreshes the people too, because a role's title is embedded in them"` exists
because the Users screen once showed the old title. So `["users"]` is marked
stale with `refetchType: "none"` — no request from this screen (it reads the
people only for counts), fresh on the Users screen's next mount.

**Files:**
- Modify: `frontend/src/entities/role/api/roles-gateway.ts:1,17-22`
- Test: `frontend/src/entities/role/api/roles-gateway.spec.ts`
- Modify: `frontend/src/entities/role/index.ts:10`
- Modify: `frontend/src/pages/roles/model/use-roles.ts:4-11,97-108`
- Test: `frontend/src/pages/roles/model/use-roles.spec.tsx`

**Interfaces:**
- Consumes: `PATCH /api/auth/roles/{slug}` with `UpdateRoleRequest {title, permissionSlugs?}` (Task DF-0).
- Produces: `updateRole(slug: string, patch: { title: string; permissionSlugs?: string[] }): Promise<Role>`. Removed: `renameRole`, `setRolePermissions`.

- [ ] **Step 1: Write the failing tests**

`roles-gateway.spec.ts`: import `createRole, deleteRole, listRoles, updateRole`; replace the rename and permissions tests with:

```ts
  it("patches the title and the permission set in one call, URL-encoding the slug", async () => {
    await updateRole("field operator", { title: "Field Ops", permissionSlugs: ["territory:read"] });
    expect(request()).toEqual({
      url: "/api/auth/roles/field%20operator",
      method: "PATCH",
      body: { title: "Field Ops", permissionSlugs: ["territory:read"] },
    });
  });

  it("sends an empty set as a set", async () => {
    await updateRole("field-operator", { title: "Field operator", permissionSlugs: [] });
    expect(request().body).toEqual({ title: "Field operator", permissionSlugs: [] });
  });
```

`use-roles.spec.tsx`:
- Replace `"saves the permissions and the title in two calls, then says so"`:

```ts
  it("saves the permissions and the title in one PATCH, then says so", async () => {
    const { result } = renderHook(() => ({ roles: useRoles(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.roles.status).toBe("ready"));
    act(() => result.current.roles.select("ops"));
    act(() => result.current.roles.toggle("users:write"));
    act(() => result.current.roles.rename("Field ops"));

    act(() => result.current.roles.save());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Role saved"));

    const patches = fetchMock.mock.calls.filter(
      ([, i]) => (i as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patches).toHaveLength(1);
    expect(String(patches[0][0])).toBe("/api/auth/roles/ops");
    expect(JSON.parse(String((patches[0][1] as RequestInit).body))).toEqual({
      title: "Field ops",
      permissionSlugs: ["users:read", "users:write"],
    });
    expect(called((_, i) => i?.method === "PUT")).toBe(false);
  });
```

- Replace `"refreshes the people too, because a role's title is embedded in them"` (keep its three-line comment above):

```ts
  it("marks the people stale without refetching them, because a role's title is embedded in them", async () => {
    const { result } = renderHook(() => ({ roles: useRoles(), notices: useNotices() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.roles.status).toBe("ready"));
    act(() => result.current.roles.select("ops"));
    act(() => result.current.roles.rename("Field ops"));

    const people = () =>
      fetchMock.mock.calls.filter(
        ([u, i]) => String(u).startsWith("/api/auth/users") && !(i as RequestInit | undefined)?.method,
      ).length;
    const before = people();
    act(() => result.current.roles.save());
    await waitFor(() => expect(result.current.notices[0]?.message).toBe("Role saved"));
    expect(client.getQueryState(["users"])?.isInvalidated).toBe(true);
    expect(people()).toBe(before);
  });
```

- In `"sends nothing it did not change"` replace the last two expectations with:

```ts
    const patch = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "PATCH");
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ title: "Field ops" });
    expect(called((_, i) => i?.method === "PUT")).toBe(false);
```

- In `"stays busy while the save is in flight…"` change `if (method === "PUT")` to `if (method === "PATCH")`.

- [ ] **Step 2: Run to see them fail**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && yarn vitest run src/entities/role src/pages/roles`
Expected: FAIL — `updateRole is not a function`; `expected [ …2 PATCH/PUT calls… ]`; `isInvalidated` false / people count grew.

- [ ] **Step 3: Implement**

`entities/role/api/roles-gateway.ts`: line 1 becomes `import { httpDelete, httpGet, httpPatch, httpPost } from "@/shared/api";`, and `renameRole` + `setRolePermissions` are replaced by:

```ts
/** Title plus, optionally, the permission set, applied in one transaction; an omitted set is left alone. */
export const updateRole = async (
  slug: string,
  patch: { title: string; permissionSlugs?: string[] },
): Promise<Role> => toRole(await httpPatch<AuthRoleDto>(at(slug), patch));
```

`entities/role/index.ts` line 10:

```ts
export { createRole, deleteRole, listRoles, updateRole } from "./api/roles-gateway";
```

`pages/roles/model/use-roles.ts` — in the `@/entities/role` import replace `renameRole,` and `setRolePermissions,` with `updateRole,`; replace the `saving` mutation:

```ts
  const saving = useMutation({
    // One PATCH carries the title and, when it changed, the permission set; the gateway applies both
    // in one transaction with the same grant checks.
    mutationFn: async () => {
      if (!selected || !draft) return;
      await updateRole(selected.slug, {
        title: draft.title, // the gateway requires it; an unchanged title is a no-op rename
        ...(sameSet(draft.granted, selected.permissionSlugs) ? {} : { permissionSlugs: draft.granted }),
      });
    },
    onSuccess: () => {
      notify.success("Role saved");
      void refresh();
      // A role's title travels embedded in every person who holds it. Marked
      // stale, not refetched: this screen reads the people only for counts,
      // and the Users screen reads fresh on its next mount.
      void client.invalidateQueries({ queryKey: ["users"], refetchType: "none" });
    },
    onError: fail,
  });
```

- [ ] **Step 4: Run to see them pass**

Run: the command from Step 2. Expected: all pass.

- [ ] **Step 5: The whole gate**

Run: `cd /Users/vbncursed/programming/rosneft/frontend && grep -rn "renameRole\|setRolePermissions" src; yarn lint && yarn test:coverage && yarn build`
Expected: grep prints nothing; lint exit 0; every test passes with coverage over 90/85/90/90; build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/entities/role/api/roles-gateway.ts frontend/src/entities/role/api/roles-gateway.spec.ts \
  frontend/src/entities/role/index.ts \
  frontend/src/pages/roles/model/use-roles.ts frontend/src/pages/roles/model/use-roles.spec.tsx
git diff --cached --name-only
git commit --no-verify -m "$(cat <<'EOF'
perf(frontend): a role saves in one PATCH and refetches only the roles

PATCH /api/auth/roles/{slug} carries the title and the permission set
together; PUT …/permissions is no longer called. The people are marked
stale, not refetched — their embedded role titles refresh on the Users
screen's next mount.

Frontend-only; --no-verify because the pre-commit hook runs the Go gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XzHX34KyuZAwuFXtwJKbG9
EOF
)"
```

---

## Findings against the spec (for the plan author / backend brief)

1. **D1 staleTime would hide fresh uploads.** Nothing invalidates `["territories"]`,
   `["models"]` or `["jobs"]` after `createTerritory` / `createModel`; the
   catalogs showed new rows only because staleTime 0 refetched on mount. Task
   DF-1 adds the invalidation; without it a new upload is missing for up to 60 s.
2. **"Roles save invalidates `roles` only" regresses a fixed bug.**
   `use-roles.spec.tsx` pins "refreshes the people too, because a role's title
   is embedded in them". Task DF-10 marks `["users"]` stale with
   `refetchType: "none"`: no request, and the Users screen is still correct.
3. **Metrics: one map can't say "this panel failed".** An `errgroup` that fails
   the whole request on the first error would turn one broken panel (e.g. a
   missing metric) into a dark dashboard; today it is one dark card. Contract
   above: a failed panel is **absent** from the map, 502 only when all fail.
   The per-panel error text is lost (the card reads "Prometheus did not answer").
4. **The metrics page makes 20 panel requests per tick, not 19** (`PANELS` has
   20 ids; `use-metrics.spec` asserts 20).
5. **Role PATCH field name.** The brief says `permissions?: string[]`; every
   existing role body and the `AuthRole` response use `permissionSlugs`
   (`CreateRoleRequest`, `SetRolePermissionsRequest`). The plan uses
   `permissionSlugs`; the backend must match.
6. **Batch placing loses its progress meaning.** `PlacingLine` reads
   "Placing {done+1} of {total}…" and a bar at done/total; with one request it
   shows "Placing 1 of N…" at 0% until the batch lands. Kept as is (short request,
   no widget change); say if the line should read differently.
7. **`refetchType` is a filter in TanStack v5:** `invalidateQueries({queryKey, refetchType: "none"})`,
   not `invalidateQueries(key, {refetchType})`.
8. **The viewer's `onChanged` should also stale the catalogs.** A placement
   changes `placementCount` (territory list) and `usageCount` (model list); with
   a 60 s staleTime nothing else would refresh them. Task DF-2 marks both stale (no request).
9. **Conversion page and the stream.** `useJobStream` invalidated
   `["artifacts","territory",slug]` on a terminal frame; nothing reads that key
   for a territory after D1, so it now invalidates `["scene", slug]`.
10. **D2 on finished jobs.** The four list hooks invalidated
    `["artifacts", kind, slug]` when a job finished; with LODs on the list they
    must invalidate the list (Task DF-5), or a finished row stays "converting/pending".
11. **Mappers need nothing `LodArtifact` lacks.** They read `lod` and `size` only
    (plus `.length` for the Content inspector). No `bbox`, `contentType` or `createdAt` reader exists.
12. **`lods` must be optional in the openapi `Territory`/`Model`.** Required would
    break every DTO literal in the specs, and single GET / PATCH / `/scene` do not fill it.
13. **Cross-task with B (edit title/description).** B's "`setQueryData` for … the
    list entry" must **merge** `{title, description}` into the cached list row
    rather than replace it with the PATCH answer — the PATCH answer has no `lods`,
    so a replace flips that card to "pending" until the next refetch.
14. **Home model cards change.** `use-home.ts` passed `[]` as every model's
    artifacts, so Home's model cards always read pending/"—"; after DF-5 they show
    real status and size. Improvement, but visible.
15. **Audit counter cap.** `auditHint`'s "200+" existed only because the counter
    fetched at most `WINDOW_LIMIT` rows; the summary counts exactly, so the cap is
    gone. The window must be the audit page's: `at >= date_trunc('hour', now UTC) − 23h`.
16. **Residual, not fixed here:** `features/territory-link` (`updateTerritory`
    of the panorama URL) invalidates nothing, so the catalog's "panorama" chip is
    now stale for up to 60 s after an edit (it was stale on the scene already).
