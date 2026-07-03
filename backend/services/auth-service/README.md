# auth-service

Owns users, roles, permissions (RBAC), and sessions. Postgres-backed for durable
state, Redis-backed for sessions. Exposes an internal gRPC surface consumed
exclusively by `gateway`; it has no public HTTP listener.

> **Two-factor auth (TOTP)** was split out into
> [`twofa-service`](../twofa-service/README.md). auth keeps only the two-step
> login *challenge* (`LoginVerify2FA`) and calls twofa's `IsEnabled` / `Verify`
> during login; enrollment (setup/enable/disable/recovery) and secret storage
> live in twofa. Migration `00010_drop_totp` removed the `totp_*` columns and
> the `recovery_codes` table from auth.

## Responsibilities

- CRUD over `users` with lifecycle states (`active` / `frozen` / `deleted`),
  freeze/unfreeze and soft-delete/restore, and owner assignment.
- RBAC: roles, the permission catalog, and the role↔permission and user↔role
  joins. System roles and a permission catalog are seeded on migrate.
- Sessions: mints opaque bearer tokens stored in Redis, validates them, and
  revokes them on logout, freeze, soft-delete, or role change.
- Login flow: password verification and, when a user has 2FA on, a short-lived
  challenge token exchanged via `LoginVerify2FA` (code verified by twofa).
- Password hashing/verification (argon2id).

## Layout

```
internal/
  bootstrap/   # config → postgres + redis → service → gRPC server; bootstrap-admin
  clients/twofa/  # gRPC client for twofa-service (IsEnabled / Verify at login)
  config/      # Viper layered config, AUTH_* env vars
  domain/      # entities + sentinel errors (errors.go)
  migrate/     # embedded goose migrations + up/down/status runners
  password/    # argon2id PHC hashing + constant-time verify
  secret/      # crypto/rand opaque session-token mint (token.go)
  session/     # Redis session store, 2FA challenge store, login throttle
  storage/     # one package per aggregate (users/roles/permissions);
               # one file = one DB method
  service/     # business layer (auth/users/roles); service.go owns the
               # storage interface + constructor, one method per file
  transport/grpcapi/  # gRPC handlers; server.go has dependency interfaces,
                      # the Server, registration, and the central error mapper
```

The split mirrors the project-wide convention: every storage / service / api
package has one file with the interface or constructor and the rest one method
each, under the 200-line cap.

## gRPC API

Internal gRPC only — the server binds to the Compose network and is addressed
as `auth:9004`. The `gateway` service is the sole caller; nothing is exposed on
the host. All 21 RPCs of `AuthService` (`proto/rosneft/auth/v1/auth.proto`) are
implemented in `internal/transport/grpcapi/`.

Domain sentinel errors are mapped to gRPC codes centrally in `server.go`
(`mapError`): invalid input → `InvalidArgument`, missing user/role →
`NotFound`, bad credentials / invalid session / bad 2FA code →
`Unauthenticated`, frozen/deleted/throttled/2FA-required → `PermissionDenied`,
taken email/username/role-slug → `AlreadyExists`, last-admin / self-target /
system-role → `FailedPrecondition`.

### Session / login

| RPC | Request → Response | Description |
| --- | --- | --- |
| `Login` | `LoginRequest` → `LoginResponse` | Verify identifier + password. On success returns a session token; if 2FA is on, returns `two_factor_required=true` + a short-lived `challenge_token` instead. Throttled per identifier. |
| `LoginVerify2FA` | `LoginVerify2FARequest` → `LoginResponse` | Exchange a challenge token + TOTP/recovery code for a session token. |
| `Logout` | `LogoutRequest` → `LogoutResponse` | Revoke a single session token. |
| `ValidateToken` | `ValidateTokenRequest` → `ValidateTokenResponse` | Resolve a token to `user_id` + the user's flattened permission set (the gateway's authz hook). Slides the idle TTL. |

### Self

| RPC | Request → Response | Description |
| --- | --- | --- |
| `GetMe` | `GetMeRequest` → `User` | The caller's own profile, resolved from the session token. |
| `ChangePassword` | `ChangePasswordRequest` → `ChangePasswordResponse` | Verify old password, set a new one. |

