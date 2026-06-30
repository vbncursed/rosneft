# Territory Visibility Scoping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope territory visibility by the admin hierarchy — Root sees all; an admin sees only territories Root assigned to him; everyone in the admin's `created_by` subtree inherits that set.

**Architecture:** auth-service resolves each user's `owning_admin_id` at login (recursive `created_by` walk) and ships it in `ValidateToken`. catalog-service owns a `territory_assignments(territory_id, admin_user_id)` table and filters `ListTerritories`/`GetTerritory` by a `scope_admin_id`. gateway-service threads the caller's scope from the session principal into catalog calls, and exposes Root-only assignment endpoints. Frontend gets a Root-only "Assign admins" drawer.

**Tech Stack:** Go 1.26 (auth/catalog/gateway services), gRPC + buf codegen, goose SQL migrations, pgx/pgxpool, oapi-codegen (gateway HTTP), Next.js 16 / React 19 / Tailwind v4 (frontend), openapi-typescript DTOs.

**Spec:** `docs/superpowers/specs/2026-06-30-territory-visibility-design.md`

## Global Constraints

- **200 lines / file hard cap** (backend + frontend ESLint `max-lines: 200`, skipBlankLines/skipComments). One query per file / one method per file is the backend convention — each new method gets its own file.
- **Clean Architecture layering**: `domain` / `application|service` / `infrastructure|transport|storage` / `presentation`. Presentation never imports infrastructure/DTOs.
- **Touch only what this feature needs.** No unrelated refactors. Changes to shared functions must be additive and behavior-preserving for existing callers (see "Flow Safety" below).
- **Banned brand word**: never put "Rosneft"/"Роснефть" in any displayed text (UI copy, labels) — the brand is "Andrey". Lowercase `rosneft` in import paths/module names is structural and stays.
- **Modern Go** up to 1.26 (`any`, `slices`, `errors.Is`, `min`/`max`, `for i := range n`, `t.Context()` in tests).
- **gRPC errors** use `status.Error` with a specific `codes.*`; "foreign/unassigned territory" surfaces as `NotFound` (404), mirroring the existing user-scoping behavior.
- **Parameterized SQL only.** Never interpolate values. Dynamic `IN`/value sets via placeholders.
- Codegen commands: backend proto → `cd backend/proto && buf generate` (alias `make proto-gen`); gateway HTTP → `make openapi-gen` (run from `backend/`); frontend DTOs → `npm run openapi:generate` (run from `frontend/`).

---

## Flow Safety (regression walk — read before coding)

Two shared functions change. Both changes are additive and backward-compatible. The full caller list:

### A. catalog `ListTerritories` / `GetTerritory` gain a `scope_admin_id`

**Other callers besides the gateway:** `mesh-service/internal/catalog/list_targets.go:17` (the conversion reconciler) calls `cc.ListTerritories(ctx, &catalogv1.ListTerritoriesRequest{})`.

**Invariant that keeps mesh working untouched:** the catalog storage filter applies **only when `scope_admin_id != ""`**. mesh sends an empty request → `scope_admin_id == ""` → no filter → mesh keeps seeing every territory. **Do NOT edit mesh-service.**

**Security:** a non-root caller's `owning_admin_id` is *always* non-empty by construction (`pickOwningAdmin` returns the caller itself in the worst case; only a Root or an internal empty request yields `""`). So a non-root user can never accidentally hit the "no filter" branch. Root is handled by the gateway sending `scope_admin_id == ""` deliberately.

### B. auth `ValidateToken` returns one extra value (`owning_admin_id`)

Every caller of the 4-tuple `ValidateToken(ctx, token) (string, []string, bool, error)` must move to the 5-tuple `(string, []string, bool, string, error)`. Exhaustive list (all inside auth-service + gateway — the auth path itself):

- `auth-service/internal/service/auth/validate_token.go:8` — the implementation (returns the new value).
- `auth-service/internal/transport/grpcapi/server.go:23` — the `AuthFlow` interface signature.
- `auth-service/internal/transport/grpcapi/server.go:77` — `userIDFromToken`, uses uid only → add one `_`.
- `auth-service/internal/transport/grpcapi/server.go:85` — `actor`, uses uid/perms/isOwner → add one `_`.
- `auth-service/internal/transport/grpcapi/login.go:37` — the `ValidateToken` gRPC handler (puts the value in the response).
- `gateway-service/internal/clients/auth/session.go:30` — the gateway auth client (returns the new value).
- `gateway-service/internal/transport/authhttp/middleware.go:20` — `Authenticate` (stores it in the principal).

No other service calls `ValidateToken`. Behavior for existing fields (uid/perms/isOwner) is unchanged; the new proto field defaults to `""` on the wire.

### C. Things deliberately NOT changed

- Territory **mutations** (create/edit/delete) stay permission-gated as today. Only Root creates territories (decision), and unassigned territories are already hidden from non-root edit UIs via the scoped `GetTerritory`. No scope checks added to write paths.
- **Models / placements / panoramas / documents** stay global (out of scope).
- mesh-service, asset-service, upload-service: untouched.

---

## File Structure

**auth-service** (hierarchy resolution + session):
- Create `internal/storage/users/pick_owning_admin.go` — pure `pickOwningAdmin([]ChainNode) string`.
- Create `internal/storage/users/pick_owning_admin_test.go` — table test.
- Create `internal/storage/users/resolve_owning_admin.go` — `(*Store).ResolveOwningAdmin` (recursive CTE → pick).
- Modify `internal/domain/session.go` — add `OwningAdminID`.
- Modify `internal/service/auth/login.go` — compute & store it in `issue`.
- Modify `internal/service/auth/validate_token.go` — return it.
- Modify `internal/transport/grpcapi/server.go`, `login.go` — 5-tuple + response field.
- Modify `backend/proto/rosneft/auth/v1/auth.proto` — `ValidateTokenResponse.owning_admin_id`.

**catalog-service** (assignments + scope filter):
- Create `internal/migrate/migrations/00011_territory_assignments.sql`.
- Create `internal/storage/set_territory_admins.go`, `internal/storage/get_territory_admins.go`.
- Modify `internal/storage/list_territories.go`, `internal/storage/get_territory.go` — scope filter.
- Create `internal/service/set_territory_admins.go`, `internal/service/get_territory_admins.go`.
- Create `internal/service/set_territory_admins_test.go` — empty-slug validation.
- Modify `internal/service/list_territories.go`, `internal/service/get_territory.go`, `internal/service/catalog.go` (Repository interface), `internal/transport/grpcapi/server.go` (Service interface).
- Modify `internal/transport/grpcapi/list_territories.go`, `get_territory.go`; create `set_territory_admins.go`, `get_territory_admins.go` (grpcapi handlers).
- Modify `backend/proto/rosneft/catalog/v1/catalog.proto`.

**gateway-service** (thread scope + endpoints):
- Modify `internal/transport/authhttp/principal.go` (owning-admin key + exported `Scope`/`IsOwner`), `middleware.go` (5-tuple), `internal/clients/auth/session.go` (5-tuple).
- Modify `internal/clients/catalog/territories.go` — scope params; create `internal/clients/catalog/territory_admins.go`.
- Modify `internal/service/territories.go`, `internal/service/scene_bundle.go`, `internal/service/gateway.go` (Catalog port iface); create `internal/service/territory_admins.go`.
- Modify `internal/transport/httpapi/territories.go` (read scope) + create `internal/transport/httpapi/territory_admins.go`; modify `internal/transport/httpapi/server.go` (Service iface).
- Modify `api/openapi.yaml`.

**frontend**:
- Create `src/territory/infrastructure/territory-admins-gateway.ts`.
- Create `src/territory/presentation/assign-admins-drawer.tsx`.
- Create `src/app/_components/assign-admins-button.tsx`.
- Modify `src/app/territories/page.tsx` and `src/app/page.tsx` (Root-gated trigger).

