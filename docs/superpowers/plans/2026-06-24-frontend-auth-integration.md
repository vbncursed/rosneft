# Frontend Auth Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `auth-service` into the Next.js frontend — login (with 2FA), an httpOnly-cookie session via a Next BFF proxy, a permission-gated `/admin` console (Users · Roles · Content), account self-service — plus a backend extension so owners see only the users they created.

**Architecture:** Phase A extends the Go `auth-service` with `created_by` user ownership and actor-scoped reads. Phases B–E build the frontend: a catch-all BFF Route Handler injects `Authorization: Bearer <session cookie>` into every gateway call (server reads the cookie via `next/headers`; the browser sends it automatically same-origin), `middleware.ts` guards pages, and a new `auth/` bounded context holds the gateway, hooks, and UI.

**Tech Stack:** Go 1.26 (`auth-service`); Next.js 16.2.6 (App Router, RSC), React 19, TypeScript strict, Tailwind v4, Geist; `yarn`; `openapi-typescript` for DTOs; `qrcode.react` for the 2FA QR.

## Global Constraints

- **File size cap: 200 lines** (frontend ESLint `max-lines`, backend by hand). One concern per file.
- **Frontend package manager: `yarn`.** Commands: `yarn dev`, `yarn build`, `yarn lint`, `yarn openapi:generate`.
- **Path alias `@/*` → `frontend/src/*`**; no relative `../../..` imports.
- **DDD layers per bounded context:** `domain/` · `application/` · `infrastructure/` · `presentation/`. Presentation imports `application/` (or `infrastructure/` when no orchestration); never DTOs directly.
- **Visual language (match exactly):** dark mode; page bg `bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)]`; glass card `rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur`; inputs `rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white focus:border-cyan-300/60`; primary button `rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200`; eyebrow `text-xs uppercase tracking-[0.36em] text-cyan-300/80`; accent cyan; font Geist; statuses emerald/amber/neutral.
- **Reuse shared pieces:** `notify.error/success/info/warning(msg)` (`@/shared/presentation/toast/use-toast`); `confirmAction({title?,message,confirmLabel?,cancelLabel?,danger?}): Promise<boolean>` (`@/shared/presentation/confirm/use-confirm`); `<Field label value onChange required? multiline? hint?>`; `<Dropdown value options onChange label? placeholder? disabled? className?>` with `options: {value,label,disabled?,hint?}[]`; `HttpError {status, body, message}`.
- **HTTP client:** `httpGet/httpPost/httpPut/httpPatch/httpDelete` from `@/shared/infrastructure/http/client`. Gateways map DTOs (`components["schemas"]["X"]` from `@/shared/infrastructure/api/dto`) → domain.
- **Backend (`auth-service`) idioms:** Go 1.26 (`errors.AsType`, `slices`), `testify/suite` + `gotest.tools/v3/assert` + minimock, sentinels in `domain/errors.go`, one query/method per file.
- **Work on branch `feat/frontend-auth`** (create from `main` in Task A1).
- **No frontend test runner exists** — frontend verification = `yarn build` + `yarn lint` + manual checks against the running Docker stack. Backend uses Go tests (TDD).

---

## Phase A — Backend: owner-scoped users

### Task A1: Proto, migration, seed

**Files:**
- Modify: `backend/proto/rosneft/auth/v1/auth.proto`
- Create: `backend/services/auth-service/internal/migrate/migrations/00003_user_created_by.sql`

**Interfaces:**
- Produces: `token` fields on `CreateUserRequest`, `ListUsersRequest`, `GetUserRequest`, `UpdateUserRequest`, `RestoreUserRequest`; `created_by` column; `users:read_all` permission (admin only).

- [ ] **Step 1: Branch**

```bash
cd /Users/vbncursed/programming/rosneft && git checkout main && git checkout -b feat/frontend-auth
```

- [ ] **Step 2: Add `token` to the five request messages in `auth.proto`**

In `backend/proto/rosneft/auth/v1/auth.proto`, change these messages (add a `token` field; renumber existing fields up by one):

```protobuf
message CreateUserRequest {
  string token = 1; // actor session token; created_by is set from it
  string email = 2;
  string username = 3;
  string password = 4;
  repeated string role_slugs = 5;
}
message ListUsersRequest {
  string token = 1; // actor; scopes the result to owned users unless actor has users:read_all
  string status = 2;
  bool include_deleted = 3;
}
message GetUserRequest {
  string token = 1;
  string id = 2;
}
message UpdateUserRequest {
  string token = 1;
  string id = 2;
  repeated string role_slugs = 3;
  string email = 4;
  string username = 5;
}
message RestoreUserRequest {
  string token = 1;
  string id = 2;
}
```

- [ ] **Step 3: Regenerate proto** — `cd backend && make proto-gen` → no errors.

- [ ] **Step 4: Write `00003_user_created_by.sql`**

```sql
-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX users_created_by_idx ON users(created_by);

INSERT INTO permissions (slug, description)
VALUES ('users:read_all', 'see and manage all users, not only those you created');

-- admin already holds every permission; grant the new one explicitly so the
-- admin role keeps "see everything" after this migration.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'admin' AND p.slug = 'users:read_all';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions WHERE permission_id = (SELECT id FROM permissions WHERE slug = 'users:read_all');
DELETE FROM permissions WHERE slug = 'users:read_all';
DROP INDEX users_created_by_idx;
ALTER TABLE users DROP COLUMN created_by;
-- +goose StatementEnd
```

- [ ] **Step 5: Build proto + commit**

```bash
cd backend/services/auth-service && go build ./... 2>&1 || true   # storage/grpc not updated yet; proto module builds
cd /Users/vbncursed/programming/rosneft
git add backend/proto/rosneft/auth backend/proto/gen/go/rosneft/auth backend/services/auth-service/internal/migrate/migrations/00003_user_created_by.sql
git commit -m "feat(auth): proto token fields + created_by migration + users:read_all"
```

### Task A2: Users store — created_by + scoped list + ownership

**Files:**
- Modify: `backend/services/auth-service/internal/domain/user.go` (add `CreatedBy *string`)
- Modify: `backend/services/auth-service/internal/storage/users/models.go`, `get.go`, `create.go`, `list.go`

**Interfaces:**
- Produces:
  - `domain.User.CreatedBy *string`
  - `users.Store.Create` now persists `u.CreatedBy`
  - `users.Store.List(ctx, status string, includeDeleted bool, ownerID string)` — `ownerID == ""` → all; else `WHERE created_by = ownerID`
  - `GetByID` hydrates `CreatedBy` (used for ownership checks)

- [ ] **Step 1: Add `CreatedBy` to `domain.User`**

In `internal/domain/user.go`, add to the `User` struct (after `DeletedAt`):
```go
	CreatedBy *string // who created this account; nil for bootstrap admin
```

- [ ] **Step 2: Update `users/models.go`** — add `created_by` to the column list:
```go
const userColumns = `u.id, u.email, u.username, u.password_hash, u.status,
	u.totp_enabled, u.totp_secret, u.created_at, u.updated_at, u.deleted_at, u.created_by`
```

- [ ] **Step 3: Update `scanUser` in `users/get.go`** to scan the new trailing column:
```go
func scanUser(r rowScanner) (domain.User, error) {
	var u domain.User
	err := r.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.Status,
		&u.TOTPEnabled, &u.TOTPSecret, &u.CreatedAt, &u.UpdatedAt, &u.DeletedAt, &u.CreatedBy)
	return u, err
}
```

- [ ] **Step 4: Update `Create` in `users/create.go`** to persist `created_by`:
```go
	const ins = `INSERT INTO users (email, username, password_hash, status, created_by)
		VALUES ($1, $2, $3, 'active', $4) RETURNING id`
	var id string
	if err := tx.QueryRow(ctx, ins, u.Email, u.Username, u.PasswordHash, u.CreatedBy).Scan(&id); err != nil {
```
(keep the rest of `Create` unchanged.)

- [ ] **Step 5: Update `List` in `users/list.go`** to accept `ownerID`:
```go
func (s *Store) List(ctx context.Context, status string, includeDeleted bool, ownerID string) ([]domain.User, error) {
	q := `SELECT ` + userColumns + ` FROM users u WHERE 1=1`
	args := make([]any, 0, 3)
	if ownerID != "" {
		args = append(args, ownerID)
		q += fmt.Sprintf(" AND u.created_by = $%d", len(args))
	}
	if status != "" {
		args = append(args, status)
		q += fmt.Sprintf(" AND u.status = $%d", len(args))
	} else if !includeDeleted {
		q += " AND u.status <> 'deleted'"
	}
	q += " ORDER BY u.created_at"

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("users.List: %w", err)
	}
	defer rows.Close()
	out := make([]domain.User, 0, 16)
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("users.List: scan: %w", err)
		}
		out = append(out, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("users.List: rows: %w", err)
	}
	return out, nil
}
```

- [ ] **Step 6: Build + commit**

```bash
cd backend/services/auth-service && go build ./internal/storage/... ./internal/domain/... 2>&1 || true   # service consumers updated in A3
cd /Users/vbncursed/programming/rosneft
git add backend/services/auth-service/internal/domain/user.go backend/services/auth-service/internal/storage/users
git commit -m "feat(auth): users store — created_by + owner-scoped list"
```

### Task A3: Users service — actor scope + ownership guard (TDD)

**Files:**
- Modify: `backend/services/auth-service/internal/service/users/users.go` (Store interface + a scope helper), `create.go`, `list.go`, `get.go`, `update.go`, `freeze.go`, `soft_delete.go`
- Test: `backend/services/auth-service/internal/service/users/scope_test.go`
- Regenerate: `internal/service/users/mocks/` (minimock)