2FA enrollment (Setup/Enable/Disable/Regenerate) is served by
[`twofa-service`](../twofa-service/README.md), which the gateway calls directly.

### User admin

| RPC | Request → Response | Description |
| --- | --- | --- |
| `CreateUser` | `CreateUserRequest` → `User` | Create a user with a hashed password and initial role slugs. |
| `ListUsers` | `ListUsersRequest` → `ListUsersResponse` | List users, optionally filtered by status / including soft-deleted. |
| `GetUser` | `GetUserRequest` → `User` | Fetch a single user by id. |
| `UpdateUser` | `UpdateUserRequest` → `User` | Update email/username (empty = unchanged) and replace role slugs when set. |
| `FreezeUser` | `FreezeUserRequest` → `User` | Set status `frozen` and evict the user's sessions. Actor resolved server-side from the token. |
| `UnfreezeUser` | `UnfreezeUserRequest` → `User` | Return a frozen account to `active`. |
| `SoftDeleteUser` | `SoftDeleteUserRequest` → `SoftDeleteUserResponse` | Set status `deleted` + `deleted_at`, evict sessions. Actor resolved server-side. |
| `RestoreUser` | `RestoreUserRequest` → `User` | Return a soft-deleted account to `active`. |
| `SetUserOwner` | `SetUserOwnerRequest` → `User` | Assign the organizational owner (people-manager scope) of a user. |

Freeze and soft-delete guard against acting on yourself and against removing the
last admin.

### Roles / permissions

| RPC | Request → Response | Description |
| --- | --- | --- |
| `ListRoles` | `ListRolesRequest` → `ListRolesResponse` | All roles with their permission slugs. |
| `CreateRole` | `CreateRoleRequest` → `Role` | Create a non-system role with an initial permission set. |
| `UpdateRole` | `UpdateRoleRequest` → `Role` | Rename a role's title. |
| `DeleteRole` | `DeleteRoleRequest` → `DeleteRoleResponse` | Delete a role (system roles are protected). |
| `SetRolePermissions` | `SetRolePermissionsRequest` → `Role` | Replace a role's permission set. |
| `ListPermissions` | `ListPermissionsRequest` → `ListPermissionsResponse` | The full permission catalog. |

## Data model

Postgres schema (`internal/migrate/migrations/00001_init.sql`):

| Table | Purpose |
| --- | --- |
| `users` | id, `CITEXT` email + username (case-insensitive unique), `password_hash`, `status` (`active`/`frozen`/`deleted`), `owner_user_id` (people-manager scope), `deleted_at`. The `totp_*` columns were dropped in `00010` — 2FA state lives in twofa-service. |
| `roles` | slug, title, `is_system` flag. |
| `permissions` | slug + description (the catalog). |
| `role_permissions` | role↔permission join (CASCADE both ways). |
| `user_roles` | user↔role join (CASCADE on user, RESTRICT on role). |

Seeded system roles (`00002_seed_roles_permissions.sql`):

| Role | Grant |
| --- | --- |
| `admin` | every permission. |
| `owner` | user + role management + all reads (people & roles manager). |
| `editor` | placement/panorama write/delete + all reads (scene editor). |
| `viewer` | all `*:read` permissions. |

The 20-permission catalog covers `territory:{read,write,delete}`,
`model:{read,write,delete}`, `placement:{read,write,delete}`,
`panorama:{read,write,delete}`, `upload:create`,
`users:{read,write,freeze,delete}`, `roles:{read,manage}`, and
`permissions:read`.

auth shares the `andrey` Postgres database with catalog-service; the two
services' migration histories are kept separate by a custom goose version table,
`auth_goose_db_version`.

## Sessions

Opaque session tokens (32 bytes of `crypto/rand`, URL-safe base64) live in Redis
DB 1 (`AUTH_REDIS_DB`). Keys: `session:<token>`, `user_sessions:<uid>` (the set
used for mass revocation), `2fa_pending:<challenge>`, `login_fail:<identifier>`.

- **Sliding idle TTL** (`AUTH_SESSION_IDLE_TTL`, default 24h): every successful
  `ValidateToken` refreshes the key's expiry, never past the absolute cap.
