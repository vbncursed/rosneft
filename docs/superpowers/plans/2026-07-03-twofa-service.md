# twofa-service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the already-working 2FA/TOTP feature out of `auth-service` into a standalone `twofa-service` microservice, and close the real gaps (verify rate-limit, configurable issuer, recovery-code regeneration) while doing so.

**Architecture:** `twofa-service` becomes the sole owner of all 2FA data (`twofa_credentials`, `twofa_recovery_codes`) and logic. `auth-service` stays the authority for passwords + sessions and, during login, calls `twofa-service` (`IsEnabled`, `Verify`) over gRPC; the pending 2FA challenge and session issuance stay in auth. Management endpoints (`setup/enable/disable/regenerate`) go gateway → twofa directly; twofa resolves the caller's identity by calling back to `auth.GetMe`.

**Tech Stack:** Go 1.26.4, gRPC (buf-generated stubs), pgx/v5 + goose (shared `andrey` Postgres DB), go-redis/v9, cobra+viper config, `pquerna/otp`, distroless Docker, docker-compose. Frontend: Next.js 16 / React 19.

## Global Constraints

- **Go version:** 1.26.4 (matches `go.work`). New module `go.mod` uses `go 1.26.4`.
- **Module path:** `github.com/vbncursed/rosneft/backend/services/twofa-service`.
- **File cap:** backend has no hard line cap, but keep one responsibility per file (mirror auth-service). Frontend files: **hard cap 200 lines** (ESLint `max-lines`, skipBlankLines+skipComments).
- **Brand rule:** never emit the word "Rosneft"/"Роснефть" in displayed/user-facing text; the brand is "Andrey". Lowercase `rosneft` in import paths/module names is structural and stays. The TOTP issuer default is `Andrey`.
- **DB sharing:** twofa shares the `andrey` Postgres DB, isolated by its own goose version table `twofa_goose_db_version` (same pattern as auth isolating via `auth_goose_db_version`).
- **AES key continuity:** `TWOFA_SECRET_KEY` must be set to the **same value** as the existing `AUTH_SECRET_KEY` so any already-encrypted secrets (if migration copies them) still decrypt.
- **Migration assumption:** no production users currently have 2FA enabled (confirm before deploy). Tasks 4 and 9 create/drop cleanly under that assumption; the data-copy fallback is called out in Task 4.
- **gRPC ports:** auth `:9004`, gateway `:8080`, twofa **`:9006`** (new).
- **Redis DBs:** auth uses logical DB `1`; twofa uses logical DB `2`.
- **Commit cadence:** one commit per task minimum; commit after each green test cycle.

---

## Phase A — Proto contract

### Task 1: Define and generate the twofa proto

**Files:**
- Create: `backend/proto/rosneft/twofa/v1/twofa.proto`
- Generated (by buf): `backend/proto/gen/go/rosneft/twofa/v1/twofa.pb.go`, `twofa_grpc.pb.go`

**Interfaces:**
- Produces: gRPC service `TwoFAService` with RPCs `Setup`, `Enable`, `Disable`, `RegenerateRecoveryCodes`, `IsEnabled`, `Verify` and the message types below. Every later task consumes `twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"`.

- [ ] **Step 1: Write the proto**

Create `backend/proto/rosneft/twofa/v1/twofa.proto` (mirror the header/options style of `rosneft/auth/v1/auth.proto` — open it to copy the exact `option go_package` line format, substituting `twofa/v1;twofav1`):

```proto
syntax = "proto3";

package rosneft.twofa.v1;

option go_package = "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1;twofav1";

// TwoFAService owns all TOTP/recovery state and logic.
service TwoFAService {
  // Management surface (caller authenticated by a session token; twofa
  // resolves the user via auth.GetMe).
  rpc Setup(SetupRequest) returns (SetupResponse);
  rpc Enable(EnableRequest) returns (EnableResponse);
  rpc Disable(DisableRequest) returns (DisableResponse);
  rpc RegenerateRecoveryCodes(RegenerateRequest) returns (RegenerateResponse);

  // Internal surface (called by auth-service during login with a trusted user_id).
  rpc IsEnabled(IsEnabledRequest) returns (IsEnabledResponse);
  rpc Verify(VerifyRequest) returns (VerifyResponse);
}

message SetupRequest { string token = 1; }
message SetupResponse {
  string secret = 1;
  string otpauth_url = 2;
}
message EnableRequest {
  string token = 1;
  string code = 2;
}
message EnableResponse { repeated string recovery_codes = 1; }
message DisableRequest {
  string token = 1;
  string code = 2;
}
message DisableResponse {}
message RegenerateRequest {
  string token = 1;
  string code = 2;
}
message RegenerateResponse { repeated string recovery_codes = 1; }

message IsEnabledRequest { string user_id = 1; }
message IsEnabledResponse { bool enabled = 1; }
message VerifyRequest {
  string user_id = 1;
  string code = 2;
}
message VerifyResponse { bool valid = 1; }
```

- [ ] **Step 2: Generate the Go stubs**

Run: `cd backend/proto && buf generate`
Expected: creates `backend/proto/gen/go/rosneft/twofa/v1/twofa.pb.go` and `twofa_grpc.pb.go` with no errors.

- [ ] **Step 3: Verify the proto module still builds**