---

## PHASE 1 — auth-service: owning-admin resolution

### Task 1.1: Pure `pickOwningAdmin` + test

**Files:**
- Create: `backend/services/auth-service/internal/storage/users/pick_owning_admin.go`
- Test: `backend/services/auth-service/internal/storage/users/pick_owning_admin_test.go`

**Interfaces:**
- Produces: `type ChainNode struct { ID string; IsOwner bool }` and `func pickOwningAdmin(chain []ChainNode) string` (chain ordered self-first, ascending depth). Used by Task 1.2.

- [ ] **Step 1: Write the failing test**

```go
package users

import "testing"

func TestPickOwningAdmin(t *testing.T) {
	tests := []struct {
		name  string
		chain []ChainNode
		want  string
	}{
		{"caller is root", []ChainNode{{ID: "root", IsOwner: true}}, ""},
		{"admin directly under root", []ChainNode{{ID: "admin", IsOwner: false}, {ID: "root", IsOwner: true}}, "admin"},
		{"manager under admin under root", []ChainNode{{ID: "mgr", IsOwner: false}, {ID: "admin", IsOwner: false}, {ID: "root", IsOwner: true}}, "admin"},
		{"orphan with no root ancestor", []ChainNode{{ID: "a", IsOwner: false}, {ID: "b", IsOwner: false}}, "b"},
		{"single non-root self", []ChainNode{{ID: "solo", IsOwner: false}}, "solo"},
		{"empty chain", nil, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := pickOwningAdmin(tt.chain); got != tt.want {
				t.Errorf("pickOwningAdmin() = %q, want %q", got, tt.want)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./services/auth-service/internal/storage/users/ -run TestPickOwningAdmin -v`
Expected: FAIL — `undefined: pickOwningAdmin` / `undefined: ChainNode`.

- [ ] **Step 3: Write minimal implementation**

```go
package users

// ChainNode is one user on the created_by chain, self-first.
type ChainNode struct {
	ID      string
	IsOwner bool
}

// pickOwningAdmin returns the caller's owning admin: the node directly below the
// first Root encountered walking up. Empty when the caller is a Root. For a
// chain with no Root ancestor, the topmost ancestor is treated as the tenant
// root. A non-Root caller therefore always resolves to a non-empty id.
func pickOwningAdmin(chain []ChainNode) string {
	for i, n := range chain {
		if n.IsOwner {
			if i == 0 {
				return "" // caller itself is a Root
			}
			return chain[i-1].ID
		}
	}
	if len(chain) == 0 {
		return ""
	}
	return chain[len(chain)-1].ID
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./services/auth-service/internal/storage/users/ -run TestPickOwningAdmin -v`
Expected: PASS (all 6 subtests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/auth-service/internal/storage/users/pick_owning_admin.go backend/services/auth-service/internal/storage/users/pick_owning_admin_test.go
git commit -m "feat(auth): pure owning-admin picker for created_by chain"
```

---

### Task 1.2: `ResolveOwningAdmin` storage method (recursive CTE)

**Files:**
- Create: `backend/services/auth-service/internal/storage/users/resolve_owning_admin.go`

**Interfaces:**
- Consumes: `ChainNode`, `pickOwningAdmin` (Task 1.1); `Store{pool *pgxpool.Pool}` (existing, store.go).
- Produces: `func (s *Store) ResolveOwningAdmin(ctx context.Context, userID string) (string, error)`. Used by Task 1.3.

- [ ] **Step 1: Write the implementation**

```go
package users

import (
	"context"
	"fmt"
)

// ResolveOwningAdmin walks the created_by chain upward from userID and returns
// the owning admin id (see pickOwningAdmin). Empty for a Root. The depth guard
// caps the walk in case created_by data ever contains a cycle.
func (s *Store) ResolveOwningAdmin(ctx context.Context, userID string) (string, error) {
	const q = `
WITH RECURSIVE chain AS (
    SELECT id, created_by, is_owner, 0 AS depth
    FROM users WHERE id = $1
    UNION ALL
    SELECT u.id, u.created_by, u.is_owner, c.depth + 1
    FROM users u JOIN chain c ON u.id = c.created_by
    WHERE c.depth < 64
)
SELECT id, is_owner FROM chain ORDER BY depth`

	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return "", fmt.Errorf("users.ResolveOwningAdmin: query: %w", err)
	}
	defer rows.Close()

	chain := make([]ChainNode, 0, 8)
	for rows.Next() {
		var n ChainNode
		if err := rows.Scan(&n.ID, &n.IsOwner); err != nil {
			return "", fmt.Errorf("users.ResolveOwningAdmin: scan: %w", err)
		}
		chain = append(chain, n)
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("users.ResolveOwningAdmin: rows: %w", err)
	}
	return pickOwningAdmin(chain), nil
}
```

- [ ] **Step 2: Build**

Run: `cd backend && go build ./services/auth-service/...`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add backend/services/auth-service/internal/storage/users/resolve_owning_admin.go
git commit -m "feat(auth): ResolveOwningAdmin recursive created_by walk"
```

---

### Task 1.3: Session carries `OwningAdminID`; computed at login

**Files:**
- Modify: `backend/services/auth-service/internal/domain/session.go:7-13`
- Modify: `backend/services/auth-service/internal/service/auth/login.go:60-68` (the `issue` helper)

**Interfaces:**
- Consumes: `ResolveOwningAdmin` (Task 1.2). NOTE: the auth `Service` already holds a users dependency (`s.users`, used at login.go for `GetByIdentifier`/`GetByID`). Add `ResolveOwningAdmin(ctx context.Context, userID string) (string, error)` to that same interface (the one declaring `GetByID`) so `issue` can call it; the concrete `*users.Store` already implements it from Task 1.2.
- Produces: `domain.Session.OwningAdminID`. Used by Task 1.4.

- [ ] **Step 1: Add the field to the session struct**

In `session.go`, add the field (keep `omitzero` style only if siblings use it — they use plain tags, so match):

```go
type Session struct {
	UserID         string    `json:"user_id"`
	Permissions    []string  `json:"permissions"`
	IsOwner        bool      `json:"is_owner"`
	OwningAdminID  string    `json:"owning_admin_id"` // tenant admin for territory scoping; "" for Root
	Status         string    `json:"status"`
	AbsoluteExpiry time.Time `json:"absolute_expiry"`
}
```

- [ ] **Step 2: Add `ResolveOwningAdmin` to the auth Service's users-port interface**

Find the interface `s.users` satisfies in the auth `service/auth` package (the one already declaring `GetByID(ctx, id)` / `GetByIdentifier`). Add:

```go
	ResolveOwningAdmin(ctx context.Context, userID string) (string, error)
```

- [ ] **Step 3: Compute it in `issue`**

Replace the `issue` helper body (login.go:60-68):

```go
// issue creates a session carrying a permission snapshot and the caller's
// owning admin (resolved from the created_by chain) for territory scoping.
func (s *Service) issue(ctx context.Context, u domain.User) (string, error) {
	owningAdmin, err := s.users.ResolveOwningAdmin(ctx, u.ID)
	if err != nil {
		return "", fmt.Errorf("auth.issue: owning admin: %w", err)
	}
	return s.sessions.Create(ctx, domain.Session{
		UserID:         u.ID,
		Permissions:    u.Permissions,
		IsOwner:        u.IsOwner,
		OwningAdminID:  owningAdmin,
		Status:         u.Status,
		AbsoluteExpiry: time.Now().Add(s.absoluteTTL),
	})
}
```

(Confirm `fmt` is imported in login.go; it already wraps errors elsewhere.)

- [ ] **Step 4: Build**