- **Absolute cap** (`AUTH_SESSION_ABSOLUTE_TTL`, default 720h / 30 days): stamped
  at login; once reached the session is invalid regardless of activity.
- **Instant revocation**: `Logout` drops one token; freeze, soft-delete, and
  role changes call `DeleteUser` to wipe every session of that user at once.
- **Login throttle**: `AUTH_LOGIN_MAX_FAILS` (default 5) failed attempts per
  identifier within `AUTH_LOGIN_LOCK_TTL` (default 15m) locks further attempts.

## Security

- **Passwords**: argon2id (`golang.org/x/crypto/argon2`), 64 MiB / t=1 / 4
  threads, 16-byte random salt, encoded as a self-describing PHC string so
  parameters travel with the hash. Verification is constant-time
  (`crypto/subtle`).
- **Tokens**: session tokens and 2FA challenge tokens are minted from
  `crypto/rand` (`internal/secret/token.go`).
- **2FA**: TOTP secrets, recovery codes, and code verification live in
  [`twofa-service`](../twofa-service/README.md); auth never sees the secret.

## Configuration

All env vars are prefixed `AUTH_` (layered flag > env > default).

| Var | Default | Purpose |
| --- | --- | --- |
| `AUTH_GRPC_ADDR` | `:9004` | gRPC listener (internal network). |
| `AUTH_DB_DSN` | *(required)* | Postgres DSN (shared `andrey` DB). |
| `AUTH_REDIS_ADDR` | `redis:6379` | Redis address for sessions. |
| `AUTH_REDIS_DB` | `1` | Redis logical DB index. |
| `AUTH_TWOFA_GRPC_ADDR` | `twofa:9006` | twofa-service address for login-time 2FA checks. |
| `AUTH_SESSION_IDLE_TTL` | `24h` | Sliding idle session timeout. |
| `AUTH_SESSION_ABSOLUTE_TTL` | `720h` | Absolute max session lifetime. |
| `AUTH_LOGIN_MAX_FAILS` | `5` | Failed logins before lockout. |
| `AUTH_LOGIN_LOCK_TTL` | `15m` | Lockout duration. |
| `AUTH_BOOTSTRAP_EMAIL` | *(empty)* | First-admin email (created if no admin exists). |
| `AUTH_BOOTSTRAP_USERNAME` | *(empty)* | First-admin username. |
| `AUTH_BOOTSTRAP_PASSWORD` | *(empty)* | First-admin password. |
| `AUTH_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. |
| `AUTH_LOG_FORMAT` | `json` | `json` / `text`. |
| `AUTH_AUTO_MIGRATE` | `true` | Run goose migrations on startup. |
| `AUTH_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain window. |

## Run / build / test

From `backend/`:

```bash
make build            # → ./bin/auth (among the other service binaries)
make test             # go test -race -shuffle=on across modules
```

The binary is a cobra command. `serve` (the default `RunE`) starts the gRPC
server; migrations have dedicated subcommands:

```bash
./bin/auth serve           --db-dsn "$DSN" --redis-addr localhost:6379
./bin/auth migrate-up      --db-dsn "$DSN"   # apply pending migrations
./bin/auth migrate-down    --db-dsn "$DSN"   # roll back the most recent migration
./bin/auth migrate-status  --db-dsn "$DSN"   # print migration status
```

With `AUTH_AUTO_MIGRATE=true` (default), `serve` runs migrations on startup, so
the subcommands are only needed for explicit control.

**Bootstrap admin**: on `serve`, if all three `AUTH_BOOTSTRAP_*` creds are set
*and* no admin currently exists, the service creates a first admin user with the
`admin` role. The step is idempotent — a no-op once any admin is present or when
the creds are unset (and tolerates a racing email/username collision).

Or via Compose: `make compose-up` (auth shares `postgres` + `redis` with the
rest of the stack).

## Tests

```bash
make test
```

Service-layer tests run against in-memory fakes (`internal/service/*/mocks/`);
the password hashing and token-mint primitives have their own unit tests. No
external Postgres or Redis is required for the unit suite.