Run: `cd backend && go build ./proto/...`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add backend/proto/rosneft/twofa/v1/twofa.proto backend/proto/gen/go/rosneft/twofa/v1/
git commit -m "feat(proto): add rosneft.twofa.v1 TwoFAService contract"
```

---

## Phase B — Build twofa-service

### Task 2: Module skeleton, config, main, Dockerfile (compiles, serves nothing yet)

**Files:**
- Create: `backend/services/twofa-service/go.mod`
- Create: `backend/services/twofa-service/internal/config/config.go`
- Create: `backend/services/twofa-service/cmd/twofa/main.go`
- Create: `backend/services/twofa-service/Dockerfile`
- Modify: `backend/go.work` (add the module)
- Modify: every existing `backend/services/*/Dockerfile` (add the new go.mod COPY line)

**Interfaces:**
- Produces: `config.Config{ GRPCAddr, DBDSN, RedisAddr, RedisDB, SecretKey, Issuer, AuthGRPCAddr, VerifyMaxFails, VerifyLockTTL, LogLevel, LogFormat, AutoMigrate, ShutdownTimeout }`, `config.Load(cmd) (Config, error)`, `config.Validate()`. Consumed by every later twofa task.

- [ ] **Step 1: Create `go.mod`**

`backend/services/twofa-service/go.mod` — start from a copy of `backend/services/auth-service/go.mod`, change the module line to `module github.com/vbncursed/rosneft/backend/services/twofa-service`, keep the same `go 1.26.4` and the same require block (pgx, redis, cobra, viper, grpc, pquerna/otp, the internal `proto` and `pkg` replace/requires). Then run `cd backend/services/twofa-service && go mod tidy` after files exist (Step 8).

- [ ] **Step 2: Add module to `go.work`**

Edit `backend/go.work`, add under `use (`:

```
	./services/twofa-service
```

- [ ] **Step 3: Write `config.go`**

Copy `backend/services/auth-service/internal/config/config.go` and adapt. Full file:

```go
// Package config builds the twofa service configuration via Viper, layered as
// flag > env (TWOFA_*) > default.
package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// Config aggregates all runtime knobs.
type Config struct {
	GRPCAddr        string        `mapstructure:"grpc-addr"`
	DBDSN           string        `mapstructure:"db-dsn"`
	RedisAddr       string        `mapstructure:"redis-addr"`
	RedisDB         int           `mapstructure:"redis-db"`
	SecretKey       string        `mapstructure:"secret-key"` // 32-byte hex/base64, AES-GCM of totp secrets
	Issuer          string        `mapstructure:"issuer"`     // otpauth issuer label
	AuthGRPCAddr    string        `mapstructure:"auth-grpc-addr"`
	VerifyMaxFails  int           `mapstructure:"verify-max-fails"`
	VerifyLockTTL   time.Duration `mapstructure:"verify-lock-ttl"`
	LogLevel        string        `mapstructure:"log-level"`
	LogFormat       string        `mapstructure:"log-format"`
	AutoMigrate     bool          `mapstructure:"auto-migrate"`
	ShutdownTimeout time.Duration `mapstructure:"shutdown-timeout"`
}

const envPrefix = "TWOFA"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("grpc-addr", ":9006")
	v.SetDefault("redis-addr", "redis:6379")
	v.SetDefault("redis-db", 2)
	v.SetDefault("issuer", "Andrey")
	v.SetDefault("auth-grpc-addr", "auth:9004")
	v.SetDefault("verify-max-fails", 5)
	v.SetDefault("verify-lock-ttl", 15*time.Minute)
	v.SetDefault("log-level", "info")
	v.SetDefault("log-format", "json")
	v.SetDefault("auto-migrate", true)
	v.SetDefault("shutdown-timeout", 15*time.Second)

	if err := v.BindPFlags(cmd.Root().PersistentFlags()); err != nil {
		return Config{}, fmt.Errorf("config: bind persistent flags: %w", err)
	}
	if err := v.BindPFlags(cmd.Flags()); err != nil {
		return Config{}, fmt.Errorf("config: bind flags: %w", err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return Config{}, fmt.Errorf("config: unmarshal: %w", err)
	}
	return cfg, nil
}

// Validate fails fast on missing required values.
func (c Config) Validate() error {
	if c.DBDSN == "" {
		return fmt.Errorf("config: db-dsn is required (set --db-dsn or %s_DB_DSN)", envPrefix)
	}
	if c.SecretKey == "" {
		return fmt.Errorf("config: secret-key is required (set --secret-key or %s_SECRET_KEY)", envPrefix)
	}
	return nil
}
```

- [ ] **Step 4: Write `main.go`**

Copy `backend/services/auth-service/cmd/auth/main.go` into `backend/services/twofa-service/cmd/twofa/main.go`. Change: `Use: "twofa"`, short/long text to twofa, imports to the twofa module, and the flag set to match the new config (drop session/login/bootstrap/pending flags; keep grpc-addr default `:9006`, db-dsn, redis-addr, redis-db default `2`, secret-key, add `issuer` default `Andrey`, `auth-grpc-addr` default `auth:9004`, `verify-max-fails` default `5`, `verify-lock-ttl` default `15m`, log-level, log-format, auto-migrate, shutdown-timeout). Keep the `serve`/`migrate-up`/`migrate-down`/`migrate-status` subcommands wired to `bootstrap.RunServe`/`RunMigrate*` (created in Task 8/4).

- [ ] **Step 5: Write `Dockerfile`**

Copy `backend/services/auth-service/Dockerfile` to `backend/services/twofa-service/Dockerfile`. Changes: add a COPY line for the new module go.mod (`COPY services/twofa-service/go.mod services/twofa-service/go.su[m] ./services/twofa-service/`), change the three `auth`-specific lines to `twofa` (`cd services/twofa-service`, `COPY services/twofa-service/`, `-o /out/twofa ./cmd/twofa`, final `COPY --from=build /out/twofa /twofa`, `ENTRYPOINT ["/twofa"]`), and `EXPOSE 9006`.

- [ ] **Step 6: Add the new go.mod to every other service Dockerfile**

Because each Dockerfile copies all `go.work` modules' `go.mod` before `go mod download`, add this line to the go.mod COPY block of **each** of `backend/services/{auth,gateway,catalog,mesh,asset,upload}-service/Dockerfile`:

```
COPY services/twofa-service/go.mod services/twofa-service/go.su[m] ./services/twofa-service/
```

- [ ] **Step 7: Stub `bootstrap` so main compiles**

Create `backend/services/twofa-service/internal/bootstrap/serve.go` with temporary stubs (filled in Task 8/4):

```go
// Package bootstrap wires the twofa service.
package bootstrap

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/config"
)

// RunServe starts the gRPC server. (filled in Task 8)
func RunServe(ctx context.Context, cfg config.Config) error { return nil }

// RunMigrateUp/Down/Status (filled in Task 4)
func RunMigrateUp(ctx context.Context, cfg config.Config) error     { return nil }
func RunMigrateDown(ctx context.Context, cfg config.Config) error   { return nil }
func RunMigrateStatus(ctx context.Context, cfg config.Config) error { return nil }
```

- [ ] **Step 8: Tidy and build**

Run:
```bash
cd backend/services/twofa-service && go mod tidy && go build ./...
cd backend && go build ./services/twofa-service/...
```
Expected: both build clean.

- [ ] **Step 9: Commit**

```bash
git add backend/go.work backend/services/twofa-service backend/services/*/Dockerfile
git commit -m "feat(twofa): scaffold twofa-service module, config, main, Dockerfile"
```

### Task 3: Relocate crypto + totp packages (drop dead code)

**Files:**
- Create: `backend/services/twofa-service/internal/secret/aesgcm.go` (+ `aesgcm_test.go`)
- Create: `backend/services/twofa-service/internal/totp/totp.go`, `recovery.go` (+ `totp_test.go`)

**Interfaces:**
- Produces: `secret.NewCipher(key) (*secret.Cipher, error)` with `Encrypt([]byte)([]byte,error)`/`Decrypt([]byte)([]byte,error)`; `totp.Generate(issuer, account)(secret, url string, err error)`, `totp.Validate(secret, code) bool`, `totp.GenerateRecovery(n)(plain, hashes []string, err error)`, `totp.MatchRecovery(plain, hashes)(int, bool)`.

- [ ] **Step 1: Copy `secret/aesgcm.go` verbatim** from `backend/services/auth-service/internal/secret/aesgcm.go` (package `secret`, no code changes — it has no auth-module imports). Copy `aesgcm_test.go` too.

- [ ] **Step 2: Copy `totp/totp.go` and delete `GenerateNow`** (dead — only used by its own test). Final `totp.go`:

```go
// Package totp wraps pquerna/otp for TOTP secret generation and validation,
// plus one-time recovery codes.
package totp

import (
	"fmt"

	"github.com/pquerna/otp/totp"
)

// Generate creates a new TOTP secret and its otpauth:// provisioning URL.
func Generate(issuer, account string) (secret, otpauthURL string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{Issuer: issuer, AccountName: account})
	if err != nil {
		return "", "", fmt.Errorf("totp.Generate: %w", err)
	}
	return key.Secret(), key.URL(), nil
}

// Validate reports whether code is currently valid for secret (±1 step skew).
func Validate(secret, code string) bool {
	return totp.Validate(code, secret)
}
```

- [ ] **Step 3: Copy `totp/recovery.go` verbatim** from auth-service (package `totp`, no auth imports).

- [ ] **Step 4: Copy tests, dropping the `GenerateNow` test.** In the copied `totp_test.go`, delete any test referencing `GenerateNow`. Keep `Generate`/`Validate`/`GenerateRecovery`/`MatchRecovery` tests.

- [ ] **Step 5: Run tests**

Run: `cd backend/services/twofa-service && go test ./internal/secret/... ./internal/totp/...`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/services/twofa-service/internal/secret backend/services/twofa-service/internal/totp
git commit -m "feat(twofa): relocate aes-gcm + totp packages (drop dead GenerateNow)"
```

