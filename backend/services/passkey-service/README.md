# passkey-service

Internal gRPC service that owns **WebAuthn / FIDO2 passkeys**: credential
storage, registration ceremonies, and assertion verification for passwordless
login.

`passkey` is **not** exposed on the host. It binds `passkey:9008` on the
Compose network. Two callers reach it:

- **gateway-service** — the management surface (`/api/auth/passkey/*`). The
  gateway has already authenticated the session, so it passes the resolved
  `user_id` (plus the login as `display_name` on `BeginRegistration`); passkey
  calls no other service. An empty `user_id` (or `display_name`) is
  `InvalidArgument`.
- **auth-service** — the login surface, during passwordless login. `FinishLogin`
  returns a **verified user id**, never a session. auth-service is the only
  service allowed to mint sessions.

## Responsibilities

- Store one row per enrolled WebAuthn public-key credential (`passkey_credentials`).
- Drive both ceremonies: build the `PublicKeyCredentialCreationOptions` /
  `RequestOptions` JSON the browser feeds to `navigator.credentials`, stash the
  challenge in Redis keyed by a server-minted `flow_id`, then verify the
  attestation / assertion the browser returns.
- Enforce sign-counter and Backup-Eligible (BE) invariants; write back the
  mutable Backup-State (BS) flag and `last_used_at` on each successful login.
- Never mint or validate sessions — that stays in auth-service.

## gRPC API

`service PasskeyService` (proto: `rosneft/passkey/v1/passkey.proto`). All RPCs
are unary.

| RPC | Request → Response | Caller | Description |
| --- | --- | --- | --- |
| `BeginRegistration` | `{user_id, display_name}` → `{options_json, flow_id}` | gateway | Builds `PublicKeyCredentialCreationOptions` (excluding already-enrolled credentials), stashes the challenge in Redis under `flow_id`. |
| `FinishRegistration` | `{user_id, flow_id, credential_json, name}` → `{credential}` | gateway | Verifies the attestation against the stashed challenge and stores the credential with the user-supplied label (e.g. `"MacBook Touch ID"`). |
| `ListCredentials` | `{user_id}` → `{credentials[]}` | gateway | Every passkey enrolled by that user (base64url id, name, `created_at`, `last_used_at`). |
| `DeleteCredential` | `{user_id, credential_id}` → `{}` | gateway | Removes one credential. The gateway additionally requires **step-up re-authentication** (a TOTP code when the user has 2FA) before calling this. |
| `BeginLogin` | `{}` → `{options_json, flow_id}` | auth | **Usernameless** — builds discoverable-credential request options with no `allowCredentials` list, so the authenticator picks the account. No user is named. |
| `FinishLogin` | `{flow_id, assertion_json}` → `{user_id}` | auth | Verifies the assertion, bumps the sign counter, writes back BS + `last_used_at`, and returns the **verified** user id. Explicitly **not** a session. |

### Error mapping

Sentinels in `internal/domain/errors.go` translate to gRPC codes in
`internal/transport/grpcapi/server.go`:

| Sentinel | gRPC code |
| --- | --- |
| `ErrInvalidInput` (empty `user_id` / `display_name`) | `InvalidArgument` |
| `ErrNotFound` (credential missing) | `NotFound` |
| `ErrCeremonyExpired` (unknown or TTL-expired `flow_id`) | `FailedPrecondition` |
| `ErrAssertionInvalid` | `Unauthenticated` |
| `ErrNoCredentials` (user has no passkeys enrolled) | `Unauthenticated` |
| everything else | `Internal` |

## Public HTTP surface (via gateway)

The gateway translates these into the RPCs above; browse them in Scalar at
`http://localhost:8080/docs`.

```
POST   /api/auth/passkey/login/begin      → {optionsJson, flowId}   (anonymous)
POST   /api/auth/passkey/login/finish     → {token, …}              (anonymous)
POST   /api/auth/passkey/register/begin   → {optionsJson, flowId}   (authenticated)
POST   /api/auth/passkey/register/finish  → Credential              (authenticated)
GET    /api/auth/passkey/credentials      → [Credential…]           (authenticated)
DELETE /api/auth/passkey/credentials/{id} → 204                     (authenticated + step-up)
```

## Storage

### Postgres — `passkey_credentials`

Shares the `andrey` database with catalog / auth / twofa, isolated by its own
`passkey_goose_db_version` table. `user_id` is auth-service's id and carries
**no FK** — services own their own tables.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `UUID` PK | `gen_random_uuid()` |
| `user_id` | `TEXT` | auth-service user id; indexed (`passkey_credentials_user_idx`) |
| `credential_id` | `BYTEA` UNIQUE | raw WebAuthn credential id |
| `public_key` | `BYTEA` | COSE public key |
| `sign_count` | `BIGINT` | authenticator signature counter |
| `transports` | `TEXT` | comma-joined hints (`usb`, `internal`, `hybrid`, …) |
| `aaguid` | `BYTEA` | authenticator model id |
| `backup_eligible` | `BOOLEAN` | **BE** — fixed for the credential's lifetime |
| `backup_state` | `BOOLEAN` | **BS** — mutable, rewritten on each login |
| `name` | `TEXT` | user-supplied label |
| `created_at` / `last_used_at` | `TIMESTAMPTZ` | `last_used_at` nullable |

> **Why BE/BS are persisted:** WebAuthn rejects an assertion whose Backup
> Eligible flag differs from the stored credential. Migration `00002` added both
> columns after login started failing for synced (iCloud/Google) passkeys.

Migrations live in `internal/migrate/migrations/` (goose, embedded) and run on
boot when `PASSKEY_AUTO_MIGRATE=true` (the default).