Run: `cd backend && go build ./services/auth-service/...`
Expected: builds clean (the mock for the users-port, if generated, may need regen — see Step 5).

- [ ] **Step 5: Regenerate mocks if the build complains about the users-port mock**

If `s.users` is a minimock/gomock interface with a generated mock under `service/auth/mocks/`, regenerate per the repo's mock tooling (look for a `go:generate` directive on the interface and run `go generate ./services/auth-service/...`). If `s.users` is the concrete `*users.Store`, skip.

Run: `cd backend && go build ./services/auth-service/...`
Expected: builds clean.

- [ ] **Step 6: Commit**

```bash
git add backend/services/auth-service/internal/domain/session.go backend/services/auth-service/internal/service/auth/
git commit -m "feat(auth): stamp owning_admin_id into session at login"
```

---

### Task 1.4: `ValidateToken` returns `owning_admin_id` (proto + 5-tuple)

**Files:**
- Modify: `backend/proto/rosneft/auth/v1/auth.proto:95-99`
- Modify: `backend/services/auth-service/internal/service/auth/validate_token.go`
- Modify: `backend/services/auth-service/internal/transport/grpcapi/server.go:23,77,85`
- Modify: `backend/services/auth-service/internal/transport/grpcapi/login.go:36-42`

**Interfaces:**
- Produces: `ValidateTokenResponse.owning_admin_id` (field 4); `AuthFlow.ValidateToken(ctx, token) (string, []string, bool, string, error)`. Consumed by gateway in Task 3.1.

- [ ] **Step 1: Add the proto field**

In `auth.proto`:

```proto
message ValidateTokenResponse {
  string user_id = 1;
  repeated string permissions = 2;
  bool is_owner = 3; // root of trust; gateway grants it a blanket route bypass
  string owning_admin_id = 4; // tenant admin for territory scoping; "" for Root
}
```

- [ ] **Step 2: Regenerate Go proto**

Run: `cd backend/proto && buf generate`
Expected: `gen/go/rosneft/auth/v1/auth.pb.go` now has `GetOwningAdminId()`.

- [ ] **Step 3: Update the service impl (5-tuple)**

`validate_token.go`:

```go
// ValidateToken returns the user id, permission snapshot, owner flag, and owning
// admin id for a live session. All four ride on the Redis session, so this is a
// single GET with no re-query.
func (s *Service) ValidateToken(ctx context.Context, token string) (string, []string, bool, string, error) {
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return "", nil, false, "", err
	}
	return sess.UserID, sess.Permissions, sess.IsOwner, sess.OwningAdminID, nil
}
```

- [ ] **Step 4: Update the `AuthFlow` interface + the two internal callers**

`grpcapi/server.go:23` — interface:

```go
	ValidateToken(ctx context.Context, token string) (string, []string, bool, string, error)
```

`grpcapi/server.go:77` (`userIDFromToken`): add one blank:

```go
	uid, _, _, _, err := s.auth.ValidateToken(ctx, token)
```

`grpcapi/server.go:85` (`actor`): add one blank:

```go
	uid, perms, isOwner, _, err := s.auth.ValidateToken(ctx, token)
```

- [ ] **Step 5: Update the gRPC handler to ship the field**

`login.go:36-42`:

```go
func (s *Server) ValidateToken(ctx context.Context, req *authv1.ValidateTokenRequest) (*authv1.ValidateTokenResponse, error) {
	uid, perms, isOwner, owningAdmin, err := s.auth.ValidateToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.ValidateTokenResponse{
		UserId:        uid,
		Permissions:   perms,
		IsOwner:       isOwner,
		OwningAdminId: owningAdmin,
	}, nil
}
```

- [ ] **Step 6: Build + run auth tests**

Run: `cd backend && go build ./services/auth-service/... && go test ./services/auth-service/...`
Expected: builds clean; existing tests pass (the `auth` mock for `AuthFlow`, if generated, regenerate via `go generate` first if the build flags a signature mismatch).

- [ ] **Step 7: Commit**

```bash
git add backend/proto backend/services/auth-service/
git commit -m "feat(auth): expose owning_admin_id from ValidateToken"
```

---

## PHASE 2 — catalog-service: assignments + scope filter

### Task 2.1: Migration `territory_assignments`

**Files:**
- Create: `backend/services/catalog-service/internal/migrate/migrations/00011_territory_assignments.sql`

- [ ] **Step 1: Write the migration**

```sql
-- +goose Up
-- +goose StatementBegin
CREATE TABLE territory_assignments (
    territory_id  BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    admin_user_id UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (territory_id, admin_user_id)
);
CREATE INDEX idx_territory_assignments_admin ON territory_assignments(admin_user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE territory_assignments;
-- +goose StatementEnd
```

(`admin_user_id` is an opaque UUID from the auth DB — no cross-database FK by design.)

- [ ] **Step 2: Apply locally and verify**

Run (against the local catalog DB; migrations also auto-run on service boot): `cd backend && go build ./services/catalog-service/...` then start the service or run the migrate entrypoint. Verify the table exists:
`psql "$CATALOG_DSN" -c "\d territory_assignments"`
Expected: table with PK `(territory_id, admin_user_id)` and the admin index.

- [ ] **Step 3: Commit**

```bash
git add backend/services/catalog-service/internal/migrate/migrations/00011_territory_assignments.sql
git commit -m "feat(catalog): territory_assignments table"
```

---

### Task 2.2: catalog proto — scope field + assignment RPCs

**Files:**
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto`

**Interfaces:**
- Produces: `ListTerritoriesRequest.scope_admin_id`, `GetTerritoryRequest.scope_admin_id`, RPCs `SetTerritoryAdmins`/`GetTerritoryAdmins`. Consumed by Tasks 2.3–2.5 and Phase 3.

- [ ] **Step 1: Add the scope field to the two read requests**

```proto
message ListTerritoriesRequest {
  // When non-empty, restrict the result to territories assigned to this admin.
  // Empty means no filter (Root and internal callers see everything).
  string scope_admin_id = 1;
}

message GetTerritoryRequest {
  string slug = 1;
  string scope_admin_id = 2; // see ListTerritoriesRequest; empty = no scope check
}
```

(`GetTerritoryRequest` currently has only `slug = 1` — keep it field 1, add `scope_admin_id = 2`.)

- [ ] **Step 2: Add the assignment messages + RPCs**

In the Territory RPCs block of `service CatalogService`:

```proto
  rpc SetTerritoryAdmins(SetTerritoryAdminsRequest) returns (SetTerritoryAdminsResponse);
  rpc GetTerritoryAdmins(GetTerritoryAdminsRequest) returns (GetTerritoryAdminsResponse);
```

And the messages (near the other Territory messages):

```proto
message SetTerritoryAdminsRequest {
  string slug = 1;
  repeated string admin_user_ids = 2; // full replacement set
}
message SetTerritoryAdminsResponse {}