### Task 4: Domain, storage (credentials + recovery), and migration

**Files:**
- Create: `backend/services/twofa-service/internal/domain/{credential.go, errors.go}`
- Create: `backend/services/twofa-service/internal/storage/credentials/store.go`
- Create: `backend/services/twofa-service/internal/storage/recovery/store.go`
- Create: `backend/services/twofa-service/internal/migrate/` (copy of auth's migrate pkg) + `migrations/00001_init.sql`

**Interfaces:**
- Produces:
  - `domain.Credential{ UserID string; Secret []byte; Enabled bool }`; sentinels `domain.Err2FAAlreadyEnabled`, `domain.Err2FANotEnabled`, `domain.Err2FAInvalidCode`, `domain.Err2FALocked`, `domain.ErrNotFound`.
  - `credentials.Store.New(pool)`; `Get(ctx, userID) (domain.Credential, error)` (returns `domain.ErrNotFound` when the user has no row — callers treat that as "not enrolled"); `Set(ctx, userID string, enabled bool, secret []byte) error` (upsert).
  - `recovery.Store.New(pool)`; `Replace/List/MarkUsed/DeleteAll` (same signatures as auth's recovery store) against `twofa_recovery_codes`.

- [ ] **Step 1: Write `domain/credential.go` and `domain/errors.go`**

```go
// Package domain holds twofa-service value types and sentinel errors.
package domain

// Credential is a user's TOTP enrollment state.
type Credential struct {
	UserID  string
	Secret  []byte // AES-GCM ciphertext; empty until Setup
	Enabled bool
}
```

```go
package domain

import "errors"

var (
	ErrNotFound          = errors.New("twofa credential not found")
	Err2FAAlreadyEnabled = errors.New("2fa already enabled")
	Err2FANotEnabled     = errors.New("2fa not enabled")
	Err2FAInvalidCode    = errors.New("invalid 2fa code")
	Err2FALocked         = errors.New("too many failed 2fa attempts")
)
```

- [ ] **Step 2: Write the migration SQL** `migrate/migrations/00001_init.sql`:

```sql
-- +goose Up
CREATE TABLE twofa_credentials (
    user_id    TEXT PRIMARY KEY,
    secret     BYTEA,
    enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE twofa_recovery_codes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    used_at    TIMESTAMPTZ
);
CREATE INDEX twofa_recovery_codes_user_idx ON twofa_recovery_codes (user_id);

-- +goose Down
DROP TABLE twofa_recovery_codes;
DROP TABLE twofa_credentials;
```

> **Migration-copy fallback (only if prod has enrolled 2FA users — see Global Constraints):** append to the `-- +goose Up` section, after the `CREATE`s:
> ```sql
> INSERT INTO twofa_credentials (user_id, secret, enabled)
>   SELECT id, totp_secret, totp_enabled FROM users WHERE totp_secret IS NOT NULL;
> INSERT INTO twofa_recovery_codes (id, user_id, code_hash, used_at)
>   SELECT id, user_id, code_hash, used_at FROM recovery_codes;
> ```
> This works because twofa shares the physical `andrey` DB with auth. Deploy order then becomes: twofa up+migrated → verify → auth drop-column migration (Task 9). `TWOFA_SECRET_KEY` must equal `AUTH_SECRET_KEY`.

- [ ] **Step 3: Copy the migrate runner package** from `backend/services/auth-service/internal/migrate/` into `backend/services/twofa-service/internal/migrate/` (the embed.FS + goose runner + the `RunMigrateUp/Down/Status` helpers referenced by `bootstrap`). Change the goose version-table constant from `auth_goose_db_version` to `twofa_goose_db_version` (search the copied files for `goose.SetTableName` / the table-name string). Replace the copied `migrations/*.sql` with only the `00001_init.sql` above. Update the `RunMigrate*` bodies to live in `bootstrap` (or keep in `migrate` and have bootstrap call them — match whatever auth does; wire the four `bootstrap.RunMigrate*` stubs from Task 2 to the real runner).

- [ ] **Step 4: Write `credentials/store.go`**

```go
// Package credentials is the PostgreSQL store for twofa enrollment state.
package credentials

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Get returns the user's credential, or domain.ErrNotFound if unenrolled.
func (s *Store) Get(ctx context.Context, userID string) (domain.Credential, error) {
	const q = `SELECT user_id, secret, enabled FROM twofa_credentials WHERE user_id = $1`
	var c domain.Credential
	if err := s.pool.QueryRow(ctx, q, userID).Scan(&c.UserID, &c.Secret, &c.Enabled); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Credential{}, domain.ErrNotFound
		}
		return domain.Credential{}, fmt.Errorf("credentials.Get: %w", err)
	}
	return c, nil
}

// Set upserts the enabled flag + secret (nil secret clears it).
func (s *Store) Set(ctx context.Context, userID string, enabled bool, secret []byte) error {
	const q = `INSERT INTO twofa_credentials (user_id, secret, enabled)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET secret = $2, enabled = $3, updated_at = now()`
	if _, err := s.pool.Exec(ctx, q, userID, secret, enabled); err != nil {
		return fmt.Errorf("credentials.Set: %w", err)
	}
	return nil
}
```

- [ ] **Step 5: Write `recovery/store.go`** — copy auth's `storage/recovery/store.go` verbatim, changing the table name in all four SQL statements from `recovery_codes` to `twofa_recovery_codes`.

- [ ] **Step 6: Build**

Run: `cd backend/services/twofa-service && go build ./...`
Expected: builds clean.

- [ ] **Step 7: Commit**

```bash
git add backend/services/twofa-service/internal/{domain,storage,migrate}
git commit -m "feat(twofa): domain, credentials/recovery stores, initial migration"
```

### Task 5: Core service — Setup/Enable/Disable/Regenerate/IsEnabled/Verify

**Files:**
- Create: `backend/services/twofa-service/internal/service/twofa/{twofa.go, setup.go, enable.go, disable.go, regenerate.go, query.go}`
- Create: `backend/services/twofa-service/internal/service/twofa/twofa_test.go`

**Interfaces:**
- Consumes: `domain.Credential`, sentinels (Task 4); `secret.Cipher`, `totp` (Task 3); `credentials.Store`, `recovery.Store` (Task 4); `RateLimiter` (Task 6 — defined here as an interface, wired later).
- Produces: `twofa.New(store Store, recovery Recovery, cipher Cipher, limiter RateLimiter, issuer string) *Service` with methods:
  - `Setup(ctx, userID, accountLabel string) (secret, url string, err error)`
  - `Enable(ctx, userID, code string) ([]string, error)`
  - `Disable(ctx, userID, code string) error`
  - `Regenerate(ctx, userID, code string) ([]string, error)`
  - `IsEnabled(ctx, userID string) (bool, error)`
  - `Verify(ctx, userID, code string) (bool, error)`

- [ ] **Step 1: Write `twofa.go` (interfaces + constructor)**

```go
// Package twofa owns TOTP enrollment, verification, and recovery codes.
package twofa

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
)

//go:generate minimock -i Store,Recovery,Cipher,RateLimiter -o ./mocks -s _mock.go

type Store interface {
	Get(ctx context.Context, userID string) (domain.Credential, error)
	Set(ctx context.Context, userID string, enabled bool, secret []byte) error
}

type Recovery interface {
	Replace(ctx context.Context, userID string, hashes []string) error
	List(ctx context.Context, userID string) (ids, hashes []string, err error)
	MarkUsed(ctx context.Context, id string) error
	DeleteAll(ctx context.Context, userID string) error
}

type Cipher interface {
	Encrypt(plain []byte) ([]byte, error)
	Decrypt(ct []byte) ([]byte, error)
}

// RateLimiter throttles the login Verify step per user.
type RateLimiter interface {
	IsLocked(ctx context.Context, userID string) (bool, error)
	RegisterFail(ctx context.Context, userID string) error
	Clear(ctx context.Context, userID string) error
}

type Service struct {
	store    Store
	recovery Recovery
	cipher   Cipher
	limiter  RateLimiter
	issuer   string
}

func New(store Store, recovery Recovery, cipher Cipher, limiter RateLimiter, issuer string) *Service {
	return &Service{store: store, recovery: recovery, cipher: cipher, limiter: limiter, issuer: issuer}
}

const recoveryCodeCount = 10
```

- [ ] **Step 2: Write `setup.go`** (accountLabel replaces the old `u.Username`; a missing credential row is fine → treated as not-enabled):

```go
package twofa

import (
	"context"
	"errors"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// Setup provisions a pending secret (stored encrypted, not yet enabled).
func (s *Service) Setup(ctx context.Context, userID, accountLabel string) (string, string, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return "", "", err
	}
	if c.Enabled {
		return "", "", domain.Err2FAAlreadyEnabled
	}
	secretPlain, url, err := totp.Generate(s.issuer, accountLabel)
	if err != nil {
		return "", "", err
	}
	ct, err := s.cipher.Encrypt([]byte(secretPlain))
	if err != nil {
		return "", "", fmt.Errorf("twofa.Setup: encrypt: %w", err)
	}
	if err := s.store.Set(ctx, userID, false, ct); err != nil {
		return "", "", err
	}
	return secretPlain, url, nil
}
```

- [ ] **Step 3: Write `enable.go`**:

```go
package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// Enable confirms the pending secret with a code, flips enabled on, and returns
// one-time recovery codes (shown once).
func (s *Service) Enable(ctx context.Context, userID, code string) ([]string, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	if c.Enabled {
		return nil, domain.Err2FAAlreadyEnabled
	}
	if len(c.Secret) == 0 {
		return nil, fmt.Errorf("twofa.Enable: %w: run setup first", domain.Err2FANotEnabled)
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return nil, fmt.Errorf("twofa.Enable: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return nil, domain.Err2FAInvalidCode
	}
	if err := s.store.Set(ctx, userID, true, c.Secret); err != nil {
		return nil, err
	}
	return s.issueRecovery(ctx, userID)
}

// issueRecovery generates + stores a fresh set, returning the plaintext once.
func (s *Service) issueRecovery(ctx context.Context, userID string) ([]string, error) {
	plain, hashes, err := totp.GenerateRecovery(recoveryCodeCount)
	if err != nil {
		return nil, err
	}
	if err := s.recovery.Replace(ctx, userID, hashes); err != nil {
		return nil, err
	}
	return plain, nil
}
```

- [ ] **Step 4: Write `disable.go`**:

```go
package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// Disable verifies a current code then clears the secret and recovery codes.
func (s *Service) Disable(ctx context.Context, userID, code string) error {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return err
	}
	if !c.Enabled {
		return domain.Err2FANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return fmt.Errorf("twofa.Disable: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return domain.Err2FAInvalidCode
	}
	if err := s.store.Set(ctx, userID, false, nil); err != nil {
		return err
	}
	return s.recovery.DeleteAll(ctx, userID)
}
```

- [ ] **Step 5: Write `regenerate.go`** (requires a valid TOTP code, then re-issues recovery codes):

```go
package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// Regenerate replaces the user's recovery codes after verifying a TOTP code.
func (s *Service) Regenerate(ctx context.Context, userID, code string) ([]string, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !c.Enabled {
		return nil, domain.Err2FANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return nil, fmt.Errorf("twofa.Regenerate: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return nil, domain.Err2FAInvalidCode
	}
	return s.issueRecovery(ctx, userID)
}
```

- [ ] **Step 6: Write `query.go` (IsEnabled + Verify)** — Verify consolidates decrypt + TOTP + recovery fallback + rate-limit (was split across auth's login_2fa):

```go
package twofa

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// IsEnabled reports whether the user has 2FA turned on. An unenrolled user
// (no row) is not enabled.
func (s *Service) IsEnabled(ctx context.Context, userID string) (bool, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return c.Enabled, nil
}

// Verify checks a TOTP or one-time recovery code for a user with 2FA enabled.
// It is rate-limited per user: locked after too many fails, cleared on success.
func (s *Service) Verify(ctx context.Context, userID, code string) (bool, error) {
	locked, err := s.limiter.IsLocked(ctx, userID)
	if err != nil {
		return false, err
	}
	if locked {
		return false, domain.Err2FALocked
	}
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return false, err
	}
	if !c.Enabled {
		return false, domain.Err2FANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return false, err
	}
	if totp.Validate(string(secretPlain), code) {
		_ = s.limiter.Clear(ctx, userID)
		return true, nil
	}
	ids, hashes, err := s.recovery.List(ctx, userID)
	if err != nil {
		return false, err
	}
	if idx, ok := totp.MatchRecovery(code, hashes); ok {
		if err := s.recovery.MarkUsed(ctx, ids[idx]); err != nil {
			return false, err
		}
		_ = s.limiter.Clear(ctx, userID)
		return true, nil
	}
	_ = s.limiter.RegisterFail(ctx, userID)
	return false, nil
}
```

- [ ] **Step 7: Generate mocks**

Run: `cd backend/services/twofa-service && go generate ./internal/service/twofa/...`
Expected: creates `internal/service/twofa/mocks/*_mock.go` for Store, Recovery, Cipher, RateLimiter.

- [ ] **Step 8: Write the failing test** `twofa_test.go` (adapt auth's `service/twofa/twofa_test.go` to the new mocks; add a rate-limit + regenerate case). Minimum cases:

```go
package twofa_test

// TestVerify_TOTPSuccess: enabled cred + cipher.Decrypt returns secret whose
//   totp.Validate(code) is true → returns (true, nil), limiter.Clear called.
// TestVerify_Locked: limiter.IsLocked → true → returns (false, Err2FALocked),
//   store.Get NOT called.
// TestVerify_WrongCode_RegistersFail: totp invalid + no recovery match →
//   (false, nil) and limiter.RegisterFail called once.
// TestVerify_RecoveryFallback: totp invalid, MatchRecovery hits index 0 →
//   MarkUsed(ids[0]) called, returns (true, nil).
// TestRegenerate_RequiresValidCode: invalid code → Err2FAInvalidCode, recovery.Replace NOT called.
// TestSetup_AlreadyEnabled: enabled cred → Err2FAAlreadyEnabled.
```

Write these as table/independent tests using the generated mocks (mirror the assertion style of auth's `twofa_test.go`, which the engineer should open for the exact minimock call syntax, e.g. `mocks.NewStoreMock(t).GetMock.Return(...)`).

- [ ] **Step 9: Run to verify it fails, then passes**

Run: `cd backend/services/twofa-service && go test ./internal/service/twofa/...`
Expected: FAIL before Steps 1-6 are complete; PASS after.

- [ ] **Step 10: Commit**

```bash
git add backend/services/twofa-service/internal/service/twofa
git commit -m "feat(twofa): core service — setup/enable/disable/regenerate/verify with rate-limit"
```

### Task 6: Redis rate-limit store

**Files:**
- Create: `backend/services/twofa-service/internal/ratelimit/store.go`
- Create: `backend/services/twofa-service/internal/ratelimit/store_test.go`

**Interfaces:**
- Consumes: `*redis.Client`, `maxFails int`, `lockTTL time.Duration`.
- Produces: `ratelimit.New(rdb, maxFails, lockTTL) *Store` satisfying `twofa.RateLimiter` — `IsLocked(ctx, userID)`, `RegisterFail(ctx, userID)`, `Clear(ctx, userID)`.

- [ ] **Step 1: Write `store.go`** (mirror auth's session throttle semantics: INCR a per-user counter with a TTL; locked once it reaches maxFails):

```go
// Package ratelimit throttles 2FA verify attempts per user in Redis.
package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type Store struct {
	rdb      *redis.Client
	maxFails int
	lockTTL  time.Duration
}

func New(rdb *redis.Client, maxFails int, lockTTL time.Duration) *Store {
	return &Store{rdb: rdb, maxFails: maxFails, lockTTL: lockTTL}
}

func key(userID string) string { return "2fa_fails:" + userID }

// IsLocked reports whether the user has reached the fail threshold.
func (s *Store) IsLocked(ctx context.Context, userID string) (bool, error) {
	n, err := s.rdb.Get(ctx, key(userID)).Int()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("ratelimit.IsLocked: %w", err)
	}
	return n >= s.maxFails, nil
}

// RegisterFail increments the counter, (re)setting the lockout window.
func (s *Store) RegisterFail(ctx context.Context, userID string) error {
	pipe := s.rdb.TxPipeline()
	incr := pipe.Incr(ctx, key(userID))
	pipe.Expire(ctx, key(userID), s.lockTTL)
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("ratelimit.RegisterFail: %w", err)
	}
	_ = incr
	return nil
}

// Clear resets the counter on a successful verify.
func (s *Store) Clear(ctx context.Context, userID string) error {
	if err := s.rdb.Del(ctx, key(userID)).Err(); err != nil {
		return fmt.Errorf("ratelimit.Clear: %w", err)
	}
	return nil
}
```

- [ ] **Step 2: Write the test** using `miniredis` if auth's session tests use it (check `backend/services/auth-service/internal/session/*_test.go` for the pattern; reuse the same test dependency). Cases:

```go
// TestIsLocked_FalseWhenNoFails
// TestRegisterFail_LocksAtMax: RegisterFail maxFails times → IsLocked true
// TestClear_Unlocks: after lock, Clear → IsLocked false
```

- [ ] **Step 3: Run test**

Run: `cd backend/services/twofa-service && go test ./internal/ratelimit/...`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/services/twofa-service/internal/ratelimit
git commit -m "feat(twofa): redis per-user verify rate-limit"
```

### Task 7: auth-service gRPC client (identity resolution)

**Files:**
- Create: `backend/services/twofa-service/internal/clients/auth/{client.go, resolve.go}`

**Interfaces:**
- Consumes: `authv1` generated client, `grpcutil.Dial` (from `backend/pkg/grpcutil`).
- Produces: `auth.Dial(target) (*auth.Client, error)`, `Close()`, and `Resolve(ctx, token) (userID, username string, err error)` — backed by `auth.GetMe`, which returns the principal (id + username) in one call.

- [ ] **Step 1: Write `client.go`** (mirror `gateway-service/internal/clients/auth/client.go`, targeting the auth service):

```go
// Package auth is twofa-service's gRPC client for auth-service (identity only).
package auth

import (
	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

type Client struct {
	conn *grpc.ClientConn
	cc   authv1.AuthServiceClient
}

func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, cc: authv1.NewAuthServiceClient(conn)}, nil
}

func (c *Client) Close() error { return c.conn.Close() }
```

- [ ] **Step 2: Write `resolve.go`**:

```go
package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// Resolve validates a session token and returns the caller's id + username
// (the username is the otpauth account label used at Setup).
func (c *Client) Resolve(ctx context.Context, token string) (userID, username string, err error) {
	u, err := c.cc.GetMe(ctx, &authv1.GetMeRequest{Token: token})
	if err != nil {
		return "", "", err
	}
	return u.GetId(), u.GetUsername(), nil
}
```

> Confirm the `User` proto field getters: open `backend/proto/rosneft/auth/v1/auth.proto` `message User` — use the actual getter names (`GetId()` / `GetUsername()`; adjust if the fields differ).

- [ ] **Step 3: Build**

Run: `cd backend/services/twofa-service && go build ./internal/clients/...`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add backend/services/twofa-service/internal/clients
git commit -m "feat(twofa): auth-service client for token→identity resolution"
```

### Task 8: gRPC transport + bootstrap wiring (twofa-service serves)

**Files:**
- Create: `backend/services/twofa-service/internal/transport/grpcapi/{server.go, self.go, query.go}`
- Modify: `backend/services/twofa-service/internal/bootstrap/{serve.go, service.go}`

**Interfaces:**
- Consumes: `twofa.Service` (Task 5), `auth.Client.Resolve` (Task 7), stores/limiter/cipher, config.
- Produces: a running gRPC server implementing `twofav1.TwoFAServiceServer`.

- [ ] **Step 1: Write `server.go`** (interfaces + Server + error mapping; mirror auth's `grpcapi/server.go` structure but smaller):

```go
// Package grpcapi exposes twofa-service over gRPC.
package grpcapi

import (
	"context"
	"errors"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
)

// Service is the twofa business surface.
type Service interface {
	Setup(ctx context.Context, userID, accountLabel string) (string, string, error)
	Enable(ctx context.Context, userID, code string) ([]string, error)
	Disable(ctx context.Context, userID, code string) error
	Regenerate(ctx context.Context, userID, code string) ([]string, error)
	IsEnabled(ctx context.Context, userID string) (bool, error)
	Verify(ctx context.Context, userID, code string) (bool, error)
}

// Identity resolves a session token to (userID, username).
type Identity interface {
	Resolve(ctx context.Context, token string) (userID, username string, err error)
}

type Server struct {
	twofav1.UnimplementedTwoFAServiceServer
	svc      Service
	identity Identity
}

func New(svc Service, identity Identity) *Server {
	return &Server{svc: svc, identity: identity}
}

func (s *Server) Register(srv *grpc.Server) { twofav1.RegisterTwoFAServiceServer(srv, s) }

// mapErr converts domain sentinels to gRPC status codes.
func mapErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.Err2FAInvalidCode):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, domain.Err2FALocked):
		return status.Error(codes.ResourceExhausted, err.Error())
	case errors.Is(err, domain.Err2FAAlreadyEnabled), errors.Is(err, domain.Err2FANotEnabled):
		return status.Error(codes.FailedPrecondition, err.Error())
	case errors.Is(err, domain.ErrNotFound):
		return status.Error(codes.NotFound, err.Error())
	default:
		return status.Error(codes.Internal, err.Error())
	}
}
```

- [ ] **Step 2: Write `self.go`** (management RPCs — resolve token → userID via auth, then delegate):

```go
package grpcapi

import (
	"context"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

func (s *Server) Setup(ctx context.Context, req *twofav1.SetupRequest) (*twofav1.SetupResponse, error) {
	uid, label, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	secret, url, err := s.svc.Setup(ctx, uid, label)
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.SetupResponse{Secret: secret, OtpauthUrl: url}, nil
}

func (s *Server) Enable(ctx context.Context, req *twofav1.EnableRequest) (*twofav1.EnableResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	codes, err := s.svc.Enable(ctx, uid, req.GetCode())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.EnableResponse{RecoveryCodes: codes}, nil
}

func (s *Server) Disable(ctx context.Context, req *twofav1.DisableRequest) (*twofav1.DisableResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	if err := s.svc.Disable(ctx, uid, req.GetCode()); err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.DisableResponse{}, nil
}

func (s *Server) RegenerateRecoveryCodes(ctx context.Context, req *twofav1.RegenerateRequest) (*twofav1.RegenerateResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	codes, err := s.svc.Regenerate(ctx, uid, req.GetCode())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.RegenerateResponse{RecoveryCodes: codes}, nil
}
```

- [ ] **Step 3: Write `query.go`** (internal RPCs — trusted user_id from auth-service):

```go
package grpcapi

import (
	"context"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

func (s *Server) IsEnabled(ctx context.Context, req *twofav1.IsEnabledRequest) (*twofav1.IsEnabledResponse, error) {
	on, err := s.svc.IsEnabled(ctx, req.GetUserId())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.IsEnabledResponse{Enabled: on}, nil
}

func (s *Server) Verify(ctx context.Context, req *twofav1.VerifyRequest) (*twofav1.VerifyResponse, error) {
	ok, err := s.svc.Verify(ctx, req.GetUserId(), req.GetCode())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.VerifyResponse{Valid: ok}, nil
}
```

- [ ] **Step 4: Write `bootstrap/service.go`** (wire stores → service → server):

```go
package bootstrap

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/ratelimit"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/secret"
	twofasvc "github.com/vbncursed/rosneft/backend/services/twofa-service/internal/service/twofa"
	credstore "github.com/vbncursed/rosneft/backend/services/twofa-service/internal/storage/credentials"
	recstore "github.com/vbncursed/rosneft/backend/services/twofa-service/internal/storage/recovery"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/transport/grpcapi"
)

// InitService wires storage + auth client → service → gRPC handler.
func InitService(pool *pgxpool.Pool, rdb *redis.Client, cfg config.Config) (*grpcapi.Server, *auth.Client, error) {
	cipher, err := secret.NewCipher(cfg.SecretKey)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: cipher: %w", err)
	}
	authClient, err := auth.Dial(cfg.AuthGRPCAddr)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: dial auth: %w", err)
	}
	creds := credstore.New(pool)
	rec := recstore.New(pool)
	limiter := ratelimit.New(rdb, cfg.VerifyMaxFails, cfg.VerifyLockTTL)
	svc := twofasvc.New(creds, rec, cipher, limiter, cfg.Issuer)
	return grpcapi.New(svc, authClient), authClient, nil
}
```

- [ ] **Step 5: Complete `bootstrap/serve.go`** — replace the Task 2 stubs. Mirror `auth-service/internal/bootstrap/serve.go` (open it): open the pgx pool from `cfg.DBDSN`, run migrations when `cfg.AutoMigrate`, open the redis client at `cfg.RedisAddr` DB `cfg.RedisDB`, call `InitService`, register the server on a `grpc.Server`, listen on `cfg.GRPCAddr`, add the health service, and do graceful shutdown with `cfg.ShutdownTimeout`. `defer authClient.Close()`. Wire `RunMigrateUp/Down/Status` to the migrate runner from Task 4.

- [ ] **Step 6: Build the whole module**

Run: `cd backend/services/twofa-service && go build ./... && go vet ./...`
Expected: builds clean.

- [ ] **Step 7: Commit**

```bash
git add backend/services/twofa-service/internal/transport backend/services/twofa-service/internal/bootstrap
git commit -m "feat(twofa): grpc transport + bootstrap wiring; service now serves :9006"
```

---

## Phase C — auth-service: delegate to twofa, remove local 2FA

### Task 9: Rewire login through a TwoFAVerifier; strip auth's 2FA ownership

**Files:**
- Create: `backend/services/auth-service/internal/clients/twofa/{client.go, verify.go}`
- Modify: `backend/services/auth-service/internal/service/auth/auth.go` (deps), `login.go`, `login_2fa.go`
- Modify: `backend/services/auth-service/internal/bootstrap/service.go` (wire twofa client, drop cipher/recovery)
- Modify: `backend/services/auth-service/internal/config/config.go` + `cmd/auth/main.go` (add `twofa-grpc-addr`; drop `secret-key` requirement)
- Modify: `backend/services/auth-service/internal/transport/grpcapi/{server.go, self.go}` (remove `TwoFASvc` + 2FA handlers)
- Modify: `backend/proto/rosneft/auth/v1/auth.proto` (remove `Setup2FA/Enable2FA/Disable2FA` RPCs + messages; keep `Login/LoginVerify2FA` and `User.totp_enabled` — see note)
- Modify: `backend/services/auth-service/internal/domain/errors.go` (drop `Err2FARequired`)
- Modify: `backend/services/auth-service/internal/domain/user.go`, `storage/users/{models.go,get.go}` (drop `TOTPEnabled/TOTPSecret`); delete `storage/users/set_totp.go`, `service/twofa/`, `totp/`, `secret/`, `storage/recovery/`
- Create: `backend/services/auth-service/internal/migrate/migrations/000NN_drop_totp.sql`

**Interfaces:**
- Consumes: `twofav1` client; twofa-service running at `cfg.TwoFAGRPCAddr`.
- Produces: `auth.Service` login path calling `TwoFAVerifier{ IsEnabled(ctx, userID)(bool,error); Verify(ctx, userID, code)(bool,error) }`.

- [ ] **Step 1: Write the twofa client in auth-service**

`internal/clients/twofa/client.go` (mirror the gateway auth client dial):

```go
// Package twofa is auth-service's gRPC client for twofa-service.
package twofa

import (
	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

type Client struct {
	conn *grpc.ClientConn
	cc   twofav1.TwoFAServiceClient
}

func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, cc: twofav1.NewTwoFAServiceClient(conn)}, nil
}

func (c *Client) Close() error { return c.conn.Close() }
```

`internal/clients/twofa/verify.go`:

```go
package twofa

import (
	"context"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

func (c *Client) IsEnabled(ctx context.Context, userID string) (bool, error) {
	resp, err := c.cc.IsEnabled(ctx, &twofav1.IsEnabledRequest{UserId: userID})
	if err != nil {
		return false, err
	}
	return resp.GetEnabled(), nil
}

func (c *Client) Verify(ctx context.Context, userID, code string) (bool, error) {
	resp, err := c.cc.Verify(ctx, &twofav1.VerifyRequest{UserId: userID, Code: code})
	if err != nil {
		return false, err
	}
	return resp.GetValid(), nil
}
```

- [ ] **Step 2: Change auth login Service deps** — in `service/auth/auth.go`: remove the `RecoveryStore` and `Decryptor` interfaces + fields; add:

```go
// TwoFAVerifier delegates 2FA checks to twofa-service.
type TwoFAVerifier interface {
	IsEnabled(ctx context.Context, userID string) (bool, error)
	Verify(ctx context.Context, userID, code string) (bool, error)
}
```

Change the struct + `New`:

```go
type Service struct {
	users       UserStore
	sessions    SessionStore
	twofa       TwoFAVerifier
	absoluteTTL time.Duration
	authz       *authzCache
}

func New(users UserStore, sessions SessionStore, twofa TwoFAVerifier, absoluteTTL time.Duration) *Service {
	// ... set fields; keep the existing authz cache init ...
}
```

Update the `//go:generate minimock` line: `-i UserStore,SessionStore,TwoFAVerifier` (drop RecoveryStore, Decryptor). Regenerate mocks: `go generate ./internal/service/auth/...`.

- [ ] **Step 3: Rewire `login.go`** — replace the `if u.TOTPEnabled {` block:

```go
	enabled, err := s.twofa.IsEnabled(ctx, u.ID)
	if err != nil {
		return "", "", err
	}
	if enabled {
		challenge, err := s.sessions.PutPending(ctx, u.ID)
		if err != nil {
			return "", "", err
		}
		return "", challenge, nil
	}
	token, err := s.issue(ctx, u)
	return token, "", err
```

- [ ] **Step 4: Rewrite `login_2fa.go`** — delegate the whole verify to twofa:

```go
package auth

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// LoginVerify2FA consumes a challenge + code, issuing a session on success.
func (s *Service) LoginVerify2FA(ctx context.Context, challenge, code string) (string, error) {
	if challenge == "" || code == "" {
		return "", fmt.Errorf("auth.LoginVerify2FA: %w: challenge and code required", domain.ErrInvalidInput)
	}
	userID, err := s.sessions.TakePending(ctx, challenge)
	if err != nil {
		return "", err
	}
	ok, err := s.twofa.Verify(ctx, userID, code)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", domain.Err2FAInvalidCode
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", err
	}
	return s.issue(ctx, u)
}
```

- [ ] **Step 5: Update the failing login test** — `service/auth/login_test.go` and `login_2fa` tests now use the `TwoFAVerifier` mock instead of recovery/cipher. Adjust: 2FA-on case stubs `TwoFAVerifier.IsEnabledMock.Return(true, nil)` and asserts a challenge; verify-success case stubs `VerifyMock.Return(true, nil)`.

Run: `cd backend/services/auth-service && go test ./internal/service/auth/...`
Expected: FAIL until the code above compiles, then PASS.

- [ ] **Step 6: Remove auth's 2FA transport + proto** — in `grpcapi/server.go` delete the `TwoFASvc` interface, the `twofa` field, and the `New` param; update `bootstrap` accordingly. Delete the `Setup2FA/Enable2FA/Disable2FA` methods from `grpcapi/self.go`. In `auth.proto`, delete the three `rpc *2FA` lines and their request/response messages, **keep** `Login`, `LoginVerify2FA`, and `User.totp_enabled` (see note in Step 8). Regenerate: `cd backend/proto && buf generate`.

- [ ] **Step 7: Update auth bootstrap + config**

`bootstrap/service.go`: dial the twofa client (`twofaClient, err := twofaclient.Dial(cfg.TwoFAGRPCAddr)`), pass it to `authsvc.New(us, sess, twofaClient, cfg.SessionAbsoluteTTL)`, drop `secret.NewCipher`, `recstore`, and the `twofasvc`/`twoS` wiring and the `twofa` arg to `grpcapi.New`. Return the twofa client so `serve.go` can `Close` it.
`config.go`: add `TwoFAGRPCAddr string \`mapstructure:"twofa-grpc-addr"\`` with default `twofa:9006`; **remove** the `SecretKey` requirement from `Validate` (auth no longer encrypts). Keep the `secret-key` flag as a harmless no-op or remove it from `main.go`. Add the `twofa-grpc-addr` flag to `main.go`.

- [ ] **Step 8: Drop the totp columns from auth's schema + domain**

- Add migration `internal/migrate/migrations/<next-seq>_drop_totp.sql`:
```sql
-- +goose Up
ALTER TABLE users DROP COLUMN totp_enabled;
ALTER TABLE users DROP COLUMN totp_secret;
DROP TABLE recovery_codes;

-- +goose Down
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN totp_secret BYTEA;
CREATE TABLE recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at TIMESTAMPTZ
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id);
```
- Remove `TOTPEnabled`/`TOTPSecret` from `domain.User`, from `storage/users/models.go` (`userColumns`), and from `scanUser` in `storage/users/get.go`.
- Delete files: `service/twofa/`, `totp/`, `secret/`, `storage/recovery/`, `storage/users/set_totp.go`, and drop `domain.Err2FARequired` from `domain/errors.go` (and its mapping in `grpcapi/server.go` `statusByCode`).

> **Note on `User.totp_enabled`:** the frontend account page shows the 2FA on/off state. After this task auth no longer knows it. Task 10 fills `totpEnabled` in the gateway user DTO via `twofa.IsEnabled`. Keep the `totp_enabled` field in the `auth.proto` `User` message for now (auth just always returns false); the authoritative value comes from the gateway compose. Removing the proto field is out of scope.

- [ ] **Step 9: Build + test the whole auth module**

Run:
```bash
cd backend/services/auth-service && go build ./... && go test ./...
```
Expected: builds and passes (no references to removed packages remain).

- [ ] **Step 10: Commit**

```bash
git add backend/services/auth-service backend/proto/rosneft/auth backend/proto/gen
git commit -m "refactor(auth): delegate 2FA to twofa-service; drop local totp ownership"
```

---

## Phase D — gateway + deploy

### Task 10: Gateway twofa client, re-pointed handlers, totpEnabled compose, OpenAPI, compose

**Files:**
- Create: `backend/services/gateway-service/internal/clients/twofa/{client.go, twofa.go}`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/handlers.go` (setup/enable/disable → twofa; add regenerate route)
- Modify: `backend/services/gateway-service/internal/transport/authhttp/dto.go` + the `me` handler (fill `totpEnabled` via twofa)
- Modify: `backend/services/gateway-service/internal/bootstrap/{twofa.go(new), serve.go}` + config (`TwoFAGRPCAddr`)
- Modify: `backend/services/gateway-service/api/openapi.yaml` (add regenerate path) + regenerate stubs
- Modify: `docker-compose.yml` (add `twofa` service; add addrs to `auth` + `gateway`)

**Interfaces:**
- Consumes: `twofav1` client.
- Produces: gateway `twofa.Client` with `Setup(token)`, `Enable(token,code)`, `Disable(token,code)`, `Regenerate(token,code)`, `IsEnabled(userID)`.

- [ ] **Step 1: Gateway twofa client** — `clients/twofa/client.go` (mirror the auth client dial, `twofav1.NewTwoFAServiceClient`) and `clients/twofa/twofa.go`:

```go
package twofa

import (
	"context"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

func (c *Client) Setup(ctx context.Context, token string) (secret, url string, err error) {
	resp, err := c.cc.Setup(ctx, &twofav1.SetupRequest{Token: token})
	if err != nil {
		return "", "", err
	}
	return resp.GetSecret(), resp.GetOtpauthUrl(), nil
}

func (c *Client) Enable(ctx context.Context, token, code string) ([]string, error) {
	resp, err := c.cc.Enable(ctx, &twofav1.EnableRequest{Token: token, Code: code})
	if err != nil {
		return nil, err
	}
	return resp.GetRecoveryCodes(), nil
}

func (c *Client) Disable(ctx context.Context, token, code string) error {
	_, err := c.cc.Disable(ctx, &twofav1.DisableRequest{Token: token, Code: code})
	return err
}

func (c *Client) Regenerate(ctx context.Context, token, code string) ([]string, error) {
	resp, err := c.cc.RegenerateRecoveryCodes(ctx, &twofav1.RegenerateRequest{Token: token, Code: code})
	if err != nil {
		return nil, err
	}
	return resp.GetRecoveryCodes(), nil
}

func (c *Client) IsEnabled(ctx context.Context, userID string) (bool, error) {
	resp, err := c.cc.IsEnabled(ctx, &twofav1.IsEnabledRequest{UserId: userID})
	if err != nil {
		return false, err
	}
	return resp.GetEnabled(), nil
}
```

- [ ] **Step 2: Give the auth Handlers a twofa client** — in `authhttp/handlers.go`, add a `twofa *twofa.Client` field to `Handlers` and a param to `New`. Re-point the three handlers to it and add a regenerate handler:

```go
func (h *Handlers) setup2FA(w http.ResponseWriter, r *http.Request) {
	secret, url, err := h.twofa.Setup(r.Context(), bearer(r))
	if err != nil { fail(w, err); return }
	writeJSON(w, http.StatusOK, map[string]any{"secret": secret, "otpauthUrl": url})
}

func (h *Handlers) enable2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ Code string }
	if !decode(w, r, &req) { return }
	codes, err := h.twofa.Enable(r.Context(), bearer(r), req.Code)
	if err != nil { fail(w, err); return }
	writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes})
}

func (h *Handlers) disable2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ Code string }
	if !decode(w, r, &req) { return }
	if err := h.twofa.Disable(r.Context(), bearer(r), req.Code); err != nil { fail(w, err); return }
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) regenerate2FA(w http.ResponseWriter, r *http.Request) {
	var req struct{ Code string }
	if !decode(w, r, &req) { return }
	codes, err := h.twofa.Regenerate(r.Context(), bearer(r), req.Code)
	if err != nil { fail(w, err); return }
	writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes})
}
```

In `Mount`, add under the authenticated group:

```go
			pr.Post("/2fa/recovery/regenerate", h.regenerate2FA)