**Interfaces:**
- Consumes: `users.Store.List(ctx,status,includeDeleted,ownerID)`, `domain.User.CreatedBy`.
- Produces service methods that take `actorID string, scopeAll bool`:
  - `Create(ctx, actorID, email, username, password string, roleSlugs []string) (domain.User, error)` — sets `CreatedBy=&actorID`.
  - `List(ctx, actorID string, scopeAll bool, status string, includeDeleted bool) ([]domain.User, error)`
  - `Get(ctx, actorID string, scopeAll bool, id string) (domain.User, error)`
  - `Update(ctx, actorID string, scopeAll bool, id string, roleSlugs []string, email, username string) (domain.User, error)`
  - `Freeze(ctx, actorID string, scopeAll bool, id string) (domain.User, error)`
  - `Unfreeze(ctx, actorID string, scopeAll bool, id string) (domain.User, error)`
  - `SoftDelete(ctx, actorID string, scopeAll bool, id string) error`
  - `Restore(ctx, actorID string, scopeAll bool, id string) (domain.User, error)`
  - Ownership rule: when `!scopeAll`, a target whose `CreatedBy != actorID` yields `domain.ErrUserNotFound` (no existence leak). The self-target + last-admin guards still apply to freeze/soft-delete.

- [ ] **Step 1: Update the `Store` interface in `users.go`** (List signature gains `ownerID`):
```go
	List(ctx context.Context, status string, includeDeleted bool, ownerID string) ([]domain.User, error)
```
Add an ownership helper to the same file:
```go
// ownership returns the target user after enforcing the owner scope: an actor
// without users:read_all may only touch users they created.
func (s *Service) ownership(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	u, err := s.store.GetByID(ctx, id)
	if err != nil {
		return domain.User{}, err
	}
	if !scopeAll && (u.CreatedBy == nil || *u.CreatedBy != actorID) {
		return domain.User{}, domain.ErrUserNotFound
	}
	return u, nil
}
```

- [ ] **Step 2: Regenerate mocks** — `cd backend/services/auth-service && go generate ./internal/service/users/...`

- [ ] **Step 3: Write the failing test `scope_test.go`**

```go
package users_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

func TestListScopedToOwner(t *testing.T) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	svc := users.New(st, mocks.NewSessionsMock(mc))
	ctx := t.Context()
	// owner (scopeAll=false) → ownerID forwarded to the store
	st.ListMock.Expect(ctx, "", false, "owner1").Return([]domain.User{{ID: "u2"}}, nil)
	out, err := svc.List(ctx, "owner1", false, "", false)
	assert.NilError(t, err)
	assert.Equal(t, len(out), 1)
}

func TestListAllForAdmin(t *testing.T) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	svc := users.New(st, mocks.NewSessionsMock(mc))
	ctx := t.Context()
	st.ListMock.Expect(ctx, "", false, "").Return([]domain.User{{ID: "a"}, {ID: "b"}}, nil)
	out, err := svc.List(ctx, "admin1", true, "", false)
	assert.NilError(t, err)
	assert.Equal(t, len(out), 2)
}

func TestGetForeignUserHiddenFromOwner(t *testing.T) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	svc := users.New(st, mocks.NewSessionsMock(mc))
	ctx := t.Context()
	other := "someoneelse"
	st.GetByIDMock.Expect(ctx, "u9").Return(domain.User{ID: "u9", CreatedBy: &other}, nil)
	_, err := svc.Get(ctx, "owner1", false, "u9")
	assert.ErrorIs(t, err, domain.ErrUserNotFound)
}
```

- [ ] **Step 4: Run, expect FAIL** — `go test ./internal/service/users/...` → fails (signatures differ).

- [ ] **Step 5: Update the method files**

```go
// list.go
func (s *Service) List(ctx context.Context, actorID string, scopeAll bool, status string, includeDeleted bool) ([]domain.User, error) {
	ownerID := actorID
	if scopeAll {
		ownerID = ""
	}
	return s.store.List(ctx, status, includeDeleted, ownerID)
}
```

```go
// create.go (signature + CreatedBy)
func (s *Service) Create(ctx context.Context, actorID, email, username, plain string, roleSlugs []string) (domain.User, error) {
	if email == "" || username == "" || plain == "" {
		return domain.User{}, fmt.Errorf("users.Create: %w: email, username, password required", domain.ErrInvalidInput)
	}
	hash, err := password.Hash(plain)
	if err != nil {
		return domain.User{}, fmt.Errorf("users.Create: hash: %w", err)
	}
	owner := actorID
	return s.store.Create(ctx, domain.User{
		Email: email, Username: username, PasswordHash: hash,
		RoleSlugs: roleSlugs, CreatedBy: &owner,
	})
}
```

```go
// get.go
func (s *Service) Get(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	if id == "" {
		return domain.User{}, fmt.Errorf("users.Get: %w: empty id", domain.ErrInvalidInput)
	}
	return s.ownership(ctx, actorID, scopeAll, id)
}
```

```go
// update.go
func (s *Service) Update(ctx context.Context, actorID string, scopeAll bool, id string, roleSlugs []string, _, _ string) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	if roleSlugs != nil {
		return s.store.SetRoles(ctx, id, roleSlugs)
	}
	return s.store.GetByID(ctx, id)
}
```

```go
// freeze.go
func (s *Service) Freeze(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	if err := s.guard(ctx, actorID, id); err != nil {
		return domain.User{}, err
	}
	u, err := s.store.SetStatus(ctx, id, domain.StatusFrozen, nil)
	if err != nil {
		return domain.User{}, err
	}
	if err := s.sessions.DeleteUser(ctx, id); err != nil {
		return domain.User{}, err
	}
	return u, nil
}

func (s *Service) Unfreeze(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	return s.store.SetStatus(ctx, id, domain.StatusActive, nil)
}
```

```go
// soft_delete.go
func (s *Service) SoftDelete(ctx context.Context, actorID string, scopeAll bool, id string) error {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return err
	}
	if err := s.guard(ctx, actorID, id); err != nil {
		return err
	}
	now := time.Now()
	if _, err := s.store.SetStatus(ctx, id, domain.StatusDeleted, &now); err != nil {
		return err
	}
	return s.sessions.DeleteUser(ctx, id)
}

func (s *Service) Restore(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	return s.store.SetStatus(ctx, id, domain.StatusActive, nil)
}
```

Update the existing `users_test.go` Freeze tests to the new signatures (add `scopeAll` arg, and a `GetByIDMock` for the ownership pre-check). For `TestFreezeRejectsSelf` pass `scopeAll=true` so ownership passes and the self guard fires:
```go
func TestFreezeRejectsSelf(t *testing.T) {
	svc, st, _ := newSvc(t)
	st.GetByIDMock.Expect(t.Context(), "u1").Return(domain.User{ID: "u1"}, nil)
	_, err := svc.Freeze(t.Context(), "u1", true, "u1")
	assert.ErrorIs(t, err, domain.ErrSelfTarget)
}
```
(and analogously add `true` + a `GetByIDMock` for `TestFreezeRejectsLastAdmin` and `TestFreezeKillsSessions`.)

- [ ] **Step 6: Run, expect PASS** — `go test ./internal/service/users/... -race` → ok.

- [ ] **Step 7: Commit** — `git add backend/services/auth-service/internal/service/users && git commit -m "feat(auth): actor-scoped user service + ownership guard (TDD)"`

### Task A4: gRPC handlers + gateway pass token

**Files:**
- Modify: `backend/services/auth-service/internal/transport/grpcapi/server.go` (UsersSvc interface), `users.go` (handlers resolve actor + scopeAll)
- Modify: `backend/services/gateway-service/internal/clients/auth/users.go` (pass token), `internal/transport/authhttp/users.go` (forward bearer)

**Interfaces:**
- Consumes: `s.auth.ValidateToken(ctx, token) (userID string, perms []string, err error)`.
- Produces: every user-admin RPC resolves the actor from its `token` and a `scopeAll := slices.Contains(perms, "users:read_all")`.

- [ ] **Step 1: Update `UsersSvc` interface in `grpcapi/server.go`** to the new signatures:
```go
type UsersSvc interface {
	Create(ctx context.Context, actorID, email, username, password string, roleSlugs []string) (domain.User, error)
	List(ctx context.Context, actorID string, scopeAll bool, status string, includeDeleted bool) ([]domain.User, error)
	Get(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error)
	Update(ctx context.Context, actorID string, scopeAll bool, id string, roleSlugs []string, email, username string) (domain.User, error)
	Freeze(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error)
	Unfreeze(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error)
	SoftDelete(ctx context.Context, actorID string, scopeAll bool, id string) error
	Restore(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error)
	ChangePassword(ctx context.Context, userID, oldPlain, newPlain string) error
}
```
Add an actor helper to `server.go`:
```go
import "slices" // add to imports

// actor resolves a session token to (userID, scopeAll). scopeAll is true when
// the caller holds users:read_all (admin) — i.e. may see/manage every user.
func (s *Server) actor(ctx context.Context, token string) (string, bool, error) {
	uid, perms, err := s.auth.ValidateToken(ctx, token)
	if err != nil {
		return "", false, err
	}
	return uid, slices.Contains(perms, "users:read_all"), nil
}
```