message GetTerritoryAdminsRequest { string slug = 1; }
message GetTerritoryAdminsResponse { repeated string admin_user_ids = 1; }
```

- [ ] **Step 3: Regenerate Go proto**

Run: `cd backend/proto && buf generate`
Expected: `catalog.pb.go`/`catalog_grpc.pb.go` gain the new messages + `SetTerritoryAdmins`/`GetTerritoryAdmins` on the server/client interfaces. Catalog `Server` will now fail to compile until Task 2.5 implements them (expected).

- [ ] **Step 4: Commit**

```bash
git add backend/proto
git commit -m "feat(catalog): proto scope field + territory-admins RPCs"
```

---

### Task 2.3: Storage — scope filter + assignment replace/read

**Files:**
- Modify: `backend/services/catalog-service/internal/storage/list_territories.go`
- Modify: `backend/services/catalog-service/internal/storage/get_territory.go`
- Create: `backend/services/catalog-service/internal/storage/set_territory_admins.go`
- Create: `backend/services/catalog-service/internal/storage/get_territory_admins.go`

**Interfaces:**
- Consumes: `*PG{pool}` (postgres.go), `territoryColumns`, `scanTerritory`, `domain.ErrTerritoryNotFound`.
- Produces:
  - `func (r *PG) ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error)`
  - `func (r *PG) GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error)`
  - `func (r *PG) SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error`
  - `func (r *PG) GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error)`

- [ ] **Step 1: Scope the list query**

Replace `list_territories.go` body:

```go
// ListTerritories returns territories ordered by slug. When scopeAdminID is
// non-empty, only territories assigned to that admin are returned; empty means
// no filter (Root and internal callers see everything).
func (r *PG) ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error) {
	const q = `SELECT ` + territoryColumns + ` FROM territories t
WHERE ($1 = '' OR EXISTS (
    SELECT 1 FROM territory_assignments a
    WHERE a.territory_id = t.id AND a.admin_user_id = $1::uuid))
ORDER BY t.slug`

	rows, err := r.pool.Query(ctx, q, scopeAdminID)
	if err != nil {
		return nil, fmt.Errorf("storage.ListTerritories: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Territory, 0, 32)
	for rows.Next() {
		territory, err := scanTerritory(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListTerritories: scan: %w", err)
		}
		out = append(out, territory)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListTerritories: iter: %w", err)
	}
	return out, nil
}
```

(`$1::uuid` only evaluates on the non-empty branch; the `$1 = ''` short-circuit keeps an empty string from being cast.)

- [ ] **Step 2: Scope `GetTerritory`**

Open `get_territory.go` and add the `scopeAdminID` param + the same guard. The existing query selects by slug; change it to additionally require visibility, so an unassigned territory returns no row → `ErrTerritoryNotFound` (covers the direct GET and the scene path, which calls GetTerritory first):

```go
func (r *PG) GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error) {
	const q = `SELECT ` + territoryColumns + ` FROM territories t
WHERE t.slug = $1 AND ($2 = '' OR EXISTS (
    SELECT 1 FROM territory_assignments a
    WHERE a.territory_id = t.id AND a.admin_user_id = $2::uuid))`

	territory, err := scanTerritory(r.pool.QueryRow(ctx, q, slug, scopeAdminID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Territory{}, domain.ErrTerritoryNotFound
		}
		return domain.Territory{}, fmt.Errorf("storage.GetTerritory: %w", err)
	}
	return territory, nil
}
```

(Match the file's existing imports/sentinel — if it already maps `pgx.ErrNoRows` to `domain.ErrTerritoryNotFound`, keep that exact mapping; only the query and signature change.)

- [ ] **Step 3: `SetTerritoryAdmins` (full replace in a tx)**

Create `set_territory_admins.go` (mirrors auth `roles.replacePermissions`):

```go
package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetTerritoryAdmins replaces a territory's assigned-admin set with adminIDs.
func (r *PG) SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("storage.SetTerritoryAdmins: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var territoryID int64
	if err := tx.QueryRow(ctx, `SELECT id FROM territories WHERE slug = $1`, slug).Scan(&territoryID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrTerritoryNotFound
		}
		return fmt.Errorf("storage.SetTerritoryAdmins: territory id: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM territory_assignments WHERE territory_id = $1`, territoryID); err != nil {
		return fmt.Errorf("storage.SetTerritoryAdmins: clear: %w", err)
	}
	for _, adminID := range adminIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO territory_assignments (territory_id, admin_user_id) VALUES ($1, $2::uuid)
			 ON CONFLICT DO NOTHING`, territoryID, adminID); err != nil {
			return fmt.Errorf("storage.SetTerritoryAdmins: insert %q: %w", adminID, err)
		}
	}
	return tx.Commit(ctx)
}
```

- [ ] **Step 4: `GetTerritoryAdmins`**

Create `get_territory_admins.go`:

```go
package storage

import (
	"context"
	"fmt"
)

// GetTerritoryAdmins returns the admin user ids assigned to a territory.
func (r *PG) GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error) {
	const q = `SELECT a.admin_user_id::text
FROM territory_assignments a
JOIN territories t ON t.id = a.territory_id
WHERE t.slug = $1
ORDER BY a.created_at`

	rows, err := r.pool.Query(ctx, q, slug)
	if err != nil {
		return nil, fmt.Errorf("storage.GetTerritoryAdmins: query: %w", err)
	}
	defer rows.Close()

	out := make([]string, 0, 8)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("storage.GetTerritoryAdmins: scan: %w", err)
		}
		out = append(out, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.GetTerritoryAdmins: iter: %w", err)
	}
	return out, nil
}
```

- [ ] **Step 5: Build (will fail at service/transport layers until 2.4/2.5)**

Run: `cd backend && go build ./services/catalog-service/internal/storage/...`
Expected: the storage package builds clean.

- [ ] **Step 6: Commit**

```bash
git add backend/services/catalog-service/internal/storage/
git commit -m "feat(catalog): scope filter + territory-admin assignment storage"
```

---

### Task 2.4: catalog service layer

**Files:**
- Modify: `backend/services/catalog-service/internal/service/list_territories.go`
- Modify: `backend/services/catalog-service/internal/service/get_territory.go`
- Modify: `backend/services/catalog-service/internal/service/catalog.go` (Repository interface)
- Create: `backend/services/catalog-service/internal/service/set_territory_admins.go`
- Create: `backend/services/catalog-service/internal/service/get_territory_admins.go`
- Test: `backend/services/catalog-service/internal/service/set_territory_admins_test.go`

**Interfaces:**
- Consumes: storage methods from Task 2.3 via the `Repository` interface (catalog.go).
- Produces (on `*Catalog`):
  - `ListTerritories(ctx, scopeAdminID string) ([]domain.Territory, error)`
  - `GetTerritory(ctx, slug, scopeAdminID string) (domain.Territory, error)`
  - `SetTerritoryAdmins(ctx, slug string, adminIDs []string) error`
  - `GetTerritoryAdmins(ctx, slug string) ([]string, error)`

- [ ] **Step 1: Extend the `Repository` interface**

In `catalog.go`, update the two existing signatures and add two:

```go
	ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error)
	GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error)
	SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error
	GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error)
```

- [ ] **Step 2: Thread scope through list + get**

`list_territories.go`:

```go
func (c *Catalog) ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error) {
	return c.repo.ListTerritories(ctx, scopeAdminID)
}
```

`get_territory.go` — keep any existing slug validation, add the param:

```go
func (c *Catalog) GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error) {
	return c.repo.GetTerritory(ctx, slug, scopeAdminID)
}
```

(If `get_territory.go` currently validates empty slug, preserve that check above the repo call.)

- [ ] **Step 3: Write the failing test for SetTerritoryAdmins validation**

`set_territory_admins_test.go`:

```go
package service

import (
	"testing"
)

func TestSetTerritoryAdmins_EmptySlug(t *testing.T) {
	c := New(nil) // repo not reached: empty slug rejected before any repo call
	err := c.SetTerritoryAdmins(t.Context(), "", []string{"00000000-0000-0000-0000-000000000001"})
	if err == nil {
		t.Fatal("expected error for empty slug, got nil")
	}
}
```

- [ ] **Step 4: Run it — fails (method undefined)**

Run: `cd backend && go test ./services/catalog-service/internal/service/ -run TestSetTerritoryAdmins_EmptySlug -v`
Expected: FAIL — `c.SetTerritoryAdmins undefined`.

- [ ] **Step 5: Implement the two service methods**

`set_territory_admins.go`:

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetTerritoryAdmins replaces a territory's assigned-admin set.
func (c *Catalog) SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error {
	if slug == "" {
		return fmt.Errorf("service.SetTerritoryAdmins: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.SetTerritoryAdmins(ctx, slug, adminIDs)
}
```

`get_territory_admins.go`:

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetTerritoryAdmins returns the admin user ids assigned to a territory.
func (c *Catalog) GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error) {
	if slug == "" {
		return nil, fmt.Errorf("service.GetTerritoryAdmins: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.GetTerritoryAdmins(ctx, slug)
}
```

(Confirm `domain.ErrInvalidInput` exists in catalog domain; the gateway uses `domain.ErrInvalidInput`, and catalog has its own sentinels — if the catalog name differs, use the catalog package's equivalent invalid-input sentinel.)

- [ ] **Step 6: Regenerate the repository mock, then test**

The `Repository` interface has a generated mock (`service/mocks/repository_mock.go`). Regenerate it (find the `go:generate` directive for it and run `go generate ./services/catalog-service/...`, or the repo's mock command).

Run: `cd backend && go test ./services/catalog-service/internal/service/ -run TestSetTerritoryAdmins_EmptySlug -v`
Expected: PASS.

- [ ] **Step 7: Build the service package**

Run: `cd backend && go build ./services/catalog-service/internal/service/...`
Expected: builds clean.

- [ ] **Step 8: Commit**

```bash
git add backend/services/catalog-service/internal/service/
git commit -m "feat(catalog): service layer scope + territory-admin methods"
```

---

### Task 2.5: catalog grpcapi handlers

**Files:**
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/list_territories.go`
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/get_territory.go`
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/server.go` (Service interface)
- Create: `backend/services/catalog-service/internal/transport/grpcapi/set_territory_admins.go`
- Create: `backend/services/catalog-service/internal/transport/grpcapi/get_territory_admins.go`

**Interfaces:**
- Consumes: service methods from Task 2.4 via the grpcapi `Service` interface (server.go).
- Produces: the four wire handlers.

- [ ] **Step 1: Extend the grpcapi `Service` interface (server.go)**

Update the two existing entries and add two:

```go
	ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error)
	GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error)
	SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error
	GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error)
```

- [ ] **Step 2: Thread scope in the list handler**

`list_territories.go`:

```go
func (s *Server) ListTerritories(ctx context.Context, req *catalogv1.ListTerritoriesRequest) (*catalogv1.ListTerritoriesResponse, error) {
	out, err := s.svc.ListTerritories(ctx, req.GetScopeAdminId())
	if err != nil {
		return nil, mapError(err)
	}
	resp := &catalogv1.ListTerritoriesResponse{Territories: make([]*catalogv1.Territory, len(out))}
	for i, t := range out {
		resp.Territories[i] = territoryToProto(t)
	}
	return resp, nil
}
```

(Keep the file's existing `mapError`/conversion helpers; only the `req` param name and the `GetScopeAdminId()` pass-through change.)

- [ ] **Step 3: Thread scope in the get handler**

`get_territory.go`:

```go
func (s *Server) GetTerritory(ctx context.Context, req *catalogv1.GetTerritoryRequest) (*catalogv1.GetTerritoryResponse, error) {
	out, err := s.svc.GetTerritory(ctx, req.GetSlug(), req.GetScopeAdminId())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.GetTerritoryResponse{Territory: territoryToProto(out)}, nil
}
```

(`mapError` must map `domain.ErrTerritoryNotFound` → `codes.NotFound`. Verify the existing `mapError` already does; the direct GetTerritory path already relied on NotFound, so it should.)

- [ ] **Step 4: Implement the two assignment handlers**

`set_territory_admins.go`:

```go
package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) SetTerritoryAdmins(ctx context.Context, req *catalogv1.SetTerritoryAdminsRequest) (*catalogv1.SetTerritoryAdminsResponse, error) {
	if err := s.svc.SetTerritoryAdmins(ctx, req.GetSlug(), req.GetAdminUserIds()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetTerritoryAdminsResponse{}, nil
}
```

`get_territory_admins.go`:

```go
package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) GetTerritoryAdmins(ctx context.Context, req *catalogv1.GetTerritoryAdminsRequest) (*catalogv1.GetTerritoryAdminsResponse, error) {
	ids, err := s.svc.GetTerritoryAdmins(ctx, req.GetSlug())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.GetTerritoryAdminsResponse{AdminUserIds: ids}, nil
}
```

- [ ] **Step 5: Build catalog + run its tests**

Run: `cd backend && go build ./services/catalog-service/... && go test ./services/catalog-service/...`
Expected: builds clean (the `require_unimplemented_servers` embed is satisfied now that both new RPCs are implemented); tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/services/catalog-service/internal/transport/grpcapi/
git commit -m "feat(catalog): grpc handlers for scope + territory-admins"
```

---

## PHASE 3 — gateway-service: thread scope + Root-only endpoints

### Task 3.1: Principal carries owning-admin; exported scope accessors

**Files:**
- Modify: `backend/services/gateway-service/internal/clients/auth/session.go:30-36`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/principal.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/middleware.go:13-27`

**Interfaces:**
- Consumes: auth `ValidateTokenResponse.owning_admin_id` (Task 1.4).
- Produces (exported from `authhttp`, callable from the `httpapi` package):
  - `func Scope(ctx context.Context) (adminID string, allAccess bool)` — `allAccess` is `principalIsOwner`; `adminID` is `""` when `allAccess` (Root) so callers pass `""` to catalog.
  - `func IsOwner(ctx context.Context) bool`

- [ ] **Step 1: Auth client returns the 5-tuple**

`clients/auth/session.go`:

```go
func (c *Client) ValidateToken(ctx context.Context, token string) (string, []string, bool, string, error) {
	resp, err := c.cc.ValidateToken(ctx, &authv1.ValidateTokenRequest{Token: token})
	if err != nil {
		return "", nil, false, "", err
	}
	return resp.GetUserId(), resp.GetPermissions(), resp.GetIsOwner(), resp.GetOwningAdminId(), nil
}
```

- [ ] **Step 2: Principal stores owning-admin + exports scope accessors**

`principal.go` — add the key, extend `withPrincipal`, add exported accessors:

```go
const (
	keyUserID ctxKey = iota
	keyPerms
	keyIsOwner
	keyOwningAdmin
)

func withPrincipal(ctx context.Context, userID string, perms []string, isOwner bool, owningAdmin string) context.Context {
	ctx = context.WithValue(ctx, keyUserID, userID)
	ctx = context.WithValue(ctx, keyIsOwner, isOwner)
	ctx = context.WithValue(ctx, keyOwningAdmin, owningAdmin)
	return context.WithValue(ctx, keyPerms, perms)
}

func principalOwningAdmin(ctx context.Context) string {
	a, _ := ctx.Value(keyOwningAdmin).(string)
	return a
}

// Scope returns the territory visibility scope for the caller. allAccess (Root)
// means "see everything" and pairs with an empty adminID, so the catalog gets
// no filter. A non-Root caller yields a non-empty adminID.
func Scope(ctx context.Context) (adminID string, allAccess bool) {
	if principalIsOwner(ctx) {
		return "", true
	}
	return principalOwningAdmin(ctx), false
}

// IsOwner reports whether the caller is Root. Used to gate Root-only endpoints
// in the httpapi package.
func IsOwner(ctx context.Context) bool {
	return principalIsOwner(ctx)
}
```

- [ ] **Step 3: Middleware passes owning-admin into the principal**

`middleware.go` `Authenticate`:

```go
		uid, perms, isOwner, owningAdmin, err := h.client.ValidateToken(r.Context(), token)
		if err != nil {
			fail(w, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), uid, perms, isOwner, owningAdmin)))