### Redis — ceremony state

Logical **DB 3** (auth uses 1, twofa uses 2). One key per in-flight ceremony,
keyed by `flow_id`, holding the challenge + session data, expiring after
`PASSKEY_CEREMONY_TTL`. Ceremonies are single-use — verified or expired state is
dropped.

## Configuration

All env vars are prefixed `PASSKEY_` (flags take precedence: flag > env >
default). Defaults shown.

| Var | Default | Purpose |
| --- | --- | --- |
| `PASSKEY_GRPC_ADDR` | `:9008` | gRPC listen address (internal) |
| `PASSKEY_METRICS_ADDR` | `:9101` | Prometheus `/metrics` listener |
| `PASSKEY_DB_DSN` | — | **required** — Postgres DSN |
| `PASSKEY_REDIS_ADDR` | `redis:6379` | Redis for ceremony state |
| `PASSKEY_REDIS_DB` | `3` | Logical Redis DB |
| `PASSKEY_RP_ID` | — | **required** — Relying Party id: the *registrable domain* in the browser address bar (`localhost` in dev, `andrey.vbncursed.fun` in prod). No scheme, no port. |
| `PASSKEY_RP_ORIGINS` | — | **required** — comma-separated allowed origins, scheme+host(+port): `http://localhost:3000`, `https://andrey.vbncursed.fun` |
| `PASSKEY_RP_NAME` | `Andrey` | Display name shown by the authenticator prompt |
| `PASSKEY_CEREMONY_TTL` | `5m` | How long a `flow_id` stays valid |
| `PASSKEY_AUTO_MIGRATE` | `true` | Run goose migrations on boot |
| `PASSKEY_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `PASSKEY_LOG_FORMAT` | `json` | `json` / `text` |
| `PASSKEY_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain on SIGTERM |

> **RP_ID / RP_ORIGINS must match the browser exactly.** A mismatch fails the
> ceremony client-side with an opaque `SecurityError` and produces no server
> log. In production these must be overridden — the compose defaults are
> `localhost` / `http://localhost:3000`. The local frontend therefore runs on
> **port 3000**, not Vite's default 5173.

## Layout

```
cmd/passkey/           # Cobra root command; dispatches to bootstrap
internal/
  bootstrap/           # config → logger → postgres → redis → service → gRPC
  ceremony/            # Redis-backed challenge store keyed by flow_id
  config/              # Viper layered config, PASSKEY_* env vars
  domain/              # Credential value type + error sentinels
  migrate/             # goose runner + embedded migrations/
  service/passkey/     # business layer: register.go / login.go / manage.go
    mocks/             # minimock-generated (lint-exempt)
  storage/credentials/ # pgx credential store
  transport/grpcapi/   # one file per RPC group; server.go has the error mapper
  webauthn/            # go-webauthn engine + User adapter
```

## Toolchain & dependencies

Go **1.27.3** (`go 1.27.3` in `go.mod`; image `golang:1.27.3-alpine`).

| Module | Version | Role |
| --- | --- | --- |
| `github.com/go-webauthn/webauthn` | v0.18.1 | WebAuthn ceremony + assertion verification |
| `github.com/jackc/pgx/v5` | v5.11.0 | Postgres driver / pool |
| `github.com/pressly/goose/v3` | v3.28.0 | Embedded migrations |
| `github.com/redis/go-redis/v9` | v9.21.0 | Ceremony state (DB 3) |
| `github.com/spf13/cobra` | v1.10.2 | CLI |
| `github.com/spf13/viper` | v1.21.0 | Layered config |
| `google.golang.org/grpc` | v1.82.1 | Transport |
| `github.com/gojuno/minimock/v3` | v3.4.7 | Interface mocks (test) |
| `github.com/stretchr/testify` | v1.11.1 | Suite grouping (test) |
| `gotest.tools/v3` | v3.5.2 | Assertions (test) |
| `backend/pkg`, `backend/proto` | workspace | Shared libs + generated stubs |

## Run locally

From `backend/`:

```bash
make build
./bin/passkey --grpc-addr :9008 \
  --db-dsn "postgres://andrey:andrey@localhost:5432/andrey?sslmode=disable" \
  --redis-addr localhost:6379 --redis-db 3 \
  --rp-id localhost --rp-origins http://localhost:3000
```

Or via Compose: `make compose-up`. The frontend must then run on port 3000
(`yarn dev`, which defaults to it) to match `PASSKEY_RP_ORIGINS`.

## Tests / lint

```bash
make test
make lint
```

Service-level coverage lives in `internal/service/passkey/*_test.go` against
minimock-generated `Store` / `Ceremonies` / `Engine` mocks — no Postgres, Redis,
or authenticator required.

## Trust boundary

passkey trusts the `user_id` it is given: it has no session check of its own, so
whoever can reach `:9008` can register a credential on any user's account and
then log in as that user without a password, or list and delete anyone's
credentials. That reachability is the whole access control, and it is enforced
by the `identity` network in `docker-compose.yml`, not by this README: passkey
is on `identity` alone, and only `gateway`, `auth`, `postgres`, `redis` and
`prometheus` (which scrapes `:9101`) share it. Every other container
(mesh-worker parsing uploads, upload, asset, ...) cannot resolve `passkey` at all.

`twofa` is on the same network, so it can reach passkey and vice versa. They
have no reason to talk, and a compromised one could call the other; a second
network would isolate them, and is left out as complexity this does not yet earn.

The port is `expose`d only and must never be published. If a service is ever
added to `identity`, treat it as able to act on any user's passkeys and 2FA and
give the change a reason.