- [ ] **Step 2: Rewrite the handlers in `grpcapi/users.go`** to resolve the actor:
```go
func (s *Server) CreateUser(ctx context.Context, req *authv1.CreateUserRequest) (*authv1.User, error) {
	actorID, _, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Create(ctx, actorID, req.GetEmail(), req.GetUsername(), req.GetPassword(), req.GetRoleSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) ListUsers(ctx context.Context, req *authv1.ListUsersRequest) (*authv1.ListUsersResponse, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	list, err := s.users.List(ctx, actorID, scopeAll, req.GetStatus(), req.GetIncludeDeleted())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*authv1.User, 0, len(list))
	for _, u := range list {
		out = append(out, userToProto(u))
	}
	return &authv1.ListUsersResponse{Users: out}, nil
}

func (s *Server) GetUser(ctx context.Context, req *authv1.GetUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Get(ctx, actorID, scopeAll, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) UpdateUser(ctx context.Context, req *authv1.UpdateUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Update(ctx, actorID, scopeAll, req.GetId(), req.GetRoleSlugs(), req.GetEmail(), req.GetUsername())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) FreezeUser(ctx context.Context, req *authv1.FreezeUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Freeze(ctx, actorID, scopeAll, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) UnfreezeUser(ctx context.Context, req *authv1.UnfreezeUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Unfreeze(ctx, actorID, scopeAll, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) SoftDeleteUser(ctx context.Context, req *authv1.SoftDeleteUserRequest) (*authv1.SoftDeleteUserResponse, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.users.SoftDelete(ctx, actorID, scopeAll, req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.SoftDeleteUserResponse{}, nil
}

func (s *Server) RestoreUser(ctx context.Context, req *authv1.RestoreUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Restore(ctx, actorID, scopeAll, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}
```
(Note: `UnfreezeUserRequest`/`RestoreUserRequest` gained a `token` field in A1 — `Unfreeze` already had only `id`; the proto change in A1 added `token` to `RestoreUserRequest` and `GetUserRequest`; `UnfreezeUserRequest` keeps just `id` — so `UnfreezeUser` resolves the actor from… add `token` to `UnfreezeUserRequest` too in A1 Step 2 for symmetry. Apply that.)

- [ ] **Step 3: Gateway auth client passes the token** — in `gateway-service/internal/clients/auth/users.go`, change the affected methods to accept + send a token:
```go
func (c *Client) CreateUser(ctx context.Context, token, email, username, password string, roles []string) (*authv1.User, error) {
	return c.cc.CreateUser(ctx, &authv1.CreateUserRequest{Token: token, Email: email, Username: username, Password: password, RoleSlugs: roles})
}
func (c *Client) ListUsers(ctx context.Context, token, status string, includeDeleted bool) ([]*authv1.User, error) {
	resp, err := c.cc.ListUsers(ctx, &authv1.ListUsersRequest{Token: token, Status: status, IncludeDeleted: includeDeleted})
	if err != nil {
		return nil, err
	}
	return resp.GetUsers(), nil
}
func (c *Client) GetUser(ctx context.Context, token, id string) (*authv1.User, error) {
	return c.cc.GetUser(ctx, &authv1.GetUserRequest{Token: token, Id: id})
}
func (c *Client) UpdateUser(ctx context.Context, token, id string, roles []string, email, username string) (*authv1.User, error) {
	return c.cc.UpdateUser(ctx, &authv1.UpdateUserRequest{Token: token, Id: id, RoleSlugs: roles, Email: email, Username: username})
}
func (c *Client) UnfreezeUser(ctx context.Context, token, id string) (*authv1.User, error) {
	return c.cc.UnfreezeUser(ctx, &authv1.UnfreezeUserRequest{Token: token, Id: id})
}
func (c *Client) RestoreUser(ctx context.Context, token, id string) (*authv1.User, error) {
	return c.cc.RestoreUser(ctx, &authv1.RestoreUserRequest{Token: token, Id: id})
}
```
(`FreezeUser`/`SoftDeleteUser` already take a `token` — leave them.)

- [ ] **Step 4: Gateway HTTP handlers forward the bearer** — in `gateway-service/internal/transport/authhttp/users.go`, pass `bearer(r)` to the client calls that gained a token param: `listUsers`, `createUser`, `getUser`, `updateUser`, `unfreezeUser`, `restoreUser`. Example:
```go
func (h *Handlers) listUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	list, err := h.client.ListUsers(r.Context(), bearer(r), q.Get("status"), q.Get("includeDeleted") == "true")
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, usersToJSON(list))
}
```
Apply the same `bearer(r)` first-arg to `createUser`, `getUser`, `updateUser`, `unfreezeUser`, `restoreUser`.

- [ ] **Step 5: Build both modules**

Run: `cd backend && (cd services/auth-service && go build ./... && go test ./... 2>&1 | grep -v "no test files" | tail) && (cd services/gateway-service && go build ./...)`
Expected: both build; auth tests pass.

- [ ] **Step 6: Commit + rebuild auth & gateway containers**

```bash
cd /Users/vbncursed/programming/rosneft
git add backend/services/auth-service/internal/transport backend/services/gateway-service
git commit -m "feat(auth): resolve actor + owner scope in user RPCs; gateway forwards bearer"
docker compose -f docker-compose.yml -p andrey up --build -d auth gateway
```

- [ ] **Step 7: Verify owner scoping end-to-end**

```bash
B=localhost:8080
AT=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"admin","password":"change-me-now"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
# admin creates an owner
curl -s -X POST $B/api/auth/users -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"email":"o@x.io","username":"own","password":"ownerpass","roleSlugs":["owner"]}' >/dev/null
OT=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"own","password":"ownerpass"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
# owner sees 0 users initially (created none)
echo "owner list (expect 0):"; curl -s $B/api/auth/users -H "Authorization: Bearer $OT" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))'
# owner creates one
curl -s -X POST $B/api/auth/users -H "Authorization: Bearer $OT" -H 'Content-Type: application/json' -d '{"email":"e@x.io","username":"ed","password":"editorpass","roleSlugs":["editor"]}' >/dev/null
echo "owner list (expect 1):"; curl -s $B/api/auth/users -H "Authorization: Bearer $OT" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))'
echo "admin list (expect >=3):"; curl -s $B/api/auth/users -H "Authorization: Bearer $AT" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))'
```
Expected: owner sees 0 then 1; admin sees all.

---

## Phase B — Frontend: auth plumbing + login

### Task B1: Regenerate DTOs + add QR dep

**Files:**
- Regenerate: `frontend/src/shared/infrastructure/api/dto.ts`
- Modify: `frontend/package.json`

- [ ] **Step 1: Regenerate DTOs** (the gateway `openapi.yaml` now includes `/api/auth/*`):
```bash
cd /Users/vbncursed/programming/rosneft/frontend && yarn openapi:generate
```
Verify the new schemas exist: `grep -c "AuthUser\|AuthRole\|AuthPermission" src/shared/infrastructure/api/dto.ts` → ≥ 3.

- [ ] **Step 2: Add the QR dependency** — `cd frontend && yarn add qrcode.react` (small, SVG QR for the 2FA otpauth URL).

- [ ] **Step 3: Commit** — `cd /Users/vbncursed/programming/rosneft && git add frontend/src/shared/infrastructure/api/dto.ts frontend/package.json frontend/yarn.lock && git commit -m "chore(frontend): regenerate DTOs with auth schemas + qrcode.react"`

### Task B2: BFF proxy, cookie-aware client, middleware

**Files:**
- Create: `frontend/src/app/api/[...path]/route.ts`
- Create: `frontend/middleware.ts`
- Modify: `frontend/src/shared/infrastructure/http/client.ts`
- Modify: `frontend/next.config.ts` (remove the `/api/*` rewrite — the proxy replaces it)

**Interfaces:**
- Produces: every `/api/*` browser request is proxied with `Authorization: Bearer <session cookie>`; server (RSC) requests add the header from the cookie; unauthenticated page loads redirect to `/login`.

- [ ] **Step 1: Remove the rewrite from `next.config.ts`** (the BFF Route Handler now owns `/api/*`; a rewrite would shadow it):
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["@react-three/drei", "three-stdlib"],
  },
};

export default nextConfig;
```

- [ ] **Step 2: Write the catch-all BFF proxy `src/app/api/[...path]/route.ts`**

```ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const GATEWAY =
  process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const SESSION = "session";

