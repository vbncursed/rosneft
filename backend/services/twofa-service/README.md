# twofa-service

Owns two-factor authentication (TOTP): per-user secrets, enable/disable,
one-time recovery codes, and login-time code verification. Postgres-backed for
durable enrollment state, Redis-backed for the verify-failure lockout. Exposes
an internal gRPC surface; it has no public HTTP listener.

Extracted from `auth-service` so 2FA (with its encryption key and its own
failure-lockout state) is an isolated concern. `auth` delegates login-time
verification to it; `gateway` routes the user-facing management calls to it.

## Responsibilities

- **Enrollment**: generate a TOTP secret + `otpauth://` URL (pending), confirm a
  code to enable, disable, and regenerate one-time recovery codes.
- **Verification**: answer `IsEnabled` and `Verify` for a user during the
  two-step login challenge (called by `auth-service`).
- **Secret protection**: AES-256-GCM-encrypt the TOTP secret at rest; store
  recovery codes hashed and single-use.
- **Abuse control**: rate-limit failed verifications into a per-user lockout.

## Layout

```
internal/
  bootstrap/   # config → postgres + redis → service → gRPC server
  clients/auth/# resolves a session token → (userID, username) via auth-service
  config/      # Viper layered config, TWOFA_* env vars
  domain/      # Credential + sentinel errors (errors.go)
  migrate/     # embedded goose migrations + up/down/status runners
  ratelimit/   # Redis verify-failure counter → lockout
  secret/      # AES-GCM cipher for TOTP secrets (aesgcm.go)
  totp/        # pquerna/otp wrapper + recovery-code helpers
  storage/     # credentials + recovery stores (one file = one DB method)
  service/twofa/      # business layer, one method per file
  transport/grpcapi/  # gRPC handlers: self.go (token-scoped), query.go
                      # (auth-called), server.go (interfaces + error mapper)
```

## gRPC API

Internal gRPC only — addressed as `twofa:9006`. Two caller groups: the **self**
RPCs (management) are invoked by `gateway` with a session token, which twofa
resolves to a user via the `auth` client; the **query** RPCs are invoked by
`auth-service` directly with a `user_id` during login. All 6 RPCs of
`TwoFAService` (`proto/rosneft/twofa/v1/twofa.proto`):

| RPC | Caller | Description |
| --- | --- | --- |
| `Setup` | gateway | Generate a TOTP secret + `otpauth://` URL (pending until enabled). |
| `Enable` | gateway | Confirm a code, turn 2FA on, return one-time recovery codes. |
| `Disable` | gateway | Confirm a code, turn 2FA off, clear recovery codes. |
| `RegenerateRecoveryCodes` | gateway | Confirm a code, replace the recovery-code set. |
| `IsEnabled` | auth | Whether a user has 2FA enabled (login branch). |
| `Verify` | auth | Verify a TOTP or recovery code; rate-limited → lockout on repeated failure. |

Sentinels map to gRPC codes in `server.go` (`mapErr`): invalid code →
`InvalidArgument`; locked out → `ResourceExhausted`; already-enabled /
not-enabled → `FailedPrecondition`; unknown user → `NotFound`.

## Data model

twofa-service shares the `andrey` Postgres database with catalog/auth; their
migration histories are separated by a custom goose version table,
`twofa_goose_db_version` (`internal/migrate/migrations/00001_init.sql`).

| Table | Purpose |
| --- | --- |
| `twofa_credentials` | `user_id` PK, encrypted `secret BYTEA`, `enabled`, `updated_at`. |
| `twofa_recovery_codes` | per-user hashed one-time recovery codes, `used_at` marker. |

## Security

- **TOTP secrets at rest**: AES-256-GCM (`internal/secret`) with a random
  per-record nonce; the 32-byte key comes from `TWOFA_SECRET_KEY` (64-char hex
  or base64).
- **TOTP**: `pquerna/otp`, issuer label from `TWOFA_ISSUER`, with skew
  tolerance; recovery codes stored hashed and single-use.
- **Lockout**: `TWOFA_VERIFY_MAX_FAILS` failed `Verify` attempts within
  `TWOFA_VERIFY_LOCK_TTL` lock further attempts (Redis logical DB 2).

## Configuration

All env vars are prefixed `TWOFA_` (layered flag > env > default).

| Var | Default | Purpose |
| --- | --- | --- |
| `TWOFA_GRPC_ADDR` | `:9006` | gRPC listener (internal network). |
| `TWOFA_DB_DSN` | *(required)* | Postgres DSN (shared `andrey` DB). |
| `TWOFA_REDIS_ADDR` | `redis:6379` | Redis address for the verify lockout. |
| `TWOFA_REDIS_DB` | `2` | Redis logical DB index. |
| `TWOFA_SECRET_KEY` | *(required)* | 32-byte key (hex/base64) for TOTP-secret AES-GCM. |
| `TWOFA_ISSUER` | `Andrey` | `otpauth` issuer label shown in authenticator apps. |
| `TWOFA_AUTH_GRPC_ADDR` | `auth:9004` | auth-service address for token → identity resolution. |
| `TWOFA_VERIFY_MAX_FAILS` | `5` | Failed codes before lockout. |
| `TWOFA_VERIFY_LOCK_TTL` | `15m` | Lockout duration. |
| `TWOFA_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. |
| `TWOFA_LOG_FORMAT` | `json` | `json` / `text`. |
| `TWOFA_AUTO_MIGRATE` | `true` | Run goose migrations on startup. |
| `TWOFA_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain window. |

## Run / build / test

From `backend/`:

```bash
make build            # → ./bin/twofa (among the other service binaries)
make test             # go test -race -shuffle=on across modules
```

```bash
./bin/twofa serve          --db-dsn "$DSN" --secret-key "$KEY" --redis-addr localhost:6379
./bin/twofa migrate-up     --db-dsn "$DSN"
./bin/twofa migrate-down   --db-dsn "$DSN"
./bin/twofa migrate-status --db-dsn "$DSN"
```

With `TWOFA_AUTO_MIGRATE=true` (default), `serve` migrates on startup. Or via
Compose: `make compose-up`. Service-layer tests run against minimock fakes plus
dedicated `secret` (AES-GCM) and `totp` unit tests — no external Postgres or
Redis required for the unit suite.