```

Also update the `h.client` interface (the auth-client port declared in the `authhttp` package, likely in `handlers.go`) to the 5-tuple `ValidateToken` signature.

- [ ] **Step 4: Build the gateway transport + clients**

Run: `cd backend && go build ./services/gateway-service/internal/transport/authhttp/... ./services/gateway-service/internal/clients/auth/...`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add backend/services/gateway-service/internal/clients/auth/ backend/services/gateway-service/internal/transport/authhttp/
git commit -m "feat(gateway): principal carries owning_admin; exported Scope/IsOwner"
```

---

### Task 3.2: catalog client — scope params + assignment calls

**Files:**
- Modify: `backend/services/gateway-service/internal/clients/catalog/territories.go`
- Create: `backend/services/gateway-service/internal/clients/catalog/territory_admins.go`

**Interfaces:**
- Produces (on `*Client`):
  - `ListTerritories(ctx, scopeAdminID string) ([]domain.Territory, error)`
  - `GetTerritory(ctx, slug, scopeAdminID string) (domain.Territory, error)`
  - `SetTerritoryAdmins(ctx, slug string, adminIDs []string) error`
  - `GetTerritoryAdmins(ctx, slug string) ([]string, error)`

- [ ] **Step 1: Add scope to the two read calls**

`territories.go` — `ListTerritories`:

```go
func (c *Client) ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error) {
	resp, err := c.cc.ListTerritories(ctx, &catalogv1.ListTerritoriesRequest{ScopeAdminId: scopeAdminID})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListTerritories: %w", err)
	}
	out := make([]domain.Territory, len(resp.GetTerritories()))
	for i, t := range resp.GetTerritories() {
		out[i] = territoryFromProto(t)
	}
	return out, nil
}
```

`territories.go` — `GetTerritory`:

```go
func (c *Client) GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error) {
	resp, err := c.cc.GetTerritory(ctx, &catalogv1.GetTerritoryRequest{Slug: slug, ScopeAdminId: scopeAdminID})
	if err != nil {
		return domain.Territory{}, fmt.Errorf("catalog.GetTerritory: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return territoryFromProto(resp.GetTerritory()), nil
}
```

- [ ] **Step 2: Add the assignment client calls**

`territory_admins.go`:

```go
package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (c *Client) SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error {
	_, err := c.cc.SetTerritoryAdmins(ctx, &catalogv1.SetTerritoryAdminsRequest{Slug: slug, AdminUserIds: adminIDs})
	if err != nil {
		return fmt.Errorf("catalog.SetTerritoryAdmins: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return nil
}

func (c *Client) GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error) {
	resp, err := c.cc.GetTerritoryAdmins(ctx, &catalogv1.GetTerritoryAdminsRequest{Slug: slug})
	if err != nil {
		return nil, fmt.Errorf("catalog.GetTerritoryAdmins: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return resp.GetAdminUserIds(), nil
}
```

(Import `grpcerr` from the same path `territories.go` uses; if `GetTerritoryAdmins` needs no NotFound mapping, plain `fmt.Errorf("...: %w", err)` is fine.)

- [ ] **Step 3: Build the catalog client**

Run: `cd backend && go build ./services/gateway-service/internal/clients/catalog/...`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add backend/services/gateway-service/internal/clients/catalog/
git commit -m "feat(gateway): catalog client scope params + territory-admins calls"
```

---

### Task 3.3: gateway service layer — thread scope + assignment methods

**Files:**
- Modify: `backend/services/gateway-service/internal/service/territories.go`
- Modify: `backend/services/gateway-service/internal/service/scene_bundle.go`
- Modify: `backend/services/gateway-service/internal/service/gateway.go` (the Catalog port interface)
- Create: `backend/services/gateway-service/internal/service/territory_admins.go`

**Interfaces:**
- Consumes: catalog client methods (Task 3.2) via the `catalog` port interface in `gateway.go`.
- Produces (on `*Gateway`):
  - `ListTerritories(ctx, scopeAdminID string) ([]domain.Territory, error)`
  - `GetTerritory(ctx, slug, scopeAdminID string) (domain.Territory, error)`
  - `GetSceneBundle(ctx, slug, scopeAdminID string) (domain.SceneBundle, error)`
  - `SetTerritoryAdmins(ctx, slug string, adminIDs []string) error`
  - `GetTerritoryAdmins(ctx, slug string) ([]string, error)`

- [ ] **Step 1: Update the `catalog` port interface (gateway.go)**

Match the new catalog-client signatures: `ListTerritories(ctx, scopeAdminID string)`, `GetTerritory(ctx, slug, scopeAdminID string)`, plus `SetTerritoryAdmins`/`GetTerritoryAdmins`.

- [ ] **Step 2: Thread scope in `territories.go`**

```go
func (g *Gateway) ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error) {
	return g.catalog.ListTerritories(ctx, scopeAdminID)
}

func (g *Gateway) GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error) {
	if slug == "" {
		return domain.Territory{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	return g.catalog.GetTerritory(ctx, slug, scopeAdminID)
}
```

- [ ] **Step 3: Thread scope into the scene bundle's GetTerritory call**

In `scene_bundle.go`, change the method signature to `GetSceneBundle(ctx context.Context, slug, scopeAdminID string)` and pass `scopeAdminID` into the `g.catalog.GetTerritory(ctx, slug, scopeAdminID)` call inside the errgroup. Leave the other fan-out calls (artifacts/placements/models/panoramas/documents) unchanged — visibility is enforced by the territory fetch returning `ErrTerritoryNotFound` for an unassigned territory, which the errgroup propagates.

- [ ] **Step 4: Add the assignment passthroughs**

`territory_admins.go`:

```go
package service

import "context"

func (g *Gateway) SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error {
	return g.catalog.SetTerritoryAdmins(ctx, slug, adminIDs)
}

func (g *Gateway) GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error) {
	return g.catalog.GetTerritoryAdmins(ctx, slug)
}
```

- [ ] **Step 5: Regenerate the catalog mock + build**

The gateway `catalog` port has a generated mock (`service/mocks/catalog_mock.go`). Regenerate it (`go generate ./services/gateway-service/...` or the repo's mock command).

Run: `cd backend && go build ./services/gateway-service/internal/service/...`
Expected: builds clean.

- [ ] **Step 6: Commit**

```bash
git add backend/services/gateway-service/internal/service/
git commit -m "feat(gateway): service-layer scope threading + territory-admins"
```

---

### Task 3.4: OpenAPI — endpoints + schema, regenerate Go & TS

**Files:**
- Modify: `backend/services/gateway-service/api/openapi.yaml`

**Interfaces:**
- Produces: `GET/PUT /api/territories/{slug}/admins`, schema `TerritoryAdmins`, generated `httpapi.StrictServerInterface` methods `GetTerritoryAdmins`/`SetTerritoryAdmins` and TS `components["schemas"]["TerritoryAdmins"]`.

- [ ] **Step 1: Add the schema under `components.schemas`**

```yaml
    TerritoryAdmins:
      type: object
      required: [userIds]
      properties:
        userIds:
          type: array
          items: { type: string }
          description: Admin user ids assigned to the territory (full set).
```

- [ ] **Step 2: Add the path block under `paths:` (tag `territories`)**

```yaml
  /api/territories/{slug}/admins:
    parameters:
      - name: slug
        in: path
        required: true
        schema: { type: string }
    get:
      operationId: getTerritoryAdmins
      summary: List admins a territory is assigned to (Root only)
      tags: [territories]
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TerritoryAdmins' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/Internal' }
    put:
      operationId: setTerritoryAdmins
      summary: Replace the admins a territory is assigned to (Root only)
      tags: [territories]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/TerritoryAdmins' }
      responses:
        '204': { description: Assignments replaced }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/Internal' }