// Headers worth forwarding from the browser to the gateway (everything else,
// incl. cookies and host, is dropped — the gateway auths via Bearer only).
const FORWARD = [
  "content-type", "accept", "accept-encoding", "range",
  "if-none-match", "upload-offset", "upload-length", "content-length",
];

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const token = (await cookies()).get(SESSION)?.value;
  const url = `${GATEWAY}/api/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-expect-error duplex is required when streaming a request body
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
    cache: "no-store",
  });

  const out = new Headers(res.headers);
  out.delete("content-encoding"); // fetch already decoded; avoid double-decode in the browser
  out.delete("content-length");
  if (res.status === 401) {
    out.append("set-cookie", `${SESSION}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
  }
  return new Response(res.body, { status: res.status, headers: out });
}

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export {
  handler as GET, handler as POST, handler as PUT,
  handler as PATCH, handler as DELETE, handler as HEAD,
};
```

- [ ] **Step 3: Make the server HTTP client attach the cookie** — edit `src/shared/infrastructure/http/client.ts`. Add a helper and merge it into `send`:
```ts
// On the server there is no same-origin proxy, so attach the session cookie's
// token directly. On the client the browser sends the httpOnly cookie to the
// same-origin /api proxy, which injects the header — so nothing to add here.
async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") return {};
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("session")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function send<T>(path: string, init: RequestInit, parseJson: boolean): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(await authHeaders()), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // body not JSON
    }
    throw new HttpError(res.status, body, body?.message ?? res.statusText);
  }
  return parseJson ? ((await res.json()) as T) : (undefined as T);
}
```
(Keep `apiBase()`, the `httpGet/Post/...` wrappers, and imports unchanged.)

Note: if Turbopack pulls `next/headers` into the client bundle, split `authHeaders` into a server-only file `client.server.ts` imported lazily; the `typeof window` guard normally prevents that.

- [ ] **Step 4: Write `frontend/middleware.ts`** (guards pages; `/login`, `/api`, static assets excluded):
```ts
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (req.cookies.has("session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except /login, /api/*, Next internals, and files with an extension.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
```

- [ ] **Step 5: Build** — `cd frontend && yarn build 2>&1 | tail -20`. Expected: compiles (the login route + page come in B4; build may warn about `/login` not existing yet — acceptable until B4, or stub `app/login/page.tsx` returning null now and flesh out in B4). To keep the build green, create a temporary `src/app/login/page.tsx` exporting `export default function Login(){return null}` now; B4 replaces it.

- [ ] **Step 6: Commit** — `git add frontend/src/app/api frontend/middleware.ts frontend/src/shared/infrastructure/http/client.ts frontend/next.config.ts frontend/src/app/login && git commit -m "feat(frontend): BFF proxy + cookie-aware client + auth middleware"`

### Task B3: Auth domain + frontend gateway

**Files:**
- Create: `frontend/src/auth/domain/principal.ts`, `user.ts`, `role.ts`, `permission.ts`
- Create: `frontend/src/auth/infrastructure/auth-gateway.ts`, `auth-admin-gateway.ts`

**Interfaces:**
- Produces:
  - `Principal { id, email, username, status, totpEnabled, roleSlugs: string[], permissions: string[] }`
  - `AdminUser` (same shape as Principal, the admin list item), `Role { slug, title, isSystem, permissionSlugs }`, `Permission { slug, description }`
  - `getMe(): Promise<Principal>`, `changePassword(old,new)`, `setup2FA()`, `enable2FA(code)`, `disable2FA(code)`
  - `listUsers(status?, includeDeleted?)`, `createUser(...)`, `updateUserRoles(id, roleSlugs)`, `freezeUser(id)`, `unfreezeUser(id)`, `deleteUser(id)`, `restoreUser(id)`
  - `listRoles()`, `createRole(...)`, `renameRole(slug,title)`, `deleteRole(slug)`, `setRolePermissions(slug, perms)`, `listPermissions()`

- [ ] **Step 1: Write the domain types**

```ts
// src/auth/domain/principal.ts
export interface Principal {
  id: string;
  email: string;
  username: string;
  status: "active" | "frozen" | "deleted";
  totpEnabled: boolean;
  roleSlugs: string[];
  permissions: string[];
}

export function can(p: Principal | null, permission: string): boolean {
  return !!p && p.permissions.includes(permission);
}
```

```ts
// src/auth/domain/user.ts
import type { Principal } from "@/auth/domain/principal";
export type AdminUser = Principal; // identical shape returned by the admin list
```

```ts
// src/auth/domain/role.ts
export interface Role {
  slug: string;
  title: string;
  isSystem: boolean;
  permissionSlugs: string[];
}
```

```ts
// src/auth/domain/permission.ts
export interface Permission {
  slug: string;
  description: string;
}
```

- [ ] **Step 2: Write `auth-gateway.ts`** (self/session surface)

```ts
import { httpGet, httpPost } from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { Principal } from "@/auth/domain/principal";

type AuthUserDto = components["schemas"]["AuthUser"];

export function mapPrincipal(d: AuthUserDto): Principal {
  return {
    id: d.id ?? "",
    email: d.email ?? "",
    username: d.username ?? "",
    status: (d.status as Principal["status"]) ?? "active",
    totpEnabled: d.totpEnabled ?? false,
    roleSlugs: d.roleSlugs ?? [],
    permissions: d.permissions ?? [],
  };
}

export async function getMe(): Promise<Principal> {
  return mapPrincipal(await httpGet<AuthUserDto>("/api/auth/me"));
}

export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return httpPost<void>("/api/auth/me/password", { oldPassword, newPassword });
}

export function setup2FA(): Promise<{ secret: string; otpauthUrl: string }> {
  return httpPost("/api/auth/2fa/setup");
}

export async function enable2FA(code: string): Promise<string[]> {
  const r = await httpPost<{ recoveryCodes?: string[] }>("/api/auth/2fa/enable", { code });
  return r.recoveryCodes ?? [];
}

export function disable2FA(code: string): Promise<void> {
  return httpPost<void>("/api/auth/2fa/disable", { code });
}
```

- [ ] **Step 3: Write `auth-admin-gateway.ts`** (users + roles surface)

```ts
import { httpGet, httpPost, httpPatch, httpPut, httpDelete } from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { AdminUser } from "@/auth/domain/user";
import type { Role } from "@/auth/domain/role";
import type { Permission } from "@/auth/domain/permission";
import { mapPrincipal } from "@/auth/infrastructure/auth-gateway";

type RoleDto = components["schemas"]["AuthRole"];
type PermDto = components["schemas"]["AuthPermission"];

function mapRole(d: RoleDto): Role {
  return {
    slug: d.slug ?? "",
    title: d.title ?? "",
    isSystem: d.isSystem ?? false,
    permissionSlugs: d.permissionSlugs ?? [],
  };
}

export async function listUsers(status: string, includeDeleted: boolean): Promise<AdminUser[]> {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (includeDeleted) q.set("includeDeleted", "true");
  const qs = q.toString();
  const data = await httpGet<components["schemas"]["AuthUser"][]>(`/api/auth/users${qs ? `?${qs}` : ""}`);
  return data.map(mapPrincipal);
}

export async function createUser(email: string, username: string, password: string, roleSlugs: string[]): Promise<AdminUser> {
  return mapPrincipal(await httpPost("/api/auth/users", { email, username, password, roleSlugs }));
}

export async function updateUserRoles(id: string, roleSlugs: string[]): Promise<AdminUser> {
  return mapPrincipal(await httpPatch(`/api/auth/users/${encodeURIComponent(id)}`, { roleSlugs }));
}

export async function freezeUser(id: string): Promise<AdminUser> {
  return mapPrincipal(await httpPost(`/api/auth/users/${encodeURIComponent(id)}/freeze`));
}
export async function unfreezeUser(id: string): Promise<AdminUser> {
  return mapPrincipal(await httpPost(`/api/auth/users/${encodeURIComponent(id)}/unfreeze`));
}
export function deleteUser(id: string): Promise<void> {
  return httpDelete(`/api/auth/users/${encodeURIComponent(id)}`);
}
export async function restoreUser(id: string): Promise<AdminUser> {
  return mapPrincipal(await httpPost(`/api/auth/users/${encodeURIComponent(id)}/restore`));
}

export async function listRoles(): Promise<Role[]> {
  return (await httpGet<RoleDto[]>("/api/auth/roles")).map(mapRole);
}
export async function createRole(slug: string, title: string, permissionSlugs: string[]): Promise<Role> {
  return mapRole(await httpPost("/api/auth/roles", { slug, title, permissionSlugs }));
}
export async function renameRole(slug: string, title: string): Promise<Role> {
  return mapRole(await httpPatch(`/api/auth/roles/${encodeURIComponent(slug)}`, { title }));
}
export function deleteRole(slug: string): Promise<void> {
  return httpDelete(`/api/auth/roles/${encodeURIComponent(slug)}`);
}
export async function setRolePermissions(slug: string, permissionSlugs: string[]): Promise<Role> {
  return mapRole(await httpPut(`/api/auth/roles/${encodeURIComponent(slug)}/permissions`, { permissionSlugs }));
}
export async function listPermissions(): Promise<Permission[]> {
  const data = await httpGet<PermDto[]>("/api/auth/permissions");
  return data.map((d) => ({ slug: d.slug ?? "", description: d.description ?? "" }));
}
```

- [ ] **Step 4: Lint + commit** — `cd frontend && yarn lint 2>&1 | tail`. `git add frontend/src/auth && git commit -m "feat(frontend): auth domain + gateways"`

### Task B4: Login route handlers + login page

**Files:**
- Create: `frontend/src/app/api/auth/login/route.ts`, `frontend/src/app/api/auth/login/2fa/route.ts`, `frontend/src/app/api/auth/logout/route.ts`
- Create: `frontend/src/auth/infrastructure/session-cookie.ts` (shared cookie helpers)
- Replace: `frontend/src/app/login/page.tsx`
- Create: `frontend/src/auth/presentation/login/login-form.tsx`, `topographic-motif.tsx`

**Interfaces:**
- Produces: `POST /api/auth/login` → sets `session` cookie or returns `{twoFactorRequired, challengeToken}`; `POST /api/auth/login/2fa` → sets cookie; `POST /api/auth/logout` → clears cookie. The login page drives the two-step UI.

- [ ] **Step 1: Cookie helpers `src/auth/infrastructure/session-cookie.ts`**
```ts
import { cookies } from "next/headers";

export const SESSION = "session";
const GATEWAY =
  process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export function gatewayUrl(path: string): string {
  return `${GATEWAY}${path}`;
}

export async function setSession(token: string): Promise<void> {
  (await cookies()).set({
    name: SESSION,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // matches the gateway's absolute session cap
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION)?.value;
}
```

- [ ] **Step 2: Login route handler `src/app/api/auth/login/route.ts`**
```ts
import { gatewayUrl, setSession } from "@/auth/infrastructure/session-cookie";

export async function POST(req: Request): Promise<Response> {
  const { identifier, password } = await req.json();
  const res = await fetch(gatewayUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
    cache: "no-store",
  });
  if (!res.ok) {
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  const data = (await res.json()) as { token: string; twoFactorRequired: boolean; challengeToken: string };
  if (data.twoFactorRequired) {
    return Response.json({ twoFactorRequired: true, challengeToken: data.challengeToken });
  }
  await setSession(data.token);
  return Response.json({ twoFactorRequired: false });
}
```

- [ ] **Step 3: 2FA + logout handlers**
```ts
// src/app/api/auth/login/2fa/route.ts
import { gatewayUrl, setSession } from "@/auth/infrastructure/session-cookie";

export async function POST(req: Request): Promise<Response> {
  const { challengeToken, code } = await req.json();
  const res = await fetch(gatewayUrl("/api/auth/login/2fa"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeToken, code }),
    cache: "no-store",
  });
  if (!res.ok) {
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  const data = (await res.json()) as { token: string };
  await setSession(data.token);
  return Response.json({ ok: true });
}
```
```ts
// src/app/api/auth/logout/route.ts
import { gatewayUrl, clearSession, sessionToken } from "@/auth/infrastructure/session-cookie";

export async function POST(): Promise<Response> {
  const token = await sessionToken();
  if (token) {
    await fetch(gatewayUrl("/api/auth/logout"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => undefined);
  }
  await clearSession();
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Topographic motif `src/auth/presentation/login/topographic-motif.tsx`** (the signature element — SVG contour lines, slow drift, reduced-motion safe)
```tsx
export default function TopographicMotif() {
  // Concentric contour rings evoking terrain/territories. Pure SVG, GPU-cheap.
  const rings = Array.from({ length: 9 }, (_, i) => 120 + i * 64);
  return (
    <svg
      aria-hidden
      className="motion-safe:animate-[drift_40s_linear_infinite] absolute inset-0 h-full w-full opacity-[0.18]"
      viewBox="0 0 600 600"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="c" cx="50%" cy="30%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </radialGradient>
      </defs>
      {rings.map((r) => (
        <circle key={r} cx="300" cy="200" r={r} fill="none" stroke="url(#c)" strokeWidth="1" />
      ))}
    </svg>
  );
}
```
Add the keyframe to `src/app/globals.css`:
```css
@keyframes drift {
  from { transform: translateY(0) scale(1); }
  50%  { transform: translateY(-14px) scale(1.02); }
  to   { transform: translateY(0) scale(1); }
}
```

- [ ] **Step 5: Login form `src/auth/presentation/login/login-form.tsx`** (client; two-step)
```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [step, setStep] = useState<"creds" | "2fa">("creds");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Sign in failed");
      if (data.twoFactorRequired) { setChallenge(data.challengeToken); setStep("2fa"); }
      else router.replace(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
    finally { setBusy(false); }
  }

  async function submit2FA(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login/2fa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: challenge, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Invalid code");
      router.replace(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid code"); }
    finally { setBusy(false); }
  }

  const inputCls = "mt-2 block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors duration-200 focus:border-cyan-300/60";
  const label = "block text-xs uppercase tracking-[0.2em] text-neutral-400";

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">
        {step === "creds" ? "Sign in" : "Two-factor"}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
        {step === "creds" ? "Welcome back" : "Enter your code"}
      </h1>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : null}

      {step === "creds" ? (
        <form className="mt-6 flex flex-col gap-4" onSubmit={submitCreds}>
          <div>
            <label className={label} htmlFor="id">Email or username</label>
            <input id="id" autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={label} htmlFor="pw">Password</label>
            <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </div>
          <button type="submit" disabled={busy || !identifier || !password}
            className="mt-2 cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={submit2FA}>
          <div>
            <label className={label} htmlFor="code">Authenticator or recovery code</label>
            <input id="code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric"
              className="mt-2 block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center font-[family-name:var(--font-geist-mono)] text-lg tracking-[0.3em] tabular-nums text-white outline-none focus:border-cyan-300/60" />
          </div>
          <button type="submit" disabled={busy || !code}
            className="cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-cyan-200 disabled:bg-white/30 disabled:text-white/50">
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button type="button" onClick={() => { setStep("creds"); setCode(""); setError(""); }}
            className="cursor-pointer text-xs uppercase tracking-[0.2em] text-neutral-400 transition-colors hover:text-cyan-200">← Back</button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Login page `src/app/login/page.tsx`** (two-column shell)
```tsx
import { Suspense } from "react";
import LoginForm from "@/auth/presentation/login/login-form";
import TopographicMotif from "@/auth/presentation/login/topographic-motif";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white md:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-white/10 md:flex md:flex-col md:justify-end md:p-12">
        <TopographicMotif />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Rosneft · 3D Platform</p>
          <h2 className="mt-4 max-w-sm text-4xl font-semibold leading-tight tracking-tight">
            Territories & models, rendered with precision.
          </h2>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Build + manual check**

```bash
cd frontend && yarn build 2>&1 | tail -15
docker compose -f ../docker-compose.yml -p andrey up --build -d frontend
```
Then in a browser: visiting `http://localhost:3000/` with no session → redirects to `/login`. Logging in as `admin` / `change-me-now` → lands on `/` (catalog). A 2FA-enabled user → sees the code step.

- [ ] **Step 8: Commit** — `git add frontend/src/app/api/auth frontend/src/auth/infrastructure/session-cookie.ts frontend/src/app/login frontend/src/auth/presentation/login frontend/src/app/globals.css && git commit -m "feat(frontend): login (password + 2FA) with cookie session"`

---

## Phase C — App shell: current user, user menu, gated pages

### Task C1: Current-user provider + server helper

**Files:**
- Create: `frontend/src/auth/application/current-user.ts` (server helper), `frontend/src/auth/presentation/current-user-context.tsx` (client context)
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Produces: `getCurrentUser(): Promise<Principal | null>` (server); `useCurrentUser(): Principal | null` (client). Root layout seeds the context from the server.

- [ ] **Step 1: Server helper `src/auth/application/current-user.ts`**
```ts
import "server-only";
import { getMe } from "@/auth/infrastructure/auth-gateway";
import type { Principal } from "@/auth/domain/principal";

// Returns the signed-in principal, or null when there is no valid session
// (e.g. on /login). Never throws.
export async function getCurrentUser(): Promise<Principal | null> {
  try {
    return await getMe();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Client context `src/auth/presentation/current-user-context.tsx`**
```tsx
"use client";

import { createContext, useContext } from "react";
import type { Principal } from "@/auth/domain/principal";

const Ctx = createContext<Principal | null>(null);

export function CurrentUserProvider({ value, children }: { value: Principal | null; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentUser(): Principal | null {
  return useContext(Ctx);
}
```

- [ ] **Step 3: Seed it in `src/app/layout.tsx`** (root layout is a server component)
```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Toaster from "@/shared/presentation/toast/toaster";
import ConfirmModal from "@/shared/presentation/confirm/confirm-modal";
import { getCurrentUser } from "@/auth/application/current-user";
import { CurrentUserProvider } from "@/auth/presentation/current-user-context";
import UserMenu from "@/auth/presentation/user-menu";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Andrey 3D Viewer",
  description: "Interactive viewer for OBJ models",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const principal = await getCurrentUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <CurrentUserProvider value={principal}>
          {principal ? <UserMenu /> : null}
          {children}
        </CurrentUserProvider>
        <Toaster />
        <ConfirmModal />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Build** — won't compile until `UserMenu` exists (C2). Proceed to C2, then build.

### Task C2: User menu

**Files:**
- Create: `frontend/src/auth/presentation/user-menu.tsx`

**Interfaces:**
- Consumes: `useCurrentUser()`, `can()`.
- Produces: a fixed top-right avatar menu with **Console** (if `can(p,'users:read') || can(p,'roles:read')`), **Account** (`/account`), **Log out**.

- [ ] **Step 1: Write `user-menu.tsx`**
```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";

export default function UserMenu() {
  const p = useCurrentUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!p) return null;

  const initials = (p.username || p.email).slice(0, 2).toUpperCase();
  const showConsole = can(p, "users:read") || can(p, "roles:read");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="fixed right-4 top-4 z-50">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/50 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/70">
        {initials}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-white/15 bg-[#0c0d10]/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-white">{p.username}</p>
              <p className="truncate text-xs text-neutral-400">{p.email}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {p.roleSlugs.map((r) => (
                  <span key={r} className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300">{r}</span>
                ))}
              </p>
            </div>
            <div className="my-1 h-px bg-white/10" />
            {showConsole ? (
              <Link href="/admin/users" onClick={() => setOpen(false)} role="menuitem"
                className="block rounded-md px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-white/10">Console</Link>
            ) : null}
            <Link href="/account" onClick={() => setOpen(false)} role="menuitem"
              className="block rounded-md px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-white/10">Account</Link>
            <button type="button" onClick={logout} role="menuitem"
              className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm text-red-200 transition-colors hover:bg-red-500/15">Log out</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Build + manual check** — `cd frontend && yarn build 2>&1 | tail` then rebuild the frontend container. After login, the avatar appears top-right; the menu shows Console (for admin/owner), Account, Log out; Log out returns to `/login`.

- [ ] **Step 3: Commit** — `git add frontend/src/auth/application/current-user.ts frontend/src/auth/presentation/current-user-context.tsx frontend/src/auth/presentation/user-menu.tsx frontend/src/app/layout.tsx && git commit -m "feat(frontend): current-user provider + user menu"`

### Task C3: Gate existing New/Delete by permission

**Files:**
- Modify: `frontend/src/app/page.tsx` (home grid — gate New + Delete per permission)

**Interfaces:**
- Consumes: `getCurrentUser()`, `can()`.

- [ ] **Step 1: Gate the home page affordances.** In `src/app/page.tsx`, read the principal server-side and pass capability flags into each `Section` so New/Delete render only when permitted:
```tsx
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";
// ...inside Home(), after fetching territories/models:
  const p = await getCurrentUser();
  const territoryWrite = can(p, "territory:write");
  const territoryDelete = can(p, "territory:delete");
  const modelWrite = can(p, "model:write");
  const modelDelete = can(p, "model:delete");
```
Then pass `newHref={territoryWrite ? "/territories/new" : undefined}` and only render the per-item delete control when the matching `*Delete` flag is true (wrap the existing `renderDelete` so it returns `null` when the flag is false). The `Section` component already treats a missing `newHref`/`renderDelete` as "no button". Apply the same for models.

- [ ] **Step 2: Build + manual check** — log in as `viewer` → no New/Delete on the catalog; as `admin` → both present.

- [ ] **Step 3: Commit** — `git add frontend/src/app/page.tsx && git commit -m "feat(frontend): gate catalog New/Delete by permission"`

---

## Phase D — Console `/admin`

### Task D1: Console shell + sidebar + gate

**Files:**
- Create: `frontend/src/app/admin/layout.tsx`, `frontend/src/app/admin/page.tsx`
- Create: `frontend/src/auth/presentation/console/console-sidebar.tsx`

**Interfaces:**
- Produces: `/admin` gated to users with `users:read` or `roles:read`; sidebar links Users/Roles, and Content only when the user has a content permission. `/admin` redirects to `/admin/users`.

- [ ] **Step 1: Gate + shell `src/app/admin/layout.tsx`** (server)
```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";
import ConsoleSidebar from "@/auth/presentation/console/console-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const p = await getCurrentUser();
  if (!p || !(can(p, "users:read") || can(p, "roles:read"))) redirect("/");
  const showContent = can(p, "territory:write") || can(p, "model:write");
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 py-12 sm:px-10 md:grid-cols-[200px_1fr]">
        <ConsoleSidebar showContent={showContent} />
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Redirect `src/app/admin/page.tsx`**
```tsx
import { redirect } from "next/navigation";
export default function AdminIndex() { redirect("/admin/users"); }
```

- [ ] **Step 3: Sidebar `src/auth/presentation/console/console-sidebar.tsx`** (client; active highlight)
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/roles", label: "Roles & Permissions" },
];

export default function ConsoleSidebar({ showContent }: { showContent: boolean }) {
  const path = usePathname();
  const items = showContent ? [...ITEMS, { href: "/admin/content", label: "Content" }] : ITEMS;
  return (
    <nav className="flex flex-col gap-1">
      <p className="mb-2 text-xs uppercase tracking-[0.36em] text-cyan-300/80">Console</p>
      {items.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5 hover:text-white"}`}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Build + commit** (Users page in D2 makes /admin/users resolve; for now stub `app/admin/users/page.tsx` → `export default function P(){return null}`). `git add frontend/src/app/admin frontend/src/auth/presentation/console && git commit -m "feat(frontend): console shell + sidebar + gate"`

### Task D2: Users section

**Files:**
- Create: `frontend/src/auth/application/use-users-admin.ts`
- Create: `frontend/src/app/admin/users/page.tsx`
- Create: `frontend/src/auth/presentation/console/users-table.tsx`, `user-row.tsx`, `create-user-drawer.tsx`, `status-badge.tsx`

**Interfaces:**
- Consumes: the admin gateway functions from B3, `useCurrentUser`, `can`, `notify`, `confirmAction`, `<Dropdown>`, `<Field>`.
- Produces: `useUsersAdmin()` → `{ users, loading, status, setStatus, includeDeleted, setIncludeDeleted, reload, act }` where `act` runs a mutation + reloads + toasts.

- [ ] **Step 1: Hook `use-users-admin.ts`**
```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { listUsers } from "@/auth/infrastructure/auth-admin-gateway";
import type { AdminUser } from "@/auth/domain/user";
import { notify } from "@/shared/presentation/toast/use-toast";

export function useUsersAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers(status, includeDeleted));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [status, includeDeleted]);

  useEffect(() => { void reload(); }, [reload]);

  const act = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      await reload();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Action failed");
    }
  }, [reload]);

  return { users, loading, status, setStatus, includeDeleted, setIncludeDeleted, reload, act };
}
```

- [ ] **Step 2: `status-badge.tsx`**
```tsx
const tone: Record<string, string> = {
  active: "border-emerald-300/40 bg-emerald-500/15 text-emerald-200",
  frozen: "border-amber-300/40 bg-amber-500/15 text-amber-200",
  deleted: "border-white/15 bg-white/5 text-neutral-400",
};
export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${tone[status] ?? tone.deleted}`}>
      {status}
    </span>
  );
}
```

- [ ] **Step 3: `user-row.tsx`** (per-row actions, gated by `can`)
```tsx
"use client";

import type { AdminUser } from "@/auth/domain/user";
import type { Principal } from "@/auth/domain/principal";
import { can } from "@/auth/domain/principal";
import StatusBadge from "@/auth/presentation/console/status-badge";
import { confirmAction } from "@/shared/presentation/confirm/use-confirm";
import { freezeUser, unfreezeUser, deleteUser, restoreUser } from "@/auth/infrastructure/auth-admin-gateway";

interface Props {
  u: AdminUser;
  me: Principal;
  onEditRoles: (u: AdminUser) => void;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}

export default function UserRow({ u, me, onEditRoles, act }: Props) {
  const self = u.id === me.id;
  return (
    <tr className="border-t border-white/10">
      <td className="px-3 py-2 text-sm text-white">{u.username}</td>
      <td className="px-3 py-2 text-sm text-neutral-300">{u.email}</td>
      <td className="px-3 py-2">
        <span className="flex flex-wrap gap-1">
          {u.roleSlugs.map((r) => (
            <span key={r} className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300">{r}</span>
          ))}
        </span>
      </td>
      <td className="px-3 py-2"><StatusBadge status={u.status} /></td>
      <td className="px-3 py-2 text-xs text-neutral-400">{u.totpEnabled ? "2FA" : "—"}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-2 text-xs">
          {can(me, "users:write") ? (
            <button type="button" onClick={() => onEditRoles(u)} className="cursor-pointer text-neutral-300 hover:text-cyan-300">Roles</button>
          ) : null}
          {can(me, "users:freeze") && !self && u.status !== "deleted" ? (
            u.status === "frozen"
              ? <button type="button" onClick={() => act(() => unfreezeUser(u.id), "Unfrozen")} className="cursor-pointer text-neutral-300 hover:text-emerald-300">Unfreeze</button>
              : <button type="button" onClick={() => act(() => freezeUser(u.id), "Frozen")} className="cursor-pointer text-neutral-300 hover:text-amber-300">Freeze</button>
          ) : null}
          {can(me, "users:delete") && !self ? (
            u.status === "deleted"
              ? <button type="button" onClick={() => act(() => restoreUser(u.id), "Restored")} className="cursor-pointer text-neutral-300 hover:text-emerald-300">Restore</button>
              : <button type="button" onClick={async () => {
                  if (await confirmAction({ title: "Delete user", message: `Soft-delete ${u.username}?`, danger: true, confirmLabel: "Delete" })) {
                    void act(() => deleteUser(u.id), "Deleted");
                  }
                }} className="cursor-pointer text-neutral-300 hover:text-red-400">Delete</button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: `create-user-drawer.tsx`** (modal; email/username/password + role multi-select via checkboxes)
```tsx
"use client";

import { useState } from "react";
import Field from "@/upload/presentation/components/field";
import type { Role } from "@/auth/domain/role";
import { createUser } from "@/auth/infrastructure/auth-admin-gateway";
import { notify } from "@/shared/presentation/toast/use-toast";

export default function CreateUserDrawer({ roles, onClose, onCreated }: { roles: Role[]; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createUser(email, username, password, picked);
      notify.success("User created");
      onCreated();
      onClose();
    } catch (e) { notify.error(e instanceof Error ? e.message : "Create failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">New user</p>
        <Field label="Email" value={email} onChange={setEmail} required />
        <Field label="Username" value={username} onChange={setUsername} required />
        <Field label="Password" value={password} onChange={setPassword} required />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Roles</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {roles.map((r) => (
              <button key={r.slug} type="button" onClick={() => toggle(r.slug)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${picked.includes(r.slug) ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-white/15 text-neutral-300 hover:bg-white/10"}`}>
                {r.slug}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-white/20 px-4 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.06]">Cancel</button>
          <button type="submit" disabled={busy || !email || !username || !password}
            className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50">{busy ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: `users-table.tsx`** (wires the hook + rows + create + edit-roles)
```tsx
"use client";

import { useState } from "react";
import { useUsersAdmin } from "@/auth/application/use-users-admin";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import UserRow from "@/auth/presentation/console/user-row";
import CreateUserDrawer from "@/auth/presentation/console/create-user-drawer";
import EditRolesDrawer from "@/auth/presentation/console/edit-roles-drawer";
import { Dropdown } from "@/shared/presentation/components/dropdown/dropdown";
import type { Role } from "@/auth/domain/role";
import type { AdminUser } from "@/auth/domain/user";

export default function UsersTable({ roles }: { roles: Role[] }) {
  const me = useCurrentUser()!;
  const { users, loading, status, setStatus, includeDeleted, setIncludeDeleted, reload, act } = useUsersAdmin();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const scoped = !can(me, "users:read_all");

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-xs text-neutral-400">{scoped ? "Showing users you created" : "All users"}</p>
        </div>
        {can(me, "users:write") ? (
          <button type="button" onClick={() => setCreating(true)} className="cursor-pointer rounded-full bg-white px-5 py-2 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200">+ New user</button>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Dropdown label="STATUS" value={status} onChange={setStatus} placeholder="Any"
          options={[{ value: "", label: "Any" }, { value: "active", label: "Active" }, { value: "frozen", label: "Frozen" }, { value: "deleted", label: "Deleted" }]} />
        <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} className="accent-cyan-400" /> include deleted
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            <tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Roles</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">2FA</th><th /></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-neutral-500">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-neutral-500">No users.</td></tr>
            ) : users.map((u) => <UserRow key={u.id} u={u} me={me} act={act} onEditRoles={setEditing} />)}
          </tbody>
        </table>
      </div>

      {creating ? <CreateUserDrawer roles={roles} onClose={() => setCreating(false)} onCreated={reload} /> : null}
      {editing ? <EditRolesDrawer user={editing} roles={roles} onClose={() => setEditing(null)} onSaved={reload} /> : null}
    </div>
  );
}
```
Also create `edit-roles-drawer.tsx` (same modal shell as CreateUserDrawer but only the role chips + `updateUserRoles(user.id, picked)` on save, seeded from `user.roleSlugs`):
```tsx
"use client";
import { useState } from "react";
import type { AdminUser } from "@/auth/domain/user";
import type { Role } from "@/auth/domain/role";
import { updateUserRoles } from "@/auth/infrastructure/auth-admin-gateway";
import { notify } from "@/shared/presentation/toast/use-toast";

export default function EditRolesDrawer({ user, roles, onClose, onSaved }: { user: AdminUser; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const [picked, setPicked] = useState<string[]>(user.roleSlugs);
  const [busy, setBusy] = useState(false);
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  async function save() {
    setBusy(true);
    try { await updateUserRoles(user.id, picked); notify.success("Roles updated"); onSaved(); onClose(); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Roles · {user.username}</p>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <button key={r.slug} type="button" onClick={() => toggle(r.slug)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${picked.includes(r.slug) ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-white/15 text-neutral-300 hover:bg-white/10"}`}>{r.slug}</button>
          ))}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-white/20 px-4 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.06]">Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
```
(Confirm the `Dropdown` export name — the explorer showed `<Dropdown>`; import accordingly, default or named, matching `dropdown.tsx`.)

- [ ] **Step 6: Page `src/app/admin/users/page.tsx`** (RSC fetches roles once for the selectors, renders the client table)
```tsx
import { listRoles } from "@/auth/infrastructure/auth-admin-gateway";
import UsersTable from "@/auth/presentation/console/users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const roles = await listRoles();
  return <UsersTable roles={roles} />;
}
```

- [ ] **Step 7: Build + manual check + commit** — `cd frontend && yarn build && yarn lint`. Rebuild frontend container; as admin open `/admin/users` → full list + create/freeze/delete; as owner → only own users + the "Showing users you created" subheader. `git add frontend/src/auth frontend/src/app/admin/users && git commit -m "feat(frontend): console Users section"`

### Task D3: Roles & Permissions section

**Files:**
- Create: `frontend/src/auth/application/use-roles-admin.ts`
- Create: `frontend/src/app/admin/roles/page.tsx`
- Create: `frontend/src/auth/presentation/console/roles-panel.tsx`, `permission-matrix.tsx`, `create-role-form.tsx`

**Interfaces:**
- Consumes: roles/permissions gateway fns, `notify`, `confirmAction`.
- Produces: `useRolesAdmin()` → `{ roles, permissions, loading, reload, save, create, rename, remove }`.

- [ ] **Step 1: Hook `use-roles-admin.ts`**
```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { listRoles, listPermissions, setRolePermissions, createRole, renameRole, deleteRole } from "@/auth/infrastructure/auth-admin-gateway";
import type { Role } from "@/auth/domain/role";
import type { Permission } from "@/auth/domain/permission";
import { notify } from "@/shared/presentation/toast/use-toast";