```

- [ ] **Step 3: Fill `totpEnabled` in the `me` response** — the `me` handler currently maps the auth `User`. After Task 9 auth returns `totp_enabled=false` always. Change `me` to overlay the twofa value:

```go
func (h *Handlers) me(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.GetMe(r.Context(), bearer(r))
	if err != nil { fail(w, err); return }
	out := userToJSON(u)
	if on, err := h.twofa.IsEnabled(r.Context(), u.GetId()); err == nil {
		out["totpEnabled"] = on
	}
	writeJSON(w, http.StatusOK, out)
}
```

> If `userToJSON` returns a typed struct rather than a map, add a `TOTPEnabled` field set from the twofa call instead. Open `authhttp/dto.go` to match the existing shape.

- [ ] **Step 4: Wire the client in bootstrap** — add `bootstrap/twofa.go` (`InitTwoFA(cfg) (*twofa.Client, error)` → `twofa.Dial(cfg.TwoFAGRPCAddr)`), add `TwoFAGRPCAddr` to gateway `config` (default `twofa:9006`, env `GATEWAY_TWOFA_GRPC_ADDR`), and in `serve.go` init it, `defer twofaClient.Close()`, and pass it into `authhttp.New(authClient, twofaClient, logger)`.

- [ ] **Step 5: OpenAPI** — in `openapi.yaml` add the `POST /api/auth/2fa/recovery/regenerate` path (request `{code}`, response `{recoveryCodes: string[]}` — reuse the `Enable2FAResponse` schema shape). Regenerate stubs: `cd backend && make openapi-gen`.

- [ ] **Step 6: docker-compose** — add a `twofa` service block (copy the `auth` block; `dockerfile: services/twofa-service/Dockerfile`, `expose: ["9006"]`, `depends_on` postgres+redis) with env:

```yaml
      TWOFA_GRPC_ADDR: ":9006"
      TWOFA_DB_DSN: "postgres://andrey:andrey@postgres:5432/andrey?sslmode=disable"
      TWOFA_REDIS_ADDR: "redis:6379"
      TWOFA_REDIS_DB: "2"
      TWOFA_SECRET_KEY: "0000000000000000000000000000000000000000000000000000000000000000"
      TWOFA_ISSUER: "Andrey"
      TWOFA_AUTH_GRPC_ADDR: "auth:9004"
      TWOFA_LOG_LEVEL: "info"
