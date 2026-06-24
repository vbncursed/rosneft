# Auth Service — Design

**Date:** 2026-06-23
**Scope:** Backend only. New `auth-service` with working login/logout/2FA endpoints, role-based authorization, account freeze, and soft-delete. Frontend integration is out of scope but the gateway is fully wired (auth endpoints + middleware protecting existing routes).

## 1. Goals & Scope

Build a complete authentication + authorization backend:

- Working, API-verifiable flows: `register` (admin-created), `login`, `logout`, `verify-2FA`.
- Optional per-user **2FA via TOTP** (authenticator app) with recovery codes.
- **RBAC**: users have multiple roles; effective permissions = union. Roles and their permission bindings are editable (DB + future API), not hardcoded.
- **Account lifecycle**: `active` → `frozen` (reversible) and soft `deleted` (record retained).
- Gateway exposes `/api/auth/*` HTTP endpoints **and** an auth middleware that protects existing routes (territories/models/placements/panoramas/uploads).

Explicitly deferred: a future "downloader" role (with a `*:download` permission family), self-service registration, email/SMS 2FA, frontend.

## 2. Architecture

`auth-service` is a new Go module in `go.work`, mirroring `catalog-service`:

- **gRPC** internal service (`proto/rosneft/auth/v1/auth.proto`), bound to the Compose network only.
- **Postgres** — dedicated `auth` database in the same instance; embedded goose migrations applied on boot.
- **Redis** — session/token store. Adds `go-redis` dependency to the auth module.
- **Gateway** — public HTTP facade: new gRPC client to auth, `/api/auth/*` handlers, and an authn/authz middleware over existing routes.

### Decisions (defaults adopted)

- **Password hashing:** argon2id (`golang.org/x/crypto/argon2`).
- **Token transport:** `Authorization: Bearer <token>` header. (httpOnly cookie is a future option.)
- **Session model:** a single **opaque** session token in Redis with a sliding idle TTL (e.g. 24h) capped by an absolute max (e.g. 30 days). **No refresh token** — opaque+Redis already gives instant revocation.

## 3. Data Model (Postgres `auth`)

```
users
  id            uuid pk
  email         citext unique not null
  username      citext unique not null
  password_hash text not null            -- argon2id
  status        text not null            -- 'active' | 'frozen' | 'deleted'
  totp_enabled  bool not null default false
  totp_secret   bytea                    -- encrypted; NULL while 2FA off
  created_at    timestamptz not null
  updated_at    timestamptz not null
  deleted_at    timestamptz              -- soft-delete; NULL while alive

roles
  id          uuid pk
  slug        text unique not null       -- 'admin','owner','editor','viewer'
  title       text not null
  is_system   bool not null              -- system roles cannot be deleted via API
  created_at  timestamptz not null
  updated_at  timestamptz not null

permissions
  id          uuid pk
  slug        text unique not null       -- 'territory:write','users:freeze'
  description text
  -- seeded; API read-only, edited directly in DB

role_permissions          -- M:N, editable
  role_id       uuid fk→roles(id)        cascade
  permission_id uuid fk→permissions(id)  cascade
  pk (role_id, permission_id)

user_roles                -- M:N
  user_id uuid fk→users(id) cascade
  role_id uuid fk→roles(id) restrict     -- a role with users cannot be deleted
  pk (user_id, role_id)

recovery_codes            -- one-time 2FA recovery
  id        uuid pk
  user_id   uuid fk→users(id) cascade
  code_hash text not null                -- hashed, never plaintext
  used_at   timestamptz                  -- NULL until consumed
```

- `citext` makes email/username case-insensitive.
- Soft-delete keeps the row and keeps email/username **occupied** (audit + collision-free). Restore is supported.
- No session table — sessions live in Redis.

## 4. Sessions (Redis) & Auth Flows

### Redis keys

```
session:<token>          → JSON { userID, permissions[], status, absoluteExpiry }   TTL = idle timeout
user_sessions:<userID>   → SET of that user's tokens (revoke-all)
2fa_pending:<challenge>   → JSON { userID }                                          TTL = 5 min
login_fail:<identifier>   → counter for brute-force throttle
```