export function useRolesAdmin() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([listRoles(), listPermissions()]);
      setRoles(r); setPermissions(p);
    } catch (e) { notify.error(e instanceof Error ? e.message : "Failed to load roles"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); notify.success(ok); await reload(); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Action failed"); }
  }, [reload]);

  return {
    roles, permissions, loading, reload,
    save: (slug: string, perms: string[]) => run(() => setRolePermissions(slug, perms), "Permissions saved"),
    create: (slug: string, title: string, perms: string[]) => run(() => createRole(slug, title, perms), "Role created"),
    rename: (slug: string, title: string) => run(() => renameRole(slug, title), "Renamed"),
    remove: (slug: string) => run(() => deleteRole(slug), "Role deleted"),
  };
}
```

- [ ] **Step 2: `permission-matrix.tsx`** (checkboxes grouped by resource prefix)
```tsx
"use client";

import { useMemo } from "react";
import type { Permission } from "@/auth/domain/permission";

export default function PermissionMatrix({ all, selected, onToggle, disabled }: {
  all: Permission[]; selected: string[]; onToggle: (slug: string) => void; disabled?: boolean;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of all) {
      const g = p.slug.split(":")[0];
      (m.get(g) ?? m.set(g, []).get(g)!).push(p);
    }
    return [...m.entries()];
  }, [all]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([group, perms]) => (
        <div key={group}>
          <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{group}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {perms.map((p) => {
              const on = selected.includes(p.slug);
              return (
                <button key={p.slug} type="button" disabled={disabled} onClick={() => onToggle(p.slug)} title={p.description}
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${on ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-white/15 text-neutral-300 hover:bg-white/10"}`}>
                  {p.slug.split(":")[1] ?? p.slug}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `roles-panel.tsx`** (list + selected detail + save/delete) and `create-role-form.tsx`
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRolesAdmin } from "@/auth/application/use-roles-admin";
import PermissionMatrix from "@/auth/presentation/console/permission-matrix";
import CreateRoleForm from "@/auth/presentation/console/create-role-form";
import { confirmAction } from "@/shared/presentation/confirm/use-confirm";

export default function RolesPanel() {
  const { roles, permissions, loading, save, create, remove } = useRolesAdmin();
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const role = roles.find((r) => r.slug === sel) ?? null;

  useEffect(() => { if (role) setDraft(role.permissionSlugs); }, [role]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Roles &amp; Permissions</h1>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-1">
          {loading ? <p className="text-sm text-neutral-500">Loading…</p> : roles.map((r) => (
            <button key={r.slug} type="button" onClick={() => setSel(r.slug)}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${sel === r.slug ? "border-cyan-400/60 bg-cyan-400/10 text-white" : "border-white/10 text-neutral-300 hover:border-white/25"}`}>
              <span>{r.title}</span>
              {r.isSystem ? <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">system</span> : null}
            </button>
          ))}
          <CreateRoleForm permissions={permissions} onCreate={create} />
        </div>

        {role ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">{role.title} <span className="text-neutral-500">· {role.slug}</span></p>
              {!role.isSystem ? (
                <button type="button" onClick={async () => { if (await confirmAction({ title: "Delete role", message: `Delete role ${role.slug}?`, danger: true })) remove(role.slug); }}
                  className="cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-red-200 hover:bg-red-500/20">Delete</button>
              ) : null}
            </div>
            <div className="mt-4"><PermissionMatrix all={permissions} selected={draft} onToggle={(s) => setDraft((d) => d.includes(s) ? d.filter((x) => x !== s) : [...d, s])} /></div>
            <button type="button" onClick={() => save(role.slug, draft)}
              className="mt-5 cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20">Save permissions</button>
          </div>
        ) : <p className="text-sm text-neutral-500">Select a role to edit its permissions.</p>}
      </div>
    </div>
  );
}
```
```tsx
// create-role-form.tsx
"use client";
import { useState } from "react";
import type { Permission } from "@/auth/domain/permission";

export default function CreateRoleForm({ permissions, onCreate }: { permissions: Permission[]; onCreate: (slug: string, title: string, perms: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 cursor-pointer rounded-md border border-dashed border-white/20 px-3 py-2 text-sm text-neutral-400 hover:text-cyan-200">+ New role</button>;
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2">
      <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" className="rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-cyan-300/60" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-cyan-300/60" />
      <div className="flex gap-2">
        <button type="button" disabled={!slug || !title} onClick={() => { onCreate(slug, title, []); setOpen(false); setSlug(""); setTitle(""); }} className="flex-1 cursor-pointer rounded border border-white/30 bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-50">Create</button>
        <button type="button" onClick={() => setOpen(false)} className="cursor-pointer rounded border border-white/15 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10">Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Page `src/app/admin/roles/page.tsx`**
```tsx
import RolesPanel from "@/auth/presentation/console/roles-panel";
export default function RolesPage() { return <RolesPanel />; }
```

- [ ] **Step 5: Build + manual check + commit** — as admin, `/admin/roles` → edit a role's permission matrix, save, create/delete a custom role. `git add frontend/src/auth frontend/src/app/admin/roles && git commit -m "feat(frontend): console Roles & Permissions section"`

### Task D4: Content hub (admin-only)

**Files:**
- Create: `frontend/src/app/admin/content/page.tsx`

- [ ] **Step 1: Content hub `src/app/admin/content/page.tsx`** (RSC; counts from existing gateways; gated by content perm)
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";
import { listTerritories } from "@/territory/infrastructure/territory-gateway";
import { listModels } from "@/model/infrastructure/model-gateway";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const p = await getCurrentUser();
  if (!p || !(can(p, "territory:write") || can(p, "model:write"))) redirect("/admin/users");
  const [territories, models] = await Promise.all([listTerritories(), listModels()]);
  const cards = [
    { href: "/territories", label: "Territories", count: territories.length, hint: "Upload, delete, place objects" },
    { href: "/models", label: "Models", count: models.length, hint: "Upload & delete placeable assets" },
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
      <p className="text-xs text-neutral-400">Manage the 3D catalog (admin-only).</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/30 hover:bg-white/[0.06]">
            <p className="text-3xl font-semibold tracking-tight text-white">{c.count}</p>
            <p className="mt-1 text-sm font-medium text-neutral-200">{c.label}</p>
            <p className="mt-3 text-xs text-neutral-400">{c.hint}</p>
            <span className="mt-4 inline-block text-xs uppercase tracking-[0.2em] text-cyan-300/80 transition group-hover:translate-x-1">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit** — `git add frontend/src/app/admin/content && git commit -m "feat(frontend): console Content hub"`

---

## Phase E — Account & 2FA self-service

### Task E1: Account page + change password

**Files:**
- Create: `frontend/src/app/account/page.tsx`
- Create: `frontend/src/auth/presentation/account/change-password-form.tsx`

**Interfaces:**
- Consumes: `changePassword`, `getCurrentUser`, `notify`, `<Field>`.

- [ ] **Step 1: Change-password form `src/auth/presentation/account/change-password-form.tsx`**
```tsx
"use client";

import { useState } from "react";
import Field from "@/upload/presentation/components/field";
import { changePassword } from "@/auth/infrastructure/auth-gateway";
import { notify } from "@/shared/presentation/toast/use-toast";

export default function ChangePasswordForm() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await changePassword(oldPw, newPw); notify.success("Password changed"); setOldPw(""); setNewPw(""); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Change failed"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Password</p>
      <Field label="Current password" value={oldPw} onChange={setOldPw} required />
      <Field label="New password" value={newPw} onChange={setNewPw} required />
      <button type="submit" disabled={busy || !oldPw || !newPw} className="cursor-pointer self-start rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200 disabled:bg-white/30 disabled:text-white/50">{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
}
```

- [ ] **Step 2: Account page `src/app/account/page.tsx`** (RSC seeds the 2FA status)
```tsx
import { getCurrentUser } from "@/auth/application/current-user";
import { redirect } from "next/navigation";
import ChangePasswordForm from "@/auth/presentation/account/change-password-form";
import TwoFactorSection from "@/auth/presentation/account/two-factor-section";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const p = await getCurrentUser();
  if (!p) redirect("/login");
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-16 sm:px-10">
        <header>
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Account</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{p.username}</h1>
          <p className="mt-1 text-sm text-neutral-400">{p.email}</p>
        </header>
        <ChangePasswordForm />
        <TwoFactorSection initiallyEnabled={p.totpEnabled} />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Build** — fails until `TwoFactorSection` exists (E2). Proceed.

### Task E2: Two-factor setup / enable / disable

**Files:**
- Create: `frontend/src/auth/presentation/account/two-factor-section.tsx`, `recovery-codes.tsx`

**Interfaces:**
- Consumes: `setup2FA`, `enable2FA`, `disable2FA`, `qrcode.react` (`QRCodeSVG`), `notify`.

- [ ] **Step 1: Recovery-codes display `recovery-codes.tsx`**
```tsx
export default function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Save these recovery codes</p>
      <p className="mt-1 text-xs text-neutral-300">Each works once if you lose your authenticator. They won&apos;t be shown again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-[family-name:var(--font-geist-mono)] text-sm text-emerald-100">
        {codes.map((c) => <li key={c} className="rounded bg-black/30 px-2 py-1 text-center tracking-widest">{c}</li>)}
      </ul>
      <button type="button" onClick={onDone} className="mt-4 cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm text-white hover:bg-white/20">I saved them</button>
    </div>
  );
}
```

- [ ] **Step 2: `two-factor-section.tsx`** (state machine: idle → setup → enabled / disable)
```tsx
"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { setup2FA, enable2FA, disable2FA } from "@/auth/infrastructure/auth-gateway";
import { notify } from "@/shared/presentation/toast/use-toast";
import RecoveryCodes from "@/auth/presentation/account/recovery-codes";

type Mode = "idle" | "setup" | "codes" | "disable";

export default function TwoFactorSection({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [mode, setMode] = useState<Mode>("idle");
  const [otpauth, setOtpauth] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const cardCls = "flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur";
  const codeInput = "rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center font-[family-name:var(--font-geist-mono)] text-lg tracking-[0.3em] tabular-nums text-white outline-none focus:border-cyan-300/60";

  async function begin() {
    setBusy(true);
    try { const r = await setup2FA(); setSecret(r.secret); setOtpauth(r.otpauthUrl); setMode("setup"); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Setup failed"); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true);
    try { setCodes(await enable2FA(code)); setEnabled(true); setCode(""); setMode("codes"); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Invalid code"); }
    finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true);
    try { await disable2FA(code); setEnabled(false); setCode(""); setMode("idle"); notify.success("2FA disabled"); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Invalid code"); }
    finally { setBusy(false); }
  }

  if (mode === "codes") return <div className={cardCls}><p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Two-factor</p><RecoveryCodes codes={codes} onDone={() => setMode("idle")} /></div>;

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Two-factor</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${enabled ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-200" : "border-white/15 text-neutral-400"}`}>{enabled ? "On" : "Off"}</span>
      </div>

      {mode === "idle" && !enabled ? (
        <button type="button" disabled={busy} onClick={begin} className="cursor-pointer self-start rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200 disabled:bg-white/30">{busy ? "…" : "Enable 2FA"}</button>
      ) : null}

      {mode === "idle" && enabled ? (
        <button type="button" onClick={() => setMode("disable")} className="cursor-pointer self-start rounded-full border border-red-300/40 bg-red-500/10 px-6 py-3 text-xs uppercase tracking-[0.2em] text-red-200 hover:bg-red-500/20">Disable 2FA</button>
      ) : null}

      {mode === "setup" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-300">Scan with your authenticator, then enter the 6-digit code.</p>
          <div className="self-start rounded-xl bg-[#0c0d10] p-3"><QRCodeSVG value={otpauth} size={160} bgColor="#0c0d10" fgColor="#e5e7eb" /></div>
          <p className="break-all text-[11px] text-neutral-500">Manual key: <span className="font-[family-name:var(--font-geist-mono)] text-neutral-300">{secret}</span></p>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="000000" className={codeInput} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !code} onClick={confirm} className="cursor-pointer rounded-full bg-white px-6 py-2 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200 disabled:bg-white/30">{busy ? "…" : "Confirm"}</button>
            <button type="button" onClick={() => setMode("idle")} className="cursor-pointer rounded-full border border-white/20 px-6 py-2 text-xs uppercase tracking-[0.2em] text-white hover:bg-white/[0.08]">Cancel</button>
          </div>
        </div>
      ) : null}

      {mode === "disable" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-300">Enter a current code to disable 2FA.</p>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="000000" className={codeInput} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !code} onClick={turnOff} className="cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-6 py-2 text-xs uppercase tracking-[0.2em] text-red-200 hover:bg-red-500/20 disabled:opacity-50">{busy ? "…" : "Disable"}</button>
            <button type="button" onClick={() => setMode("idle")} className="cursor-pointer rounded-full border border-white/20 px-6 py-2 text-xs uppercase tracking-[0.2em] text-white hover:bg-white/[0.08]">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Build + manual e2e + commit**

```bash
cd frontend && yarn build && yarn lint
docker compose -f ../docker-compose.yml -p andrey up --build -d frontend
```
Manual: `/account` → change password; enable 2FA (scan QR in an authenticator, enter code, save recovery codes); log out; log in → 2FA step prompts; disable 2FA with a code. `git add frontend/src/app/account frontend/src/auth/presentation/account && git commit -m "feat(frontend): account — change password + 2FA self-service"`

---

## Self-Review

**Spec coverage** (spec §→ task):
- §2 auth plumbing (cookie + BFF + middleware + RSC + 401) → B2, B4.
- §3 login (split layout, contour signature, 2FA step) → B4.
- §4 console (Users/Roles/Content, gated) → D1–D4.
- §5 owner-scoping (created_by, users:read_all, actor threading, scoped list, ownership guard) → A1–A4.
- §6 account/header/2FA → C2 (menu), E1–E2.
- §7 architecture (auth context, BFF, providers, dto regen) → B1, B3, C1.
- §8 out-of-scope honored (no register, no dashboard, no settings).

**Placeholder scan:** no TBD/TODO; every code step has full code. Two flagged follow-ups are explicit, not placeholders: the `next/headers` dynamic-import fallback (B2 Step 3) and confirming the `Dropdown` export name (D2 Step 5).

**Type consistency:** `Principal`/`AdminUser` shape consistent across gateway↔hooks↔components; `mapPrincipal` reused by self + admin gateways; service signatures `(actorID, scopeAll, …)` consistent A3↔A4; gateway client token args consistent A4↔(existing). `can(principal, perm)` used uniformly.

**Known deliberate follow-ups (documented, not hidden):**
- Email/username edit in `UpdateUser` stays roles-only (backend v1).
- The viewer overlay keeps its own top-left chrome; the global UserMenu sits top-right and may visually coexist — fine.
- No automated frontend tests (no runner); verification is build + lint + manual e2e against the Docker stack.