```

Add to the `auth` service env: `AUTH_TWOFA_GRPC_ADDR: "twofa:9006"`. Add to the `gateway` service env: `GATEWAY_TWOFA_GRPC_ADDR: "twofa:9006"`. Note in a comment that `TWOFA_SECRET_KEY` must equal `AUTH_SECRET_KEY` in prod.

- [ ] **Step 7: Build the backend**

Run: `cd backend && go build ./... && go vet ./services/gateway-service/...`
Expected: builds clean.

- [ ] **Step 8: Commit**

```bash
git add backend/services/gateway-service backend/proto/gen docker-compose.yml
git commit -m "feat(gateway): route 2fa to twofa-service; add recovery regenerate; compose"
```

---

## Phase E — frontend

### Task 11: Recovery-code regeneration UI

**Files:**
- Modify: `frontend/src/auth/infrastructure/auth-gateway.ts` (add `regenerateRecoveryCodes`)
- Create: `frontend/src/app/api/auth/2fa/recovery/regenerate/route.ts` (proxy)
- Modify: `frontend/src/auth/presentation/account/two-factor-section.tsx` (add the action)

**Interfaces:**
- Consumes: gateway `POST /api/auth/2fa/recovery/regenerate {code} → {recoveryCodes}`.
- Produces: `authGateway.regenerateRecoveryCodes(code) => Promise<string[]>`.

- [ ] **Step 1: Add the route proxy** — mirror `frontend/src/app/api/auth/login/2fa/route.ts` for auth-forwarding shape, but this is an authenticated call: mirror an existing authenticated 2FA proxy (e.g. the enable/disable route the account page already uses — open `two-factor-section.tsx` / `auth-gateway.ts` to see how enable posts). Create `frontend/src/app/api/auth/2fa/recovery/regenerate/route.ts` forwarding the bearer session cookie to the gateway `/api/auth/2fa/recovery/regenerate` and returning `{recoveryCodes}`.

- [ ] **Step 2: Add the gateway adapter method** — in `auth-gateway.ts`, next to `enable2FA`:

```ts
async regenerateRecoveryCodes(code: string): Promise<string[]> {
  const res = await this.post("/api/auth/2fa/recovery/regenerate", { code });
  return res.recoveryCodes as string[];
}
```

(Match the file's existing `post` helper + return-mapping style — open it and copy the shape of `enable2FA`.)

- [ ] **Step 3: Add the UI action** — in `two-factor-section.tsx`, in the enabled (`idle` with `initiallyEnabled`) state, add a "Regenerate recovery codes" button that prompts for a current TOTP code, calls `regenerateRecoveryCodes(code)`, and renders the returned codes via the existing `recovery-codes.tsx` component (reuse the same `codes` display state used by `enable`). Keep the file under 200 lines — if it would exceed, extract the regenerate flow into a small sibling component.

- [ ] **Step 4: Lint + build**

Run: `cd frontend && yarn lint && yarn build`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth frontend/src/app/api/auth/2fa
git commit -m "feat(account): regenerate 2FA recovery codes"
```

---

## Final verification

- [ ] **Backend:** `cd backend && go build ./... && go test ./...` — all green.
- [ ] **Frontend:** `cd frontend && yarn lint && yarn build` — green.
- [ ] **End-to-end (docker-compose):** `docker compose up -d --build`, then:
  1. Log in as the bootstrap admin → no 2FA → session issued.
  2. Account → enable 2FA (scan QR / enter secret), confirm code → recovery codes shown.
  3. Log out, log in → prompted for 2FA → enter TOTP → session issued.
  4. Log out, log in → enter a recovery code → session issued (code now single-use).
  5. Enter a wrong code 5×→ locked (ResourceExhausted / 429-mapped error).
  6. Account → regenerate recovery codes (with a valid TOTP) → new set shown, old invalid.
  7. Account → disable 2FA (with a valid TOTP) → next login skips 2FA.
- [ ] Use the `superpowers:verification-before-completion` skill before claiming done.
```