- `token`/`challenge` are crypto-random (`crypto/rand`, base64url).
- The session stores a **snapshot of permissions**, so `ValidateToken` is a single Redis GET (no Postgres on the hot path). Trade-off: role/permission changes apply on next login (or by explicitly killing the user's sessions). Documented behavior.

### Login (2FA off)

1. `POST /api/auth/login {identifier, password}` — `identifier` = email **or** username.
2. Look up user by email OR username; require `status='active'`; verify argon2id.
3. Create `session:<token>`, add to `user_sessions:<id>` → return `{token}`.

### Login (2FA on)

1. Steps 1–2 as above, but instead of a session create `2fa_pending:<challenge>` (TTL 5 min) → return `{challengeToken, twoFactorRequired:true}`.
2. `POST /api/auth/login/2fa {challengeToken, code}` — verify TOTP code (or a recovery code). On success create the real session, delete the challenge → `{token}`.

### Logout

`POST /api/auth/logout` — delete `session:<token>` and remove from `user_sessions`. Immediate.

### ValidateToken (called by gateway middleware)

Redis GET `session:<token>` → missing/expired → 401; present → return `{userID, permissions[]}` and extend the idle TTL (sliding window, bounded by absoluteExpiry).

### Brute-force throttle

`login_fail:<identifier>` counter in Redis; over threshold (e.g. 5 fails) → temporary lock (e.g. 15 min).

## 5. Roles, Permissions & Seeding

### Permission catalog (seeded; each guards a real endpoint)

```
Assets (catalog):   territory:write  territory:delete  model:write  model:delete  upload:create
Scene (placement):  placement:write  placement:delete  panorama:write  panorama:delete
Read:               territory:read  model:read  placement:read  panorama:read
Admin:              users:read  users:write  users:freeze  users:delete
                    roles:read  roles:manage  permissions:read
```

`create`+`update` are merged into a single `:write` permission per resource.

### 4 system roles (`is_system=true`, seeded by migration)

| Role | Permissions |
|---|---|
| `admin` | **everything**: `territory/model:write/delete`, `upload:create`, `placement/panorama:write/delete`, `users:read/write/freeze/delete`, `roles:read/manage`, `permissions:read`, all `*:read` |
| `owner` | people & roles only: `users:read/write/freeze/delete`, `roles:read/manage`, `permissions:read`, all `*:read` — **touches no content** |
| `editor` | scene work: `placement:write/delete`, `panorama:write/delete`, all `*:read` |
| `viewer` | all `*:read` |

Key invariants:
- **Asset upload/delete (territory & model) is `admin`-only.**
- **Scene placement is `editor` and above.**
- `owner` manages users and roles but no content.
- `editor` does **not** get `upload:create` (placing an existing model needs no file upload).

A future "downloader" role + `*:download` permissions will be added later (not in this build).

### Management via API (gateway)

- `roles` — full CRUD under `roles:manage`; `SetRolePermissions` edits a role's permission set. System roles cannot be deleted (`is_system`) but their permissions can be changed.
- `permissions` — read-only via API (`GET /api/auth/permissions`); new permissions added directly in DB.
- Assigning roles to a user — `users:write`.

## 6. Account Lifecycle (Freeze / Soft-delete)

**Statuses:** `active` ⇄ `frozen`; `deleted` (soft, terminal until restore).

**Freeze** (`users:freeze`):
- `POST /api/auth/users/{id}/freeze` → `status='frozen'` + **kill all sessions** (iterate `user_sessions:<id>`). Immediate eviction.
- `frozen` users cannot log in (login requires `status='active'`).
- `POST .../unfreeze` → back to `active`.

**Soft-delete** (`users:delete`):
- `DELETE /api/auth/users/{id}` → `status='deleted'`, `deleted_at=now()`, kill all sessions. Row + email/username retained (not freed).
- `deleted` users cannot log in; hidden from default lists (`status != 'deleted'`); visible to admins via `?includeDeleted=true`.
- `POST .../restore` → `status='active'`, `deleted_at=NULL`.

**Safety guards:** a user cannot freeze/delete themselves; the **last `admin`** cannot be frozen/deleted (never lock out all super-users).

## 7. Gateway: Endpoints & Middleware

### Public (no token)

```
POST /api/auth/login        {identifier, password} → {token} | {challengeToken, twoFactorRequired}
POST /api/auth/login/2fa     {challengeToken, code} → {token}
```

### Authenticated (self)

```
POST /api/auth/logout
GET  /api/auth/me            → {id, email, username, roles[], permissions[], totpEnabled}
POST /api/auth/me/password   {oldPassword, newPassword}
POST /api/auth/2fa/setup     → {secret, otpauthUrl}   (frontend renders QR)
POST /api/auth/2fa/enable    {code} → {recoveryCodes[]}
POST /api/auth/2fa/disable   {password|code}
```

### User admin (`users:*`)

```
GET    /api/auth/users          ?status=&includeDeleted=
POST   /api/auth/users          {email, username, password, roleSlugs[]}
GET    /api/auth/users/{id}
PATCH  /api/auth/users/{id}     {roleSlugs[]?, email?, username?}
POST   /api/auth/users/{id}/freeze | /unfreeze
DELETE /api/auth/users/{id}     (soft) ; POST /api/auth/users/{id}/restore
```

### Roles / permissions (`roles:manage` / `roles:read` / `permissions:read`)

```
GET  /api/auth/roles ; POST /api/auth/roles ; PATCH /api/auth/roles/{slug} ; DELETE /api/auth/roles/{slug}
PUT  /api/auth/roles/{slug}/permissions   {permissionSlugs[]}
GET  /api/auth/permissions
```

### Middleware (route → required permission)

```
POST   /api/territories               → territory:write
DELETE /api/territories/{slug}        → territory:delete
POST   /api/models                    → model:write
DELETE /api/models/{slug}             → model:delete
POST   /api/territories/{s}/placements        → placement:write
PUT    /api/territories/{s}/placements/{id}   → placement:write
DELETE /api/territories/{s}/placements/{id}   → placement:delete
POST/PUT/DELETE panorama routes       → panorama:write / panorama:delete
POST   /api/uploads*                  → upload:create
GET    *                              → corresponding :read
```

Flow: extract Bearer → `auth.ValidateToken` (gRPC) → put principal in context → check required permission against the session's permission snapshot. Missing token → 401; missing permission → 403.

## 8. Code Structure (mirrors catalog-service, ≤200 lines/file)

```
proto/rosneft/auth/v1/auth.proto      # gRPC contract (Login, ValidateToken, CreateUser, …)

services/auth-service/
  cmd/auth/main.go
  internal/
    domain/      user.go role.go permission.go session.go status.go totp.go errors.go
    config/      config.go            # DSN, Redis addr, TTLs, argon2 params, bootstrap-admin
    bootstrap/   transport.go service.go logger.go serve.go postgres.go redis.go storage.go migrate.go

    storage/                          # Postgres, grouped by aggregate (each a Go subpackage)
      postgres.go                     # pool + constructor shared by subpackages
      users/        store.go create.go get_by_identifier.go get.go list.go
                    update_status.go soft_delete.go restore.go set_roles.go
                    change_password.go set_totp.go user_permissions.go
      roles/        store.go list.go create.go update.go delete.go set_permissions.go
      permissions/  store.go list.go
      recovery/     store.go          # 2FA recovery codes

    session/                          # Redis
      redis.go create.go get.go delete.go delete_user_sessions.go pending_2fa.go throttle.go

    service/                          # business logic, grouped by area
      auth/         auth.go login.go login_2fa.go logout.go validate_token.go
      users/        users.go create.go freeze.go soft_delete.go restore.go set_roles.go change_password.go
      twofa/        twofa.go setup.go enable.go disable.go
      roles/        roles.go crud.go set_permissions.go list_permissions.go

    password/     argon2.go           # Hash / Verify
    totp/         totp.go recovery.go # secret, verify, recovery codes
    migrate/      migrate.go up.go down.go status.go
                  migrations/00001_init.sql 00002_seed_roles_permissions.sql

services/gateway-service/             # extend existing
  internal/auth/      grpc client + middleware.go route_permissions.go principal.go
  internal/httpapi/   auth_handlers.go (login/me/2fa/users/roles → gRPC)
```

Each store/service subpackage declares its own dependency interface; `bootstrap/` builds the pool, Redis, wires everything, and registers gRPC.

**Entry-point file convention** (mirrors `medialog/students` — `pgstorage.go` / `student_service.go`):
- Each `storage/<aggregate>/store.go` holds the struct (carrying `*pgxpool.Pool`), its constructor, and shared helpers; `models.go` holds db row structs + column-name constants; every query gets its own file.
- Each `service/<area>/<area>.go` declares the **consumer-side store interface** it depends on, the service struct, and the constructor; every method gets its own file; mocks live in a sibling `mocks/` package generated by minimock.

**Compose:** new `auth` service (distroless/static, like catalog), own `auth` DB in the same Postgres, connection to Redis. Gateway gets `AUTH_GRPC_ADDR`.

**Bootstrap admin:** on startup, if no `admin` user exists, create one from env (`AUTH_BOOTSTRAP_EMAIL` / `AUTH_BOOTSTRAP_PASSWORD`) — otherwise the system has no administrator. Idempotent.

## 9. Testing

Backend convention: `testify/suite` + `gotest.tools/v3/assert`, no external deps (in-memory). Interface mocks via **minimock**.

- Store interfaces (Postgres) and the Redis session-store interface get **minimock**-generated mocks (`//go:generate minimock -i ... -o mocks/`). Add the dependency to the auth module's go.mod and a `make generate` target.
- **service** tests (mocks injected): login with/without 2FA, throttle lockout, freeze kills sessions, soft-delete/restore, permission checks, last-admin guard.
- **password** — argon2 hash/verify round-trip.
- **totp** — secret generation, code verification at fixed time, recovery-code one-time use.
- **gateway middleware** — mock auth gRPC client: no token → 401, missing permission → 403, has permission → passes.