```

- [ ] **Step 3: Regenerate backend stubs + frontend DTOs**

Run: `cd backend && make openapi-gen`
Then: `cd frontend && npm run openapi:generate`
Expected: `httpapi/openapi_gen.go` gains `GetTerritoryAdmins`/`SetTerritoryAdmins` on `StrictServerInterface`; `frontend/src/shared/infrastructure/api/dto.ts` gains `TerritoryAdmins`. The gateway will not compile until Task 3.5 implements the two `Server` methods (expected).

- [ ] **Step 4: Commit**

```bash
git add backend/services/gateway-service/api/openapi.yaml backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go backend/services/gateway-service/internal/transport/httpapi/openapi_spec_gen.go frontend/src/shared/infrastructure/api/dto.ts
git commit -m "feat(gateway): openapi territory-admins endpoints"
```

---

### Task 3.5: gateway httpapi handlers — read scope + Root-only assignment

**Files:**
- Modify: `backend/services/gateway-service/internal/transport/httpapi/territories.go` (ListTerritories, GetTerritory, GetSceneBundle read scope)
- Modify: `backend/services/gateway-service/internal/transport/httpapi/server.go` (the `Service` interface)
- Create: `backend/services/gateway-service/internal/transport/httpapi/territory_admins.go`

**Interfaces:**
- Consumes: `authhttp.Scope(ctx)`, `authhttp.IsOwner(ctx)` (Task 3.1); gateway service methods (Task 3.3).
- Produces: implementations of generated `GetTerritoryAdmins`/`SetTerritoryAdmins` strict methods.

- [ ] **Step 1: Extend the `Service` interface (server.go)**

Match the new gateway-service signatures: `ListTerritories(ctx, scopeAdminID string)`, `GetTerritory(ctx, slug, scopeAdminID string)`, `GetSceneBundle(ctx, slug, scopeAdminID string)`, plus `SetTerritoryAdmins`/`GetTerritoryAdmins`.

- [ ] **Step 2: Read scope in the three read handlers**

`territories.go` — `ListTerritories`:

```go
func (s *Server) ListTerritories(ctx context.Context, _ ListTerritoriesRequestObject) (ListTerritoriesResponseObject, error) {
	scopeAdminID, _ := authhttp.Scope(ctx)
	out, err := s.svc.ListTerritories(ctx, scopeAdminID)
	if err != nil {
		return ListTerritories500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(ListTerritories200JSONResponse, len(out))
	for i, t := range out {
		resp[i] = territoryToAPI(t)
	}
	return resp, nil
}
```

`GetTerritory`:

```go
func (s *Server) GetTerritory(ctx context.Context, req GetTerritoryRequestObject) (GetTerritoryResponseObject, error) {
	scopeAdminID, _ := authhttp.Scope(ctx)
	t, err := s.svc.GetTerritory(ctx, req.Slug, scopeAdminID)
	switch {
	case isNotFound(err):
		return GetTerritory404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetTerritory500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return GetTerritory200JSONResponse(territoryToAPI(t)), nil
}
```

`GetSceneBundle`:

```go
func (s *Server) GetSceneBundle(ctx context.Context, req GetSceneBundleRequestObject) (GetSceneBundleResponseObject, error) {
	scopeAdminID, _ := authhttp.Scope(ctx)
	bundle, err := s.svc.GetSceneBundle(ctx, req.Slug, scopeAdminID)
	switch {
	case isNotFound(err):
		return GetSceneBundle404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetSceneBundle500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return GetSceneBundle200JSONResponse(sceneBundleToAPI(bundle)), nil
}
```

(Add the `authhttp` import to `territories.go`.)

- [ ] **Step 3: Implement the Root-only assignment handlers**

`territory_admins.go` (the exact response object names — `GetTerritoryAdmins200JSONResponse`, `SetTerritoryAdmins204Response`, etc. — come from the regenerated `openapi_gen.go`; match them):

```go
package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

func (s *Server) GetTerritoryAdmins(ctx context.Context, req GetTerritoryAdminsRequestObject) (GetTerritoryAdminsResponseObject, error) {
	if !authhttp.IsOwner(ctx) {
		return GetTerritoryAdmins403JSONResponse{ForbiddenJSONResponse: forbiddenResp()}, nil
	}
	ids, err := s.svc.GetTerritoryAdmins(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return GetTerritoryAdmins404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetTerritoryAdmins500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return GetTerritoryAdmins200JSONResponse{UserIds: ids}, nil
}

func (s *Server) SetTerritoryAdmins(ctx context.Context, req SetTerritoryAdminsRequestObject) (SetTerritoryAdminsResponseObject, error) {
	if !authhttp.IsOwner(ctx) {
		return SetTerritoryAdmins403JSONResponse{ForbiddenJSONResponse: forbiddenResp()}, nil
	}
	if req.Body == nil {
		return SetTerritoryAdmins400JSONResponse{BadRequestJSONResponse: badRequestResp("missing body")}, nil
	}
	err := s.svc.SetTerritoryAdmins(ctx, req.Slug, req.Body.UserIds)
	switch {
	case isNotFound(err):
		return SetTerritoryAdmins404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case isInvalid(err):
		return SetTerritoryAdmins400JSONResponse{BadRequestJSONResponse: badRequestResp(err.Error())}, nil
	case err != nil:
		return SetTerritoryAdmins500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return SetTerritoryAdmins204Response{}, nil
}
```

NOTE: the exact error-envelope helper names (`forbiddenResp`, `badRequestResp`, `notFoundResp`, `internalResp`, classifiers `isNotFound`/`isInvalid`) are the ones already in `httpapi` (converters.go / respond helpers around territories.go:153-170). If `forbiddenResp`/`badRequestResp` don't exist as zero-arg/one-arg helpers, build the `ForbiddenJSONResponse`/`BadRequestJSONResponse` the same way the existing `notFoundResp`/`internalResp` are constructed. Do not invent new helper shapes — mirror the existing ones.

- [ ] **Step 4: Build the whole gateway + run tests**

Run: `cd backend && go build ./services/gateway-service/... && go test ./services/gateway-service/...`
Expected: builds clean (the `_ httpapi.StrictServerInterface = (*httpapi.Server)(nil)` assertion in transport.go is now satisfied); tests pass.

- [ ] **Step 5: Full backend build + vet**

Run: `cd backend && go build ./... && go vet ./...`
Expected: clean across all services (confirms mesh-service still compiles untouched against the new catalog proto — it sends the empty request, which is wire-compatible).

- [ ] **Step 6: Commit**

```bash
git add backend/services/gateway-service/internal/transport/httpapi/
git commit -m "feat(gateway): scope reads + Root-only territory-admins handlers"
```

---

## PHASE 4 — frontend: Root-only "Assign admins" UI

### Task 4.1: Territory-admins gateway

**Files:**
- Create: `frontend/src/territory/infrastructure/territory-admins-gateway.ts`

**Interfaces:**
- Consumes: `httpGet`/`httpPut` from `@/shared/infrastructure/http/client`; `components["schemas"]["TerritoryAdmins"]` from the regenerated DTOs.
- Produces: `getTerritoryAdmins(slug): Promise<string[]>`, `setTerritoryAdmins(slug, userIds): Promise<void>`.

- [ ] **Step 1: Write the gateway**

```ts
import { httpGet, httpPut } from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";

type TerritoryAdmins = components["schemas"]["TerritoryAdmins"];

export async function getTerritoryAdmins(slug: string): Promise<string[]> {
  const data = await httpGet<TerritoryAdmins>(`/api/territories/${encodeURIComponent(slug)}/admins`);
  return data.userIds ?? [];
}

export async function setTerritoryAdmins(slug: string, userIds: string[]): Promise<void> {
  await httpPut(`/api/territories/${encodeURIComponent(slug)}/admins`, { userIds });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (DTO `TerritoryAdmins` exists from Task 3.4).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/territory/infrastructure/territory-admins-gateway.ts
git commit -m "feat(frontend): territory-admins gateway"
```

---

### Task 4.2: AssignAdminsDrawer

**Files:**
- Create: `frontend/src/territory/presentation/assign-admins-drawer.tsx`

**Interfaces:**
- Consumes: `listUsers`/`listRoles` (auth-admin-gateway), `getTerritoryAdmins`/`setTerritoryAdmins` (Task 4.1), `notify` (toast). Mirrors the `EditRolesDrawer` overlay pattern.
- Produces: `default function AssignAdminsDrawer({ slug, title, onClose }: { slug: string; title: string; onClose: () => void })`.

- [ ] **Step 1: Write the drawer**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminUser } from "@/auth/domain/user";
import type { Role } from "@/auth/domain/role";
import { listUsers, listRoles } from "@/auth/infrastructure/auth-admin-gateway";
import { getTerritoryAdmins, setTerritoryAdmins } from "@/territory/infrastructure/territory-admins-gateway";
import { notify } from "@/shared/presentation/toast/use-toast";

const COMPANY_OWNER = "Company Owner";

export default function AssignAdminsDrawer({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [users, roles, assigned] = await Promise.all([listUsers("", false), listRoles(), getTerritoryAdmins(slug)]);
        const ownerSlug = roles.find((r: Role) => r.title === COMPANY_OWNER)?.slug;
        setAdmins(ownerSlug ? users.filter((u) => u.roleSlugs.includes(ownerSlug)) : []);
        setPicked(assigned);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Failed to load admins");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const dirtyCount = useMemo(() => picked.length, [picked]);

  async function save() {
    setBusy(true);
    try {
      await setTerritoryAdmins(slug, picked);
      notify.success("Admins updated");
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Assign admins · {title}</p>
        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-neutral-400">No Company Owners to assign yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {admins.map((u) => (
              <button key={u.id} type="button" onClick={() => toggle(u.id)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${picked.includes(u.id) ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-white/15 text-neutral-300 hover:bg-white/10"}`}>
                {u.username}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{dirtyCount} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-white/20 px-4 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.06]">Cancel</button>
            <button type="button" onClick={save} disabled={busy || loading} className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

(Confirm this file stays under 200 lines — it does. Copy uses "Assign admins"/"Company Owner", never the banned brand word.)

- [ ] **Step 2: Lint + typecheck**

Run: `cd frontend && npx eslint src/territory/presentation/assign-admins-drawer.tsx && npx tsc --noEmit`
Expected: clean (≤200 lines, no unused vars).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/territory/presentation/assign-admins-drawer.tsx
git commit -m "feat(frontend): assign-admins drawer"
```

---

### Task 4.3: AssignAdminsButton + wire into territory pages (Root-gated)

**Files:**
- Create: `frontend/src/app/_components/assign-admins-button.tsx`
- Modify: `frontend/src/app/territories/page.tsx` (action cluster ~:54-59)
- Modify: `frontend/src/app/page.tsx` (the `Section` card action slot)

**Interfaces:**
- Consumes: `AssignAdminsDrawer` (Task 4.2). Mirrors `delete-territory-button.tsx` (thin `"use client"` wrapper that toggles a drawer).
- Produces: `default function AssignAdminsButton({ slug, label }: { slug: string; label: string })`.

- [ ] **Step 1: Write the button (client wrapper)**

```tsx
"use client";

import { useState } from "react";
import AssignAdminsDrawer from "@/territory/presentation/assign-admins-drawer";

export default function AssignAdminsButton({ slug, label }: { slug: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="cursor-pointer rounded-md border border-white/20 px-2.5 py-1 text-xs text-neutral-200 transition-colors hover:bg-white/[0.08]">
        Admins
      </button>
      {open ? <AssignAdminsDrawer slug={slug} title={label} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
```

- [ ] **Step 2: Render it Root-only in `territories/page.tsx`**

This page is a Server Component that already computes `me` and `canWrite`/`canDelete`. Compute `isRoot` and add the button to the existing action cluster:

```tsx
// near where me/canWrite/canDelete are derived:
const isRoot = me?.isOwner ?? false;

// in the per-territory action cluster (currently :54-59):
{canWrite || canDelete || isRoot ? (
  <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
    {isRoot ? <AssignAdminsButton slug={t.slug} label={t.title} /> : null}
    {canWrite ? <ReplaceSourceButton slug={t.slug} /> : null}
    {canDelete ? <DeleteTerritoryButton slug={t.slug} label={t.title} /> : null}
  </div>
) : null}
```

Add the import: `import AssignAdminsButton from "@/app/_components/assign-admins-button";`. If the title padding (`pr-24`/`pr-36`) no longer fits three buttons, widen it one step.

- [ ] **Step 3: Render it Root-only in `app/page.tsx`**

In the home page `Section` card action slot (the `renderDelete`/`<div className="absolute right-3 top-3 z-10">` cluster), add `{isRoot ? <AssignAdminsButton slug={t.slug} label={t.title} /> : null}` alongside the existing action. Derive `isRoot` from the same `getCurrentUser()`/`me` the page already loads (mirror `territories/page.tsx`). If the home page doesn't currently load `me`, add `const me = await getCurrentUser();` (server-only, already used elsewhere) and `const isRoot = me?.isOwner ?? false;`.

- [ ] **Step 4: Lint + build the frontend**

Run: `cd frontend && npx eslint src/app/_components/assign-admins-button.tsx src/app/territories/page.tsx src/app/page.tsx && yarn build`
Expected: lint clean; production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/_components/assign-admins-button.tsx frontend/src/app/territories/page.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): Root-only assign-admins trigger on territory cards"
```

---

## Final verification (end-to-end, after all phases)

- [ ] **Backend:** `cd backend && go build ./... && go vet ./... && go test ./...` — all green; mesh-service compiles untouched.
- [ ] **Frontend:** `cd frontend && yarn lint && yarn build` — green.
- [ ] **Manual flow (local stack up):**
  1. As Root: `GET /api/territories` returns all; open a territory's "Admins" drawer, assign it to one Company Owner, save.
  2. As that Company Owner: `GET /api/territories` returns only the assigned territory; `GET /api/territories/{other-slug}/scene` returns 404.
  3. As a user that Company Owner created (a subordinate): same single territory is visible (inherited via `owning_admin_id`).
  4. As a different Company Owner (not assigned): the territory is not visible.
  5. Confirm conversions still run: upload a new territory as Root → mesh reconciler still picks it up (mesh sees all territories — empty scope).
  6. Non-root `PUT /api/territories/{slug}/admins` → 403.

---

## Self-Review (completed)

- **Spec coverage:** Root-all (Scope→allAccess, empty filter) ✓; admin-assigned-only (scope filter) ✓; subtree inheritance (`pickOwningAdmin` resolves subordinates to the same admin) ✓; M2M assignment (`territory_assignments` join table) ✓; Root-only assignment (handler `IsOwner` gate + UI `isOwner`) ✓; models out of scope ✓; rollout (existing territories unassigned → Root-only until assigned) ✓.
- **Flow safety:** mesh-service caller of `ListTerritories` handled by the "filter only when scope non-empty" invariant (no mesh edit); all `ValidateToken` callers enumerated and updated. ✓
- **Type consistency:** `scopeAdminID string` threaded identically storage→service→grpc→client→gateway-service→handler; `ResolveOwningAdmin(ctx, userID) (string, error)` and `pickOwningAdmin([]ChainNode) string` names consistent; `TerritoryAdmins.userIds` consistent backend schema ↔ frontend gateway. ✓
- **Placeholders:** none — every step carries real code or an exact command. Where a generated symbol name (response objects, error helpers) can only be confirmed post-codegen, the step names the existing pattern to mirror rather than inventing a shape.
