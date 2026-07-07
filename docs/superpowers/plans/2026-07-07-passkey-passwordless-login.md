# Passkey Passwordless Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add usernameless passkey (WebAuthn) sign-in as a passwordless primary login, plus passkey enrollment on the account page, with password kept as fallback.

**Architecture:** A new `passkey-service` (mirrors `twofa-service`) owns WebAuthn credentials (Postgres) and ceremonies (crypto), and NEVER mints a session. `auth-service` orchestrates passkey login exactly as it does `LoginVerify2FA`: it calls passkey-service to verify the assertion, gets a verified `user_id`, checks account status, and mints the session. The gateway exposes `/api/auth/passkey/*`; register/list/delete are authenticated (call passkey directly, mirroring 2FA), login begin/finish are public (call auth). The Next.js frontend adds a "Sign in with passkey" button and a Passkeys account section using `@github/webauthn-json`.

**Tech Stack:** Go 1.26 (pgx v5, goose, grpc, cobra/viper), `github.com/go-webauthn/webauthn`; Next.js 16 / React 19 / TypeScript / Tailwind v4; `@github/webauthn-json`.

## Global Constraints

- **Module path:** `github.com/vbncursed/rosneft/backend/services/passkey-service`; `go 1.26.4`; two `replace` directives → `../../pkg`, `../../proto`.
- **Backend layering (hard):** `cmd/<name>/main.go` → `internal/bootstrap` (one `Init*` per file) → `internal/config` (viper, flag>env>default, prefix `PASSKEY_`) → `internal/service/<name>` (interfaces+constructor in one file, one method per file) → `internal/storage/<x>` (pgxpool `Store`+`New`) → `internal/transport/grpcapi` (`server.go` = dep interfaces + `Server` + `Register` + central `mapErr`; one handler file per group) → `internal/clients/auth`.
- **200-line file cap** (ESLint on frontend; convention on backend). Split when a file approaches it.
- **DB:** ONE shared `andrey` database. `PASSKEY_DB_DSN="postgres://andrey:andrey@postgres:5432/andrey?sslmode=disable"`. Isolate via `goose.SetTableName("passkey_goose_db_version")` and `passkey_`-prefixed tables. No cross-context FK to `users`.
- **gRPC:** internal only, `expose:` not `ports:`, no per-service healthcheck/networks. Port **9008**. Bearer token forwarded as a proto `string token = 1` request field (NOT gRPC metadata).
- **Redis:** shared `redis:6379`, `PASSKEY_REDIS_DB=3`.
- **WebAuthn RP config:** `PASSKEY_RP_ID` = `andrey.vbncursed.fun` (prod) / `localhost` (dev); `PASSKEY_RP_ORIGINS` = `https://andrey.vbncursed.fun` (prod) / `http://localhost:3000` (dev); `PASSKEY_RP_NAME` = `Andrey`.
- **Brand:** displayed text uses "Andrey", never "Rosneft"/"Роснефть".
- **Passkey login skips TOTP** by design (passkey UV is already MFA).
- **openapi paths** for passkey use `tags: [auth]` so they stay in `exclude-tags` and are hand-served in `authhttp`.
- **Codegen:** proto via `cd backend/proto && buf generate` (Makefile `make proto-gen`); gateway spec via `make openapi-gen`.
- **New dependencies (only these):** backend `github.com/go-webauthn/webauthn`; frontend `@github/webauthn-json`.

**Mirror convention used below:** where a file is a mechanical copy of an existing one, the step says *"Copy `<path>` verbatim, substitute `twofa`→`passkey`, `TWOFA`→`PASSKEY`, `TwoFA`→`Passkey`, port `9006`→`9008`"* plus any listed deltas. Open the named source file; do not invent. Full code is given only for genuinely new logic.

---

## Phase 0 — Contracts (proto + codegen)

### Task 0.1: Define passkey.proto and extend auth.proto

**Files:**
- Create: `backend/proto/rosneft/passkey/v1/passkey.proto`
- Modify: `backend/proto/rosneft/auth/v1/auth.proto` (add 2 RPCs + 4 messages)

**Interfaces produced:** `passkeyv1.PasskeyServiceClient/Server` with `BeginRegistration/FinishRegistration/ListCredentials/DeleteCredential/BeginLogin/FinishLogin`; `authv1` gains `PasskeyLoginBegin/PasskeyLoginFinish`.

- [ ] **Step 1: Write `passkey.proto`** (mirror twofa.proto's management/internal split)

```proto
syntax = "proto3";

package rosneft.passkey.v1;

option go_package = "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1;passkeyv1";

// PasskeyService owns WebAuthn credentials + ceremonies. It NEVER mints a
// session. The gateway calls the management RPCs (token-authenticated, resolved
// via auth.GetMe). auth-service calls the login RPCs during passwordless login;
// FinishLogin returns a VERIFIED user id, and auth mints the session.
service PasskeyService {
  // Management surface (gateway-called, token-authenticated).
  rpc BeginRegistration(BeginRegistrationRequest) returns (BeginRegistrationResponse);
  rpc FinishRegistration(FinishRegistrationRequest) returns (FinishRegistrationResponse);
  rpc ListCredentials(ListCredentialsRequest) returns (ListCredentialsResponse);
  rpc DeleteCredential(DeleteCredentialRequest) returns (DeleteCredentialResponse);

  // Internal surface (auth-service-called during login; no token).
  rpc BeginLogin(BeginLoginRequest) returns (BeginLoginResponse);
  rpc FinishLogin(FinishLoginRequest) returns (FinishLoginResponse);
}

// options_json is the raw PublicKeyCredentialCreationOptions/RequestOptions
// JSON the browser feeds to navigator.credentials. flow_id keys the stashed
// ceremony state (challenge) in Redis.
message BeginRegistrationRequest { string token = 1; }
message BeginRegistrationResponse {
  string options_json = 1;
  string flow_id = 2;
}
message FinishRegistrationRequest {
  string token = 1;
  string flow_id = 2;
  string credential_json = 3; // navigator.credentials.create() result, JSON
  string name = 4;            // user-supplied label, e.g. "MacBook Touch ID"
}
message FinishRegistrationResponse { Credential credential = 1; }

message ListCredentialsRequest { string token = 1; }
message ListCredentialsResponse { repeated Credential credentials = 1; }

message DeleteCredentialRequest {
  string token = 1;
  string credential_id = 2; // base64url credential id
}
message DeleteCredentialResponse {}

message BeginLoginRequest {}
message BeginLoginResponse {
  string options_json = 1;
  string flow_id = 2;
}
message FinishLoginRequest {
  string flow_id = 1;
  string assertion_json = 2; // navigator.credentials.get() result, JSON
}
message FinishLoginResponse { string user_id = 1; } // verified; NOT a session

message Credential {
  string id = 1;          // base64url credential id
  string name = 2;
  string created_at = 3;  // RFC3339
  string last_used_at = 4; // RFC3339, empty if never used
}
```

- [ ] **Step 2: Extend `auth.proto`** — add to `service AuthService` under the `--- session / login ---` block:

```proto
  rpc PasskeyLoginBegin(PasskeyLoginBeginRequest) returns (PasskeyLoginBeginResponse);
  rpc PasskeyLoginFinish(PasskeyLoginFinishRequest) returns (LoginResponse);
```

and add the messages near `LoginVerify2FARequest`:

```proto
message PasskeyLoginBeginRequest {}
message PasskeyLoginBeginResponse {
  string options_json = 1;
  string flow_id = 2;
}
message PasskeyLoginFinishRequest {
  string flow_id = 1;
  string assertion_json = 2;
}
```

(`PasskeyLoginFinish` returns the existing `LoginResponse`; only its `token` field is set.)

- [ ] **Step 3: Regenerate + verify**

Run: `cd backend && make proto-gen`
Expected: creates `backend/proto/gen/go/rosneft/passkey/v1/{passkey.pb.go,passkey_grpc.pb.go}` and updates `auth` gen files. Then:
Run: `cd backend/proto && go build ./...`
Expected: PASS (generated code compiles).

- [ ] **Step 4: Commit**

```bash
git add backend/proto/rosneft/passkey backend/proto/rosneft/auth backend/proto/gen/go/rosneft/passkey backend/proto/gen/go/rosneft/auth
git commit -m "feat(proto): passkey service contract + auth passkey-login RPCs"
```

---

## Phase 1 — passkey-service

> Scaffolding tasks copy `twofa-service` files verbatim with the substitution rule. Only WebAuthn logic, the credentials store, and the ceremony store carry full new code.

### Task 1.1: Service skeleton (boots, migrates, serves health)

**Files (create, all under `backend/services/passkey-service/`):**
- `go.mod` — copy twofa's, change module path to `.../passkey-service`, drop `github.com/pquerna/otp` and `github.com/boombuler/barcode`, add `github.com/go-webauthn/webauthn`.
- `cmd/passkey/main.go` — copy `cmd/twofa/main.go`; substitute; flags delta: **remove** `--secret-key`, `--issuer`, `--verify-max-fails`, `--verify-lock-ttl`; **add** `--rp-id` (""), `--rp-origins` ([]string), `--rp-name` ("Andrey"), `--ceremony-ttl` (5m); keep `--redis-db` default `3`, `--grpc-addr` default `:9008`, `--auth-grpc-addr` default `auth:9004`.
- `internal/config/config.go` — copy twofa's; prefix `PASSKEY`; Config fields: `GRPCAddr, DBDSN, RedisAddr, RedisDB, RPID, RPOrigins []string, RPName, CeremonyTTL time.Duration, AuthGRPCAddr, LogLevel, LogFormat, AutoMigrate, ShutdownTimeout`. `Validate()` requires `DBDSN`, `RPID`, and `len(RPOrigins) > 0`.
- `internal/bootstrap/{logger,postgres,redis,migrate}.go` — copy verbatim, substitute.
- `internal/migrate/{migrate,up,down,status}.go` — copy verbatim, substitute; in `migrate.go` set `goose.SetTableName("passkey_goose_db_version")`.
- `internal/migrate/migrations/00001_init.sql` — new (below).
- `Dockerfile` — copy `services/twofa-service/Dockerfile`, substitute `twofa`→`passkey`.

- [ ] **Step 1: Write `00001_init.sql`**

```sql
-- +goose Up
-- passkey-service owns WebAuthn credentials; user_id is auth's id (no FK).
CREATE TABLE passkey_credentials (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        TEXT NOT NULL,
    credential_id  BYTEA NOT NULL UNIQUE,
    public_key     BYTEA NOT NULL,
    sign_count     BIGINT NOT NULL DEFAULT 0,
    transports     TEXT NOT NULL DEFAULT '',   -- comma-joined
    aaguid         BYTEA,
    name           TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at   TIMESTAMPTZ
);
CREATE INDEX passkey_credentials_user_idx ON passkey_credentials (user_id);

-- +goose Down
DROP TABLE passkey_credentials;
```

- [ ] **Step 2: Create the rest by copy/substitute** (main, config, bootstrap logger/postgres/redis/migrate, migrate runners, Dockerfile, go.mod) per the Files list.

- [ ] **Step 3: Tidy + build**

Run: `cd backend/services/passkey-service && go mod tidy && go build ./...`
Expected: FAIL — `bootstrap.RunServe`, `InitService`, `InitGRPCServer` undefined (added in 1.6). This task's deliverable is the compiling skeleton MINUS serve wiring; verify the migrate + config packages compile:
Run: `go build ./internal/config/... ./internal/migrate/... ./cmd/... 2>&1 | head`
Expected: `cmd` fails only on missing `bootstrap.RunServe`; config + migrate PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/services/passkey-service
git commit -m "feat(passkey): service skeleton, config, migrations"
```

### Task 1.2: Domain + credentials store (pgxpool)

**Files:**
- Create: `internal/domain/{credential.go,errors.go}`
- Create: `internal/storage/credentials/store.go`
- Test: `internal/storage/credentials/store_test.go` (optional integration; unit-test the mapping helpers instead — see note)

**Interfaces produced:** `domain.Credential`; `credentials.Store` with `Create/ListByUser/GetByCredentialID/DeleteByCredentialID/TouchLastUsed/UpdateSignCount`.

- [ ] **Step 1: `internal/domain/credential.go`**

```go
// Package domain holds passkey-service value types and sentinel errors.
package domain

import "time"

// Credential is one stored WebAuthn public-key credential.
type Credential struct {
	ID           string // uuid
	UserID       string
	CredentialID []byte
	PublicKey    []byte
	SignCount    uint32
	Transports   []string
	AAGUID       []byte
	Name         string
	CreatedAt    time.Time
	LastUsedAt   *time.Time
}
```

- [ ] **Step 2: `internal/domain/errors.go`**

```go
package domain

import "errors"

// Sentinel errors propagated across layers; transport maps each to a gRPC code.
var (
	ErrNotFound         = errors.New("passkey credential not found")
	ErrCeremonyExpired  = errors.New("passkey ceremony expired or unknown")
	ErrAssertionInvalid = errors.New("passkey assertion invalid")
	ErrNoCredentials    = errors.New("no passkeys enrolled")
)
```

- [ ] **Step 3: `internal/storage/credentials/store.go`** (mirror twofa `credentials/store.go` pgxpool idiom)

```go
// Package credentials is the PostgreSQL store for WebAuthn credentials.
package credentials

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Create inserts a new credential.
func (s *Store) Create(ctx context.Context, c domain.Credential) error {
	const q = `INSERT INTO passkey_credentials
		(user_id, credential_id, public_key, sign_count, transports, aaguid, name)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`
	_, err := s.pool.Exec(ctx, q, c.UserID, c.CredentialID, c.PublicKey,
		int64(c.SignCount), strings.Join(c.Transports, ","), c.AAGUID, c.Name)
	if err != nil {
		return fmt.Errorf("credentials.Create: %w", err)
	}
	return nil
}

// ListByUser returns all of a user's credentials, newest first.
func (s *Store) ListByUser(ctx context.Context, userID string) ([]domain.Credential, error) {
	const q = `SELECT id, user_id, credential_id, public_key, sign_count, transports, aaguid, name, created_at, last_used_at
		FROM passkey_credentials WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("credentials.ListByUser: %w", err)
	}
	defer rows.Close()
	var out []domain.Credential
	for rows.Next() {
		c, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetByCredentialID looks a credential up by its raw WebAuthn credential id.
func (s *Store) GetByCredentialID(ctx context.Context, credID []byte) (domain.Credential, error) {
	const q = `SELECT id, user_id, credential_id, public_key, sign_count, transports, aaguid, name, created_at, last_used_at
		FROM passkey_credentials WHERE credential_id = $1`
	c, err := scan(s.pool.QueryRow(ctx, q, credID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Credential{}, domain.ErrNotFound
		}
		return domain.Credential{}, fmt.Errorf("credentials.GetByCredentialID: %w", err)
	}
	return c, nil
}

// DeleteByCredentialID removes a credential scoped to its owner (defence in
// depth: a user can only delete their own).
func (s *Store) DeleteByCredentialID(ctx context.Context, userID string, credID []byte) error {
	const q = `DELETE FROM passkey_credentials WHERE user_id = $1 AND credential_id = $2`
	tag, err := s.pool.Exec(ctx, q, userID, credID)
	if err != nil {
		return fmt.Errorf("credentials.DeleteByCredentialID: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// UpdateSignCount + TouchLastUsed persist post-assertion state.
func (s *Store) UpdateSignCount(ctx context.Context, credID []byte, count uint32) error {
	const q = `UPDATE passkey_credentials SET sign_count = $2, last_used_at = now() WHERE credential_id = $1`
	if _, err := s.pool.Exec(ctx, q, credID, int64(count)); err != nil {
		return fmt.Errorf("credentials.UpdateSignCount: %w", err)
	}
	return nil
}

type scanner interface{ Scan(dst ...any) error }

func scan(r scanner) (domain.Credential, error) {
	var (
		c          domain.Credential
		signCount  int64
		transports string
		lastUsed   *time.Time
	)
	if err := r.Scan(&c.ID, &c.UserID, &c.CredentialID, &c.PublicKey, &signCount,
		&transports, &c.AAGUID, &c.Name, &c.CreatedAt, &lastUsed); err != nil {
		return domain.Credential{}, err
	}
	c.SignCount = uint32(signCount)
	if transports != "" {
		c.Transports = strings.Split(transports, ",")
	}
	c.LastUsedAt = lastUsed
	return c, nil
}
```

- [ ] **Step 4: Build**

Run: `cd backend/services/passkey-service && go build ./internal/domain/... ./internal/storage/...`
Expected: PASS.

Note: DB round-trips are integration-tested via the running stack in Task 4.2's smoke test; no mock DB here (matches twofa, which has no store unit tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/passkey-service/internal/domain backend/services/passkey-service/internal/storage
git commit -m "feat(passkey): domain types + credentials store"
```

### Task 1.3: WebAuthn engine + ceremony store

**Files:**
- Create: `internal/webauthn/engine.go` (wraps `github.com/go-webauthn/webauthn`)
- Create: `internal/webauthn/user.go` (the `webauthn.User` adapter over stored credentials)
- Create: `internal/ceremony/store.go` (Redis stash of `*webauthn.SessionData` by flow-id)
- Test: `internal/webauthn/user_test.go`

**Interfaces produced:** `webauthn.Engine` (thin wrapper exposing `BeginRegistration/CreateCredential/BeginDiscoverableLogin/FinishDiscoverableLogin`), `webauthn.NewUser(id string, creds []domain.Credential)`, `ceremony.Store` with `Put(ctx, data)→flowID` / `Take(ctx, flowID)→data`.

> **Before coding:** open the installed go-webauthn docs/godoc to confirm exact signatures for the pinned version (`go doc github.com/go-webauthn/webauthn/webauthn`), per the repo's "check docs before writing" rule. The API below matches go-webauthn v0.11–v0.13.

- [ ] **Step 1: `internal/webauthn/user.go`** — adapter mapping our domain credential ↔ the library's `webauthn.Credential` and `webauthn.User`.

```go
// Package webauthn adapts github.com/go-webauthn/webauthn to passkey-service's
// domain types.
package webauthn

import (
	lib "github.com/go-webauthn/webauthn/webauthn"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// User is the go-webauthn User implementation. WebAuthnID is the user handle
// stored in the resident credential — we use the raw auth user id bytes so
// discoverable login can recover the user from the assertion's userHandle.
type User struct {
	id    string
	name  string // username/display shown in the authenticator picker
	creds []lib.Credential
}

// NewUser builds a User from the auth user id, a display name, and stored creds.
func NewUser(id, name string, stored []domain.Credential) *User {
	u := &User{id: id, name: name}
	for _, c := range stored {
		u.creds = append(u.creds, toLib(c))
	}
	return u
}

func (u *User) WebAuthnID() []byte                 { return []byte(u.id) }
func (u *User) WebAuthnName() string               { return u.name }
func (u *User) WebAuthnDisplayName() string        { return u.name }
func (u *User) WebAuthnCredentials() []lib.Credential { return u.creds }

func toLib(c domain.Credential) lib.Credential {
	return lib.Credential{
		ID:        c.CredentialID,
		PublicKey: c.PublicKey,
		Authenticator: lib.Authenticator{
			AAGUID:    c.AAGUID,
			SignCount: c.SignCount,
		},
		Transport: toTransports(c.Transports),
	}
}

func toTransports(in []string) []protocolTransport {
	out := make([]protocolTransport, 0, len(in))
	for _, t := range in {
		out = append(out, protocolTransport(t))
	}
	return out
}
```

Note: `protocolTransport` is `protocol.AuthenticatorTransport` — import `github.com/go-webauthn/webauthn/protocol` and alias it (`type protocolTransport = protocol.AuthenticatorTransport`) or inline the type. Confirm the field name (`Transport` vs `Transports`) against the pinned version.

- [ ] **Step 2: `internal/webauthn/engine.go`**

```go
package webauthn

import (
	"fmt"
	"io"

	lib "github.com/go-webauthn/webauthn/webauthn"
	"github.com/go-webauthn/webauthn/protocol"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// Engine wraps a configured *webauthn.WebAuthn.
type Engine struct{ w *lib.WebAuthn }

// NewEngine builds the WebAuthn relying party from RP config.
func NewEngine(rpID, rpName string, origins []string) (*Engine, error) {
	w, err := lib.New(&lib.Config{
		RPID:          rpID,
		RPDisplayName: rpName,
		RPOrigins:     origins,
	})
	if err != nil {
		return nil, fmt.Errorf("webauthn.NewEngine: %w", err)
	}
	return &Engine{w: w}, nil
}

// BeginRegistration returns creation options + the session data to stash.
// Forces resident (discoverable) keys and user verification so usernameless
// login works.
func (e *Engine) BeginRegistration(u *User) (*protocol.CredentialCreation, *lib.SessionData, error) {
	sel := protocol.AuthenticatorSelection{
		ResidentKey:      protocol.ResidentKeyRequirementRequired,
		UserVerification: protocol.VerificationPreferred,
	}
	return e.w.BeginRegistration(u, lib.WithAuthenticatorSelection(sel))
}

// FinishRegistration parses the browser response and verifies it, returning the
// new credential to persist.
func (e *Engine) FinishRegistration(u *User, sess lib.SessionData, body io.Reader) (*lib.Credential, error) {
	parsed, err := protocol.ParseCredentialCreationResponseBody(body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrAssertionInvalid, err)
	}
	cred, err := e.w.CreateCredential(u, sess, parsed)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrAssertionInvalid, err)
	}
	return cred, nil
}

// BeginLogin returns discoverable (usernameless) assertion options + session.
func (e *Engine) BeginLogin() (*protocol.CredentialAssertion, *lib.SessionData, error) {
	return e.w.BeginDiscoverableLogin()
}

// FinishLogin verifies the assertion. handler maps (rawID,userHandle)→User by
// loading that user's stored credentials. Returns the matched credential (for
// sign-count update) and the resolved user id.
func (e *Engine) FinishLogin(handler lib.DiscoverableUserHandler, sess lib.SessionData, body io.Reader) (*lib.Credential, error) {
	parsed, err := protocol.ParseCredentialRequestResponseBody(body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrAssertionInvalid, err)
	}
	cred, err := e.w.FinishDiscoverableLogin(handler, sess, parsed)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrAssertionInvalid, err)
	}
	return cred, nil
}
```

- [ ] **Step 3: `internal/ceremony/store.go`** (Redis, mirrors auth's `PutPending`/`TakePending` idea; stores JSON `SessionData` + the enrolling user id for registration)

```go
// Package ceremony stashes in-flight WebAuthn ceremony state in Redis, keyed by
// an opaque flow id with a short TTL.
package ceremony

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	lib "github.com/go-webauthn/webauthn/webauthn"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// State is what we stash between begin and finish.
type State struct {
	Session lib.SessionData `json:"session"`
	UserID  string          `json:"user_id"` // set for registration; empty for discoverable login
}

type Store struct {
	rdb *redis.Client
	ttl time.Duration
}

func New(rdb *redis.Client, ttl time.Duration) *Store { return &Store{rdb: rdb, ttl: ttl} }

func key(flowID string) string { return "passkey_ceremony:" + flowID }

// Put stashes state under a fresh flow id.
func (s *Store) Put(ctx context.Context, st State) (string, error) {
	buf, err := json.Marshal(st)
	if err != nil {
		return "", fmt.Errorf("ceremony.Put: marshal: %w", err)
	}
	flowID, err := newID()
	if err != nil {
		return "", err
	}
	if err := s.rdb.Set(ctx, key(flowID), buf, s.ttl).Err(); err != nil {
		return "", fmt.Errorf("ceremony.Put: %w", err)
	}
	return flowID, nil
}

// Take atomically reads + deletes the ceremony state (single-use).
func (s *Store) Take(ctx context.Context, flowID string) (State, error) {
	raw, err := s.rdb.GetDel(ctx, key(flowID)).Bytes()
	if errors.Is(err, redis.Nil) {
		return State{}, domain.ErrCeremonyExpired
	}
	if err != nil {
		return State{}, fmt.Errorf("ceremony.Take: %w", err)
	}
	var st State
	if err := json.Unmarshal(raw, &st); err != nil {
		return State{}, fmt.Errorf("ceremony.Take: unmarshal: %w", err)
	}
	return st, nil
}

func newID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("ceremony: rand: %w", err)
	}
	return hex.EncodeToString(b), nil
}
```

- [ ] **Step 4: Test the user adapter** — `internal/webauthn/user_test.go`

```go
package webauthn

import (
	"testing"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

func TestNewUser_MapsIDAndCredentials(t *testing.T) {
	u := NewUser("user-123", "alice", []domain.Credential{
		{CredentialID: []byte{1, 2, 3}, PublicKey: []byte{9}, SignCount: 7, Transports: []string{"internal"}},
	})
	if string(u.WebAuthnID()) != "user-123" {
		t.Fatalf("WebAuthnID = %q, want user-123", u.WebAuthnID())
	}
	if u.WebAuthnName() != "alice" {
		t.Fatalf("WebAuthnName = %q, want alice", u.WebAuthnName())
	}
	creds := u.WebAuthnCredentials()
	if len(creds) != 1 || creds[0].Authenticator.SignCount != 7 {
		t.Fatalf("credentials not mapped: %+v", creds)
	}
}
```

- [ ] **Step 5: Run tests**

Run: `cd backend/services/passkey-service && go mod tidy && go test ./internal/webauthn/... ./internal/ceremony/...`
Expected: PASS (user_test passes; ceremony builds).

- [ ] **Step 6: Commit**

```bash
git add backend/services/passkey-service/internal/webauthn backend/services/passkey-service/internal/ceremony
git commit -m "feat(passkey): webauthn engine, user adapter, ceremony store"
```

### Task 1.4: Service layer (registration, login, list, delete)

**Files:**
- Create: `internal/service/passkey/passkey.go` (interfaces + constructor)
- Create: `internal/service/passkey/register.go` (BeginRegistration/FinishRegistration)
- Create: `internal/service/passkey/login.go` (BeginLogin/FinishLogin — discoverable)
- Create: `internal/service/passkey/manage.go` (List/Delete)
- Test: `internal/service/passkey/login_test.go`

**Interfaces produced:** `passkey.Service` methods used by grpcapi:
`BeginRegistration(ctx, userID, displayName)(optionsJSON, flowID, error)`,
`FinishRegistration(ctx, userID, flowID, credentialJSON, name)(domain.Credential, error)`,
`BeginLogin(ctx)(optionsJSON, flowID, error)`,
`FinishLogin(ctx, flowID, assertionJSON)(userID string, error)`,
`List(ctx, userID)([]domain.Credential, error)`,
`Delete(ctx, userID, credentialID string)error`.

- [ ] **Step 1: `passkey.go`** (dependency interfaces + constructor)

```go
// Package passkey owns WebAuthn registration, discoverable login, and
// credential management. It never mints sessions.
package passkey

import (
	"context"
	"io"

	lib "github.com/go-webauthn/webauthn/webauthn"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

// Store is the credential persistence contract.
type Store interface {
	Create(ctx context.Context, c domain.Credential) error
	ListByUser(ctx context.Context, userID string) ([]domain.Credential, error)
	GetByCredentialID(ctx context.Context, credID []byte) (domain.Credential, error)
	DeleteByCredentialID(ctx context.Context, userID string, credID []byte) error
	UpdateSignCount(ctx context.Context, credID []byte, count uint32) error
}

// Ceremonies stashes in-flight ceremony state.
type Ceremonies interface {
	Put(ctx context.Context, st ceremony.State) (string, error)
	Take(ctx context.Context, flowID string) (ceremony.State, error)
}

// Engine is the WebAuthn crypto boundary.
type Engine interface {
	BeginRegistration(u *pkwa.User) (*protocol.CredentialCreation, *lib.SessionData, error)
	FinishRegistration(u *pkwa.User, sess lib.SessionData, body io.Reader) (*lib.Credential, error)
	BeginLogin() (*protocol.CredentialAssertion, *lib.SessionData, error)
	FinishLogin(handler lib.DiscoverableUserHandler, sess lib.SessionData, body io.Reader) (*lib.Credential, error)
}

// Service ties the store, ceremonies, and engine together.
type Service struct {
	store      Store
	ceremonies Ceremonies
	engine     Engine
}

// New constructs the passkey service.
func New(store Store, ceremonies Ceremonies, engine Engine) *Service {
	return &Service{store: store, ceremonies: ceremonies, engine: engine}
}
```

(Add the `protocol` import: `github.com/go-webauthn/webauthn/protocol`.)

- [ ] **Step 2: `register.go`**

```go
package passkey

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

// BeginRegistration builds creation options for the authenticated user and
// stashes the challenge under a new flow id.
func (s *Service) BeginRegistration(ctx context.Context, userID, displayName string) (string, string, error) {
	existing, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return "", "", err
	}
	u := pkwa.NewUser(userID, displayName, existing)
	opts, sess, err := s.engine.BeginRegistration(u)
	if err != nil {
		return "", "", err
	}
	flowID, err := s.ceremonies.Put(ctx, ceremony.State{Session: *sess, UserID: userID})
	if err != nil {
		return "", "", err
	}
	buf, err := json.Marshal(opts)
	if err != nil {
		return "", "", fmt.Errorf("passkey.BeginRegistration: marshal: %w", err)
	}
	return string(buf), flowID, nil
}

// FinishRegistration verifies the attestation and persists the credential.
func (s *Service) FinishRegistration(ctx context.Context, userID, flowID, credentialJSON, name string) (domain.Credential, error) {
	st, err := s.ceremonies.Take(ctx, flowID)
	if err != nil {
		return domain.Credential{}, err
	}
	if st.UserID != userID {
		return domain.Credential{}, domain.ErrAssertionInvalid
	}
	existing, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return domain.Credential{}, err
	}
	u := pkwa.NewUser(userID, name, existing)
	cred, err := s.engine.FinishRegistration(u, st.Session, strings.NewReader(credentialJSON))
	if err != nil {
		return domain.Credential{}, err
	}
	dc := domain.Credential{
		UserID:       userID,
		CredentialID: cred.ID,
		PublicKey:    cred.PublicKey,
		SignCount:    cred.Authenticator.SignCount,
		AAGUID:       cred.Authenticator.AAGUID,
		Name:         name,
	}
	if err := s.store.Create(ctx, dc); err != nil {
		return domain.Credential{}, err
	}
	return dc, nil
}
```

- [ ] **Step 3: `login.go`** (discoverable; the security-critical path)

```go
package passkey

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	lib "github.com/go-webauthn/webauthn/webauthn"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

// BeginLogin builds usernameless assertion options and stashes the challenge.
func (s *Service) BeginLogin(ctx context.Context) (string, string, error) {
	opts, sess, err := s.engine.BeginLogin()
	if err != nil {
		return "", "", err
	}
	flowID, err := s.ceremonies.Put(ctx, ceremony.State{Session: *sess})
	if err != nil {
		return "", "", err
	}
	buf, err := json.Marshal(opts)
	if err != nil {
		return "", "", fmt.Errorf("passkey.BeginLogin: marshal: %w", err)
	}
	return string(buf), flowID, nil
}

// FinishLogin verifies the assertion against the stored public key and returns
// the verified user id. It rejects sign-count regression (cloned authenticator)
// by trusting go-webauthn's CloneWarning and always advancing the stored count.
func (s *Service) FinishLogin(ctx context.Context, flowID, assertionJSON string) (string, error) {
	st, err := s.ceremonies.Take(ctx, flowID)
	if err != nil {
		return "", err
	}
	var resolvedUserID string
	handler := func(rawID, userHandle []byte) (lib.User, error) {
		// userHandle is the resident credential's user id (we stored the raw
		// auth user id at registration).
		userID := string(userHandle)
		creds, err := s.store.ListByUser(ctx, userID)
		if err != nil {
			return nil, err
		}
		if len(creds) == 0 {
			return nil, domain.ErrNoCredentials
		}
		resolvedUserID = userID
		return pkwa.NewUser(userID, userID, creds), nil
	}
	cred, err := s.engine.FinishLogin(handler, st.Session, strings.NewReader(assertionJSON))
	if err != nil {
		return "", err
	}
	if cred.Authenticator.CloneWarning {
		return "", domain.ErrAssertionInvalid
	}
	if err := s.store.UpdateSignCount(ctx, cred.ID, cred.Authenticator.SignCount); err != nil {
		return "", err
	}
	return resolvedUserID, nil
}
```

- [ ] **Step 4: `manage.go`**

```go
package passkey

import (
	"context"
	"encoding/base64"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// List returns the user's credentials.
func (s *Service) List(ctx context.Context, userID string) ([]domain.Credential, error) {
	return s.store.ListByUser(ctx, userID)
}

// Delete removes one of the user's credentials by base64url id.
func (s *Service) Delete(ctx context.Context, userID, credentialID string) error {
	raw, err := base64.RawURLEncoding.DecodeString(credentialID)
	if err != nil {
		return domain.ErrNotFound
	}
	return s.store.DeleteByCredentialID(ctx, userID, raw)
}
```

- [ ] **Step 5: Test FinishLogin** — `login_test.go` with a fake store + fake engine. Covers: (a) valid assertion → resolved user id + sign count advanced; (b) engine rejects assertion → `ErrAssertionInvalid`; (c) clone warning → `ErrAssertionInvalid`; (d) expired ceremony → `ErrCeremonyExpired`.

```go
package passkey

import (
	"context"
	"errors"
	"io"
	"testing"

	lib "github.com/go-webauthn/webauthn/webauthn"
	"github.com/go-webauthn/webauthn/protocol"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

type fakeStore struct {
	creds     []domain.Credential
	updated   uint32
	updateErr error
}

func (f *fakeStore) Create(context.Context, domain.Credential) error { return nil }
func (f *fakeStore) ListByUser(context.Context, string) ([]domain.Credential, error) {
	return f.creds, nil
}
func (f *fakeStore) GetByCredentialID(context.Context, []byte) (domain.Credential, error) {
	return domain.Credential{}, nil
}
func (f *fakeStore) DeleteByCredentialID(context.Context, string, []byte) error { return nil }
func (f *fakeStore) UpdateSignCount(_ context.Context, _ []byte, c uint32) error {
	f.updated = c
	return f.updateErr
}

type fakeCeremonies struct {
	state ceremony.State
	err   error
}

func (f *fakeCeremonies) Put(context.Context, ceremony.State) (string, error) { return "flow", nil }
func (f *fakeCeremonies) Take(context.Context, string) (ceremony.State, error) {
	return f.state, f.err
}

type fakeEngine struct {
	cred *lib.Credential
	err  error
	// callHandler lets a test drive the DiscoverableUserHandler to set resolvedUserID.
	handleUser []byte
}

func (f *fakeEngine) BeginRegistration(*pkwa.User) (*protocol.CredentialCreation, *lib.SessionData, error) {
	return nil, &lib.SessionData{}, nil
}
func (f *fakeEngine) FinishRegistration(*pkwa.User, lib.SessionData, io.Reader) (*lib.Credential, error) {
	return f.cred, f.err
}
func (f *fakeEngine) BeginLogin() (*protocol.CredentialAssertion, *lib.SessionData, error) {
	return nil, &lib.SessionData{}, nil
}
func (f *fakeEngine) FinishLogin(h lib.DiscoverableUserHandler, _ lib.SessionData, _ io.Reader) (*lib.Credential, error) {
	if f.err != nil {
		return nil, f.err
	}
	if _, err := h([]byte("raw"), f.handleUser); err != nil {
		return nil, err
	}
	return f.cred, nil
}

func TestFinishLogin_Valid(t *testing.T) {
	store := &fakeStore{creds: []domain.Credential{{CredentialID: []byte("c")}}}
	eng := &fakeEngine{
		cred:       &lib.Credential{ID: []byte("c"), Authenticator: lib.Authenticator{SignCount: 5}},
		handleUser: []byte("user-9"),
	}
	svc := New(store, &fakeCeremonies{}, eng)
	uid, err := svc.FinishLogin(context.Background(), "flow", "{}")
	if err != nil || uid != "user-9" {
		t.Fatalf("uid=%q err=%v, want user-9/nil", uid, err)
	}
	if store.updated != 5 {
		t.Fatalf("sign count not advanced: %d", store.updated)
	}
}

func TestFinishLogin_CloneWarning(t *testing.T) {
	eng := &fakeEngine{
		cred:       &lib.Credential{ID: []byte("c"), Authenticator: lib.Authenticator{CloneWarning: true}},
		handleUser: []byte("user-9"),
	}
	svc := New(&fakeStore{creds: []domain.Credential{{CredentialID: []byte("c")}}}, &fakeCeremonies{}, eng)
	if _, err := svc.FinishLogin(context.Background(), "flow", "{}"); !errors.Is(err, domain.ErrAssertionInvalid) {
		t.Fatalf("err=%v, want ErrAssertionInvalid", err)
	}
}

func TestFinishLogin_ExpiredCeremony(t *testing.T) {
	svc := New(&fakeStore{}, &fakeCeremonies{err: domain.ErrCeremonyExpired}, &fakeEngine{})
	if _, err := svc.FinishLogin(context.Background(), "flow", "{}"); !errors.Is(err, domain.ErrCeremonyExpired) {
		t.Fatalf("err=%v, want ErrCeremonyExpired", err)
	}
}
```

- [ ] **Step 6: Run**

Run: `cd backend/services/passkey-service && go test ./internal/service/...`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/services/passkey-service/internal/service
git commit -m "feat(passkey): registration, discoverable login, manage service"
```

### Task 1.5: clients/auth (identity resolution)

**Files:**
- Create: `internal/clients/auth/{client.go,resolve.go}` — copy twofa-service's `internal/clients/auth/*` VERBATIM, substitute module path only. `Resolve(ctx, token)→(userID, username)` via `GetMe`.

- [ ] **Step 1: Copy both files, substitute the module path.**
- [ ] **Step 2: Build** — `go build ./internal/clients/...` → PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(passkey): auth identity client"`

### Task 1.6: gRPC transport + bootstrap wiring (service fully serves)

**Files:**
- Create: `internal/transport/grpcapi/server.go` (dep interfaces + Server + Register + mapErr)
- Create: `internal/transport/grpcapi/{registration.go,login.go,manage.go}` (handlers)
- Create: `internal/bootstrap/{service.go,serve.go,transport.go}` — copy twofa's, substitute; `service.go` deltas below.

**Interfaces produced:** `passkeyv1.PasskeyServiceServer` fully implemented; `bootstrap.RunServe/InitService/InitGRPCServer`.

- [ ] **Step 1: `server.go`**

```go
// Package grpcapi exposes passkey-service over gRPC. server.go holds the
// dependency interfaces, the Server, registration, and the central error mapper.
package grpcapi

import (
	"context"
	"errors"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// Service is the passkey business surface.
type Service interface {
	BeginRegistration(ctx context.Context, userID, displayName string) (string, string, error)
	FinishRegistration(ctx context.Context, userID, flowID, credentialJSON, name string) (domain.Credential, error)
	BeginLogin(ctx context.Context) (string, string, error)
	FinishLogin(ctx context.Context, flowID, assertionJSON string) (string, error)
	List(ctx context.Context, userID string) ([]domain.Credential, error)
	Delete(ctx context.Context, userID, credentialID string) error
}

// Identity resolves a session token to (userID, username) via auth-service.
type Identity interface {
	Resolve(ctx context.Context, token string) (userID, username string, err error)
}

// Server implements passkeyv1.PasskeyServiceServer.
type Server struct {
	passkeyv1.UnimplementedPasskeyServiceServer
	svc      Service
	identity Identity
}

// New builds the gRPC handler.
func New(svc Service, identity Identity) *Server { return &Server{svc: svc, identity: identity} }

// Register attaches the handler to a grpc.Server.
func (s *Server) Register(srv *grpc.Server) { passkeyv1.RegisterPasskeyServiceServer(srv, s) }

// mapErr converts domain sentinels to gRPC codes.
func mapErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.ErrNotFound):
		return status.Error(codes.NotFound, err.Error())
	case errors.Is(err, domain.ErrCeremonyExpired):
		return status.Error(codes.FailedPrecondition, err.Error())
	case errors.Is(err, domain.ErrAssertionInvalid), errors.Is(err, domain.ErrNoCredentials):
		return status.Error(codes.Unauthenticated, err.Error())
	default:
		return status.Error(codes.Internal, err.Error())
	}
}
```

- [ ] **Step 2: `registration.go`** (management handlers resolve identity from token)

```go
package grpcapi

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

func (s *Server) BeginRegistration(ctx context.Context, req *passkeyv1.BeginRegistrationRequest) (*passkeyv1.BeginRegistrationResponse, error) {
	uid, name, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	opts, flowID, err := s.svc.BeginRegistration(ctx, uid, name)
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.BeginRegistrationResponse{OptionsJson: opts, FlowId: flowID}, nil
}

func (s *Server) FinishRegistration(ctx context.Context, req *passkeyv1.FinishRegistrationRequest) (*passkeyv1.FinishRegistrationResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	c, err := s.svc.FinishRegistration(ctx, uid, req.GetFlowId(), req.GetCredentialJson(), req.GetName())
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.FinishRegistrationResponse{Credential: toProto(c)}, nil
}
```

- [ ] **Step 3: `manage.go`** (List/Delete + `toProto` helper)

```go
package grpcapi

import (
	"context"
	"encoding/base64"
	"time"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

func (s *Server) ListCredentials(ctx context.Context, req *passkeyv1.ListCredentialsRequest) (*passkeyv1.ListCredentialsResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	creds, err := s.svc.List(ctx, uid)
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]*passkeyv1.Credential, 0, len(creds))
	for _, c := range creds {
		out = append(out, toProto(c))
	}
	return &passkeyv1.ListCredentialsResponse{Credentials: out}, nil
}

func (s *Server) DeleteCredential(ctx context.Context, req *passkeyv1.DeleteCredentialRequest) (*passkeyv1.DeleteCredentialResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	if err := s.svc.Delete(ctx, uid, req.GetCredentialId()); err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.DeleteCredentialResponse{}, nil
}

func toProto(c domain.Credential) *passkeyv1.Credential {
	last := ""
	if c.LastUsedAt != nil {
		last = c.LastUsedAt.Format(time.RFC3339)
	}
	return &passkeyv1.Credential{
		Id:         base64.RawURLEncoding.EncodeToString(c.CredentialID),
		Name:       c.Name,
		CreatedAt:  c.CreatedAt.Format(time.RFC3339),
		LastUsedAt: last,
	}
}
```

- [ ] **Step 4: `login.go`** (internal handlers — no token)

```go
package grpcapi

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

func (s *Server) BeginLogin(ctx context.Context, _ *passkeyv1.BeginLoginRequest) (*passkeyv1.BeginLoginResponse, error) {
	opts, flowID, err := s.svc.BeginLogin(ctx)
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.BeginLoginResponse{OptionsJson: opts, FlowId: flowID}, nil
}

func (s *Server) FinishLogin(ctx context.Context, req *passkeyv1.FinishLoginRequest) (*passkeyv1.FinishLoginResponse, error) {
	uid, err := s.svc.FinishLogin(ctx, req.GetFlowId(), req.GetAssertionJson())
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.FinishLoginResponse{UserId: uid}, nil
}
```

- [ ] **Step 5: `bootstrap/service.go`** — copy twofa's shape; `InitService` deltas: build engine + ceremony store + credentials store, dial auth, wire the service.

```go
package bootstrap

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/config"
	passkeysvc "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey"
	credstore "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/storage/credentials"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/transport/grpcapi"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

// InitService wires storage + engine + ceremonies + auth client → service →
// gRPC handler. Returns the auth client so RunServe can Close it.
func InitService(pool *pgxpool.Pool, rdb *redis.Client, cfg config.Config) (*grpcapi.Server, *auth.Client, error) {
	engine, err := pkwa.NewEngine(cfg.RPID, cfg.RPName, cfg.RPOrigins)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: engine: %w", err)
	}
	authClient, err := auth.Dial(cfg.AuthGRPCAddr)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: dial auth: %w", err)
	}
	store := credstore.New(pool)
	cer := ceremony.New(rdb, cfg.CeremonyTTL)
	svc := passkeysvc.New(store, cer, engine)
	return grpcapi.New(svc, authClient), authClient, nil
}
```

- [ ] **Step 6: `bootstrap/serve.go` + `transport.go`** — copy twofa's verbatim, substitute `twofa`→`passkey`, `twofav1`→`passkeyv1`, `TwoFAService_ServiceDesc`→`PasskeyService_ServiceDesc`.

- [ ] **Step 7: Build + vet the whole service**

Run: `cd backend/services/passkey-service && go build ./... && go vet ./...`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/services/passkey-service
git commit -m "feat(passkey): grpc transport + bootstrap; service serves end to end"
```

---

## Phase 2 — auth-service (orchestrate passkey login, mint session)

### Task 2.1: clients/passkey in auth-service

**Files:**
- Create: `backend/services/auth-service/internal/clients/passkey/{client.go,login.go}`

**Interfaces produced:** `passkey.Client` with `BeginLogin(ctx)(optionsJSON, flowID, error)` and `FinishLogin(ctx, flowID, assertionJSON)(userID string, error)`.

- [ ] **Step 1: `client.go`** — copy auth's `internal/clients/twofa/client.go`, substitute `twofa`→`passkey`, `twofav1`→`passkeyv1`, `TwoFAServiceClient`→`PasskeyServiceClient`, `NewTwoFAServiceClient`→`NewPasskeyServiceClient`.

- [ ] **Step 2: `login.go`**

```go
package passkey

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

// BeginLogin proxies the discoverable-login begin.
func (c *Client) BeginLogin(ctx context.Context) (optionsJSON, flowID string, err error) {
	resp, err := c.cc.BeginLogin(ctx, &passkeyv1.BeginLoginRequest{})
	if err != nil {
		return "", "", err
	}
	return resp.GetOptionsJson(), resp.GetFlowId(), nil
}

// FinishLogin verifies the assertion and returns the verified user id.
func (c *Client) FinishLogin(ctx context.Context, flowID, assertionJSON string) (string, error) {
	resp, err := c.cc.FinishLogin(ctx, &passkeyv1.FinishLoginRequest{FlowId: flowID, AssertionJson: assertionJSON})
	if err != nil {
		return "", err
	}
	return resp.GetUserId(), nil
}
```

- [ ] **Step 3: Build** — `cd backend/services/auth-service && go build ./internal/clients/...` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(auth): passkey gRPC client"`

### Task 2.2: PasskeyVerifier + login_passkey service method

**Files:**
- Modify: `internal/service/auth/auth.go` (add `PasskeyVerifier` interface, `passkey` field, `New` param, update `//go:generate` line)
- Create: `internal/service/auth/login_passkey.go`
- Regenerate: `internal/service/auth/mocks/*`
- Test: `internal/service/auth/login_passkey_test.go`

**Interfaces consumed:** `passkey.Client` (Task 2.1) satisfies `PasskeyVerifier`.
**Interfaces produced:** `Service.PasskeyLoginBegin(ctx)(optionsJSON, flowID, error)`, `Service.PasskeyLoginFinish(ctx, flowID, assertionJSON)(token string, error)`.

- [ ] **Step 1: Edit `auth.go`** — add after `TwoFAVerifier`:

```go
// PasskeyVerifier delegates passwordless assertion checks to passkey-service.
type PasskeyVerifier interface {
	BeginLogin(ctx context.Context) (optionsJSON, flowID string, err error)
	FinishLogin(ctx context.Context, flowID, assertionJSON string) (userID string, err error)
}
```

Add `passkey PasskeyVerifier` to the `Service` struct; add `passkey PasskeyVerifier` param to `New(...)` (after `twofa`) and set `passkey: passkey`. Update the generate directive:
`//go:generate minimock -i UserStore,SessionStore,TwoFAVerifier,PasskeyVerifier -o ./mocks -s _mock.go`

- [ ] **Step 2: `login_passkey.go`** (mirrors `login_2fa.go`; ADDS the status gate)

```go
package auth

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// PasskeyLoginBegin proxies discoverable-login options from passkey-service.
func (s *Service) PasskeyLoginBegin(ctx context.Context) (string, string, error) {
	return s.passkey.BeginLogin(ctx)
}

// PasskeyLoginFinish verifies the assertion via passkey-service, then — because
// passkey-service only attests the assertion, not account status — re-checks the
// user's status before minting a session. Passkey UV is already MFA, so no TOTP
// step is required.
func (s *Service) PasskeyLoginFinish(ctx context.Context, flowID, assertionJSON string) (string, error) {
	if flowID == "" || assertionJSON == "" {
		return "", fmt.Errorf("auth.PasskeyLoginFinish: %w: flow and assertion required", domain.ErrInvalidInput)
	}
	userID, err := s.passkey.FinishLogin(ctx, flowID, assertionJSON)
	if err != nil {
		return "", err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", err
	}
	switch u.Status {
	case domain.StatusFrozen:
		return "", domain.ErrAccountFrozen
	case domain.StatusDeleted:
		return "", domain.ErrAccountDeleted
	}
	return s.issue(ctx, u)
}
```

- [ ] **Step 3: Regenerate mocks**

Run: `cd backend/services/auth-service && go generate ./internal/service/auth/...`
Expected: `mocks/PasskeyVerifierMock.go` appears (or regenerated bundle). If `minimock` is unavailable, hand-write a `PasskeyVerifierMock` matching the existing mock style.

- [ ] **Step 4: Test `login_passkey_test.go`** — cover (a) valid → token minted; (b) frozen user → `ErrAccountFrozen`, no `issue`; (c) verify error propagates; (d) empty input → `ErrInvalidInput`. Use the generated mocks + the existing test helpers in the package (mirror `login_2fa_test.go` if present, else construct mocks directly).

```go
package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth/mocks"
	"github.com/gojuno/minimock/v3"
)

func TestPasskeyLoginFinish_Valid(t *testing.T) {
	mc := minimock.NewController(t)
	users := mocks.NewUserStoreMock(mc).GetByIDMock.Return(domain.User{ID: "u1", Status: domain.StatusActive}, nil)
	sess := mocks.NewSessionStoreMock(mc).CreateMock.Return("tok", nil)
	pk := mocks.NewPasskeyVerifierMock(mc).FinishLoginMock.Return("u1", nil)
	twofa := mocks.NewTwoFAVerifierMock(mc)
	svc := New(users, sess, twofa, pk, time.Hour)

	tok, err := svc.PasskeyLoginFinish(context.Background(), "flow", "{}")
	if err != nil || tok != "tok" {
		t.Fatalf("tok=%q err=%v, want tok/nil", tok, err)
	}
}

func TestPasskeyLoginFinish_Frozen(t *testing.T) {
	mc := minimock.NewController(t)
	users := mocks.NewUserStoreMock(mc).GetByIDMock.Return(domain.User{ID: "u1", Status: domain.StatusFrozen}, nil)
	sess := mocks.NewSessionStoreMock(mc) // Create must NOT be called
	pk := mocks.NewPasskeyVerifierMock(mc).FinishLoginMock.Return("u1", nil)
	svc := New(users, sess, mocks.NewTwoFAVerifierMock(mc), pk, time.Hour)

	if _, err := svc.PasskeyLoginFinish(context.Background(), "flow", "{}"); !errors.Is(err, domain.ErrAccountFrozen) {
		t.Fatalf("err=%v, want ErrAccountFrozen", err)
	}
}
```

(Adjust the `New(...)` arg order to match Task 2.2 Step 1. The mock constructor names follow the existing `mocks` package convention.)

- [ ] **Step 5: Run + fix the constructor call site**

Run: `cd backend/services/auth-service && go build ./... 2>&1 | head`
Expected: FAIL at `bootstrap/service.go` — `authsvc.New` now needs the passkey arg. Fixed in Task 2.3.
Run: `go test ./internal/service/auth/...`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/services/auth-service/internal/service/auth backend/services/auth-service/internal/clients
git commit -m "feat(auth): passkey login finish mints session after status check"
```

### Task 2.3: auth transport + config + bootstrap wiring

**Files:**
- Modify: `internal/transport/grpcapi/server.go` (`AuthFlow` interface: add the 2 methods)
- Modify: `internal/transport/grpcapi/login.go` (2 handlers)
- Modify: `internal/config/config.go` (add `PasskeyGRPCAddr` + default `passkey:9008`)
- Modify: `internal/bootstrap/service.go` (dial passkey client, pass to `authsvc.New`, return it) + `serve.go` (defer Close)

- [ ] **Step 1: `server.go`** — add to `AuthFlow`:

```go
	PasskeyLoginBegin(ctx context.Context) (string, string, error)
	PasskeyLoginFinish(ctx context.Context, flowID, assertionJSON string) (string, error)
```

- [ ] **Step 2: `login.go`** — add handlers:

```go
func (s *Server) PasskeyLoginBegin(ctx context.Context, _ *authv1.PasskeyLoginBeginRequest) (*authv1.PasskeyLoginBeginResponse, error) {
	opts, flowID, err := s.auth.PasskeyLoginBegin(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.PasskeyLoginBeginResponse{OptionsJson: opts, FlowId: flowID}, nil
}

func (s *Server) PasskeyLoginFinish(ctx context.Context, req *authv1.PasskeyLoginFinishRequest) (*authv1.LoginResponse, error) {
	token, err := s.auth.PasskeyLoginFinish(ctx, req.GetFlowId(), req.GetAssertionJson())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.LoginResponse{Token: token}, nil
}
```

- [ ] **Step 3: `config.go`** — add field `PasskeyGRPCAddr string \`mapstructure:"passkey-grpc-addr"\`` and `v.SetDefault("passkey-grpc-addr", "passkey:9008")`. Add the matching persistent flag in `cmd/auth/main.go` (mirror `--twofa-grpc-addr`). Env: `AUTH_PASSKEY_GRPC_ADDR`.

- [ ] **Step 4: `bootstrap/service.go`** — dial passkey client, thread it through:

```go
	passkeyC, err := passkeyclient.Dial(cfg.PasskeyGRPCAddr)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("bootstrap.InitService: dial passkey: %w", err)
	}
	...
	authS := authsvc.New(us, sess, twofaC, passkeyC, cfg.SessionAbsoluteTTL)
```

Extend `InitService`'s return signature to also return `*passkeyclient.Client` (add import `passkeyclient ".../auth-service/internal/clients/passkey"`), and in `serve.go` add `defer func() { _ = passkeyClient.Close() }()` alongside `twofaClient`. Update the `InitService` call in `serve.go` to receive the new return value.

- [ ] **Step 5: Build + test**

Run: `cd backend/services/auth-service && go build ./... && go test ./...`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/services/auth-service
git commit -m "feat(auth): passkey login RPCs + passkey client wiring"
```

---

## Phase 3 — gateway

### Task 3.1: clients/passkey in gateway

**Files:**
- Create: `backend/services/gateway-service/internal/clients/passkey/{client.go,passkey.go}`

**Interfaces produced:** `passkey.Client` with `BeginRegistration(ctx, token)(optionsJSON, flowID, error)`, `FinishRegistration(ctx, token, flowID, credentialJSON, name)(*passkeyv1.Credential, error)`, `ListCredentials(ctx, token)([]*passkeyv1.Credential, error)`, `DeleteCredential(ctx, token, credID)error`, `LoginBegin`/`LoginFinish` NOT here (login goes via the auth client).

- [ ] **Step 1: `client.go`** — copy gateway's `internal/clients/twofa/client.go`, substitute.

- [ ] **Step 2: `passkey.go`**

```go
package passkey

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

func (c *Client) BeginRegistration(ctx context.Context, token string) (optionsJSON, flowID string, err error) {
	resp, err := c.cc.BeginRegistration(ctx, &passkeyv1.BeginRegistrationRequest{Token: token})
	if err != nil {
		return "", "", err
	}
	return resp.GetOptionsJson(), resp.GetFlowId(), nil
}

func (c *Client) FinishRegistration(ctx context.Context, token, flowID, credentialJSON, name string) (*passkeyv1.Credential, error) {
	resp, err := c.cc.FinishRegistration(ctx, &passkeyv1.FinishRegistrationRequest{
		Token: token, FlowId: flowID, CredentialJson: credentialJSON, Name: name,
	})
	if err != nil {
		return nil, err
	}
	return resp.GetCredential(), nil
}

func (c *Client) ListCredentials(ctx context.Context, token string) ([]*passkeyv1.Credential, error) {
	resp, err := c.cc.ListCredentials(ctx, &passkeyv1.ListCredentialsRequest{Token: token})
	if err != nil {
		return nil, err
	}
	return resp.GetCredentials(), nil
}

func (c *Client) DeleteCredential(ctx context.Context, token, credID string) error {
	_, err := c.cc.DeleteCredential(ctx, &passkeyv1.DeleteCredentialRequest{Token: token, CredentialId: credID})
	return err
}
```

- [ ] **Step 3: Build + commit** — `go build ./internal/clients/...`; `git commit -m "feat(gateway): passkey gRPC client"`

### Task 3.2: gateway config + bootstrap + authhttp constructor

**Files:**
- Modify: `internal/config/config.go` (add `PasskeyGRPCAddr` + default `passkey:9008`, env `GATEWAY_PASSKEY_GRPC_ADDR`)
- Create: `internal/bootstrap/passkey.go` (`InitPasskey` — mirror `bootstrap/twofa.go`)
- Modify: `internal/bootstrap/serve.go` (dial passkey, defer Close, pass to `authhttp.New`)
- Modify: `internal/transport/authhttp/handlers.go` (`Handlers` struct + `New` gain `passkey *passkey.Client`)
- Modify: auth client also needs to expose passkey login. The gateway's **auth** client (`internal/clients/auth`) needs `PasskeyLoginBegin`/`PasskeyLoginFinish` methods.

- [ ] **Step 1: Extend gateway's auth client** — add `internal/clients/auth/passkey_login.go`:

```go
package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (c *Client) PasskeyLoginBegin(ctx context.Context) (optionsJSON, flowID string, err error) {
	resp, err := c.cc.PasskeyLoginBegin(ctx, &authv1.PasskeyLoginBeginRequest{})
	if err != nil {
		return "", "", err
	}
	return resp.GetOptionsJson(), resp.GetFlowId(), nil
}

func (c *Client) PasskeyLoginFinish(ctx context.Context, flowID, assertionJSON string) (string, error) {
	resp, err := c.cc.PasskeyLoginFinish(ctx, &authv1.PasskeyLoginFinishRequest{FlowId: flowID, AssertionJson: assertionJSON})
	if err != nil {
		return "", err
	}
	return resp.GetToken(), nil
}
```

(Confirm the gateway auth client field is `cc authv1.AuthServiceClient`; mirror the existing `session.go` method style.)

- [ ] **Step 2: `bootstrap/passkey.go`**, config field, and `serve.go` wiring — mirror the twofa lines exactly (dial → `defer Close` → pass into `authhttp.New(authClient, twofaClient, passkeyClient, logger)`).

- [ ] **Step 3: `handlers.go`** — add `passkey *passkey.Client` to `Handlers`, extend `New`. Import `.../gateway-service/internal/clients/passkey`.

- [ ] **Step 4: Build** — `cd backend/services/gateway-service && go build ./...` → will FAIL until routes/handlers added in 3.3; that's expected. Commit after 3.3.

### Task 3.3: authhttp passkey handlers + routes

**Files:**
- Create: `internal/transport/authhttp/passkey.go` (handlers)
- Modify: `internal/transport/authhttp/handlers.go` (`Mount`: register routes)

- [ ] **Step 1: `passkey.go`** (mirror the 2FA handler idiom: `decode` anon struct, call client with `bearer(r)`, `fail`/`writeJSON`)

```go
package authhttp

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (h *Handlers) passkeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	opts, flowID, err := h.passkey.BeginRegistration(r.Context(), bearer(r))
	if err != nil {
		fail(w, err)
		return
	}
	// optionsJson is already JSON — pass it through untouched under a wrapper.
	writeJSON(w, http.StatusOK, map[string]any{"optionsJson": opts, "flowId": flowID})
}

func (h *Handlers) passkeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	var req struct{ FlowId, CredentialJson, Name string }
	if !decode(w, r, &req) {
		return
	}
	c, err := h.passkey.FinishRegistration(r.Context(), bearer(r), req.FlowId, req.CredentialJson, req.Name)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, credToJSON(c))
}

func (h *Handlers) passkeyList(w http.ResponseWriter, r *http.Request) {
	creds, err := h.passkey.ListCredentials(r.Context(), bearer(r))
	if err != nil {
		fail(w, err)
		return
	}
	out := make([]any, 0, len(creds))
	for _, c := range creds {
		out = append(out, credToJSON(c))
	}
	writeJSON(w, http.StatusOK, map[string]any{"credentials": out})
}

func (h *Handlers) passkeyDelete(w http.ResponseWriter, r *http.Request) {
	if err := h.passkey.DeleteCredential(r.Context(), bearer(r), chi.URLParam(r, "id")); err != nil {
		fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) passkeyLoginBegin(w http.ResponseWriter, r *http.Request) {
	opts, flowID, err := h.client.PasskeyLoginBegin(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"optionsJson": opts, "flowId": flowID})
}

func (h *Handlers) passkeyLoginFinish(w http.ResponseWriter, r *http.Request) {
	var req struct{ FlowId, AssertionJson string }
	if !decode(w, r, &req) {
		return
	}
	token, err := h.client.PasskeyLoginFinish(r.Context(), req.FlowId, req.AssertionJson)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token})
}
```

Add a small `credToJSON` helper in `authhttp/dto.go`:

```go
func credToJSON(c *passkeyv1.Credential) map[string]any {
	return map[string]any{
		"id": c.GetId(), "name": c.GetName(),
		"createdAt": c.GetCreatedAt(), "lastUsedAt": c.GetLastUsedAt(),
	}
}
```

(import `passkeyv1 ".../proto/gen/go/rosneft/passkey/v1"` in dto.go.)

- [ ] **Step 2: `handlers.go` `Mount`** — public login routes next to `/login`, register/list/delete inside the authenticated `pr.Group`:

```go
		// Public.
		ar.Post("/passkey/login/begin", h.passkeyLoginBegin)
		ar.Post("/passkey/login/finish", h.passkeyLoginFinish)
```
```go
			// Authenticated (any valid session), inside pr.Use(h.Authenticate):
			pr.Post("/passkey/register/begin", h.passkeyRegisterBegin)
			pr.Post("/passkey/register/finish", h.passkeyRegisterFinish)
			pr.Get("/passkey/credentials", h.passkeyList)
			pr.Delete("/passkey/credentials/{id}", h.passkeyDelete)
```

- [ ] **Step 3: Build + vet**

Run: `cd backend/services/gateway-service && go build ./... && go vet ./...`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/services/gateway-service
git commit -m "feat(gateway): passkey routes (register/list/delete + public login)"
```

### Task 3.4: OpenAPI paths + schemas

**Files:**
- Modify: `backend/services/gateway-service/api/openapi.yaml` (add 6 paths + schemas, all `tags: [auth]`)

- [ ] **Step 1: Add schemas** under `components/schemas` (flow style, matching the 2FA block):

```yaml
    PasskeyBeginResponse:
      type: object
      properties:
        optionsJson: { type: string, description: PublicKey options JSON for navigator.credentials }
        flowId: { type: string }
    PasskeyRegisterFinishRequest:
      type: object
      required: [flowId, credentialJson]
      properties:
        flowId: { type: string }
        credentialJson: { type: string, description: navigator.credentials.create() result JSON }
        name: { type: string }
    PasskeyCredential:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        createdAt: { type: string }
        lastUsedAt: { type: string }
    PasskeyListResponse:
      type: object
      properties:
        credentials: { type: array, items: { $ref: '#/components/schemas/PasskeyCredential' } }
    PasskeyLoginFinishRequest:
      type: object
      required: [flowId, assertionJson]
      properties:
        flowId: { type: string }
        assertionJson: { type: string, description: navigator.credentials.get() result JSON }
```

- [ ] **Step 2: Add paths** under `paths:` (all `tags: [auth]`; login pair public, the rest `security: [{ bearerAuth: [] }]`). Include `/api/auth/passkey/login/begin`, `/api/auth/passkey/login/finish` (→ `TokenResponse`), `/api/auth/passkey/register/begin` (→ `PasskeyBeginResponse`), `/api/auth/passkey/register/finish` (body `PasskeyRegisterFinishRequest` → `PasskeyCredential`), `GET /api/auth/passkey/credentials` (→ `PasskeyListResponse`), `DELETE /api/auth/passkey/credentials/{id}` (→ 204). Mirror the exact YAML shape from the 2FA paths.

- [ ] **Step 3: Regenerate the embedded spec + verify tags stay excluded**

Run: `cd backend && make openapi-gen`
Expected: `openapi_spec_gen.go` updates; because the paths are `tags: [auth]` (in `exclude-tags`), NO new strict-server stubs are generated in `openapi_gen.go`. Then:
Run: `cd services/gateway-service && go build ./...`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/services/gateway-service/api backend/services/gateway-service/internal/transport/httpapi
git commit -m "docs(gateway): openapi passkey paths"
```

---

## Phase 4 — docker-compose

### Task 4.1: passkey service block + wiring; full-stack smoke

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add the `passkey` service block** (mirror `twofa`, deltas: RP env, redis DB 3, port 9008, no secret-key/issuer):

```yaml
  passkey:
    build:
      context: ./backend
      dockerfile: services/passkey-service/Dockerfile
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    expose:
      - "9008"
    environment:
      PASSKEY_GRPC_ADDR: ":9008"
      # Shares the andrey DB; isolated by passkey_goose_db_version.
      PASSKEY_DB_DSN: "postgres://andrey:andrey@postgres:5432/andrey?sslmode=disable"
      PASSKEY_REDIS_ADDR: "redis:6379"
      PASSKEY_REDIS_DB: "3"
      PASSKEY_AUTH_GRPC_ADDR: "auth:9004"
      PASSKEY_RP_ID: "localhost"
      PASSKEY_RP_ORIGINS: "http://localhost:3000"
      PASSKEY_RP_NAME: "Andrey"
      PASSKEY_LOG_LEVEL: "info"
```

> Prod deploy note (put in the deploy env, NOT committed to compose): `PASSKEY_RP_ID=andrey.vbncursed.fun`, `PASSKEY_RP_ORIGINS=https://andrey.vbncursed.fun`. Confirm `PASSKEY_RP_ORIGINS` unmarshals a comma/space-separated list into `[]string` in viper; if not, set it as a JSON array or adjust the config binding.

- [ ] **Step 2: Wire gateway + auth** — add to `gateway.environment`: `GATEWAY_PASSKEY_GRPC_ADDR: "passkey:9008"`; add to `gateway.depends_on`: `passkey: { condition: service_started }`; add to `auth.environment`: `AUTH_PASSKEY_GRPC_ADDR: "passkey:9008"`; add to `auth.depends_on`: `passkey: { condition: service_started }` (auth calls passkey during login).

- [ ] **Step 3: Build + boot the new service**

Run: `docker compose build passkey auth gateway`
Expected: images build.
Run: `docker compose up -d passkey && docker compose logs passkey | tail -20`
Expected: logs show `passkey: applying migrations` then `passkey: serving gRPC addr=[::]:9008`; `passkey_credentials` table created.

- [ ] **Step 4: Restart the stack + verify wiring**

Run: `docker compose up -d --build`
Expected: all services healthy. Verify the passkey login begin endpoint responds:
Run: `curl -s -XPOST http://localhost:8080/api/auth/passkey/login/begin | head -c 200`
Expected: JSON `{"optionsJson":"{...}","flowId":"..."}` (a real challenge; proves auth→passkey gRPC works).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(deploy): passkey-service in compose, wired to gateway + auth"
```

---

## Phase 5 — frontend

> Uses `@github/webauthn-json` for spec-correct base64url⇄ArrayBuffer handling. Its `create()`/`get()` take the server's options JSON (parsed) and return a JSON-serializable credential.

### Task 5.1: Dependency + WebAuthn browser helper

**Files:**
- Modify: `frontend/package.json` (add `@github/webauthn-json`)
- Create: `frontend/src/auth/infrastructure/webauthn.ts`
- Test: `frontend/src/auth/infrastructure/webauthn.test.ts`

**Interfaces produced:** `isPasskeySupported(): boolean`, `createCredential(optionsJson: string): Promise<string>`, `getAssertion(optionsJson: string): Promise<string>` (each returns the credential/assertion serialized back to JSON string for the server).

- [ ] **Step 1: Add dep**

Run: `cd frontend && yarn add @github/webauthn-json`
Expected: added to dependencies; `yarn.lock` updated.

- [ ] **Step 2: `webauthn.ts`**

```ts
import { create, get } from "@github/webauthn-json";

// isPasskeySupported reports whether the browser exposes WebAuthn.
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

// createCredential runs the registration ceremony and returns the attestation
// serialized as JSON for the server to verify.
export async function createCredential(optionsJson: string): Promise<string> {
  const publicKey = JSON.parse(optionsJson).publicKey ?? JSON.parse(optionsJson);
  const credential = await create({ publicKey });
  return JSON.stringify(credential);
}

// getAssertion runs the discoverable-login ceremony and returns the assertion
// serialized as JSON for the server to verify.
export async function getAssertion(optionsJson: string): Promise<string> {
  const publicKey = JSON.parse(optionsJson).publicKey ?? JSON.parse(optionsJson);
  const assertion = await get({ publicKey });
  return JSON.stringify(assertion);
}
```

> The server (go-webauthn) emits `{"publicKey": {...}}` from `protocol.CredentialCreation`/`CredentialAssertion`. The `?? ` fallback tolerates either shape. Confirm against a real begin response during Task 5's manual test and drop the fallback if unneeded.

- [ ] **Step 3: Test the option-unwrapping** (pure, no browser API) — `webauthn.test.ts`. Since `create`/`get` need a real authenticator, unit-test only `isPasskeySupported` guard behavior and the JSON unwrap by extracting the unwrap into a tiny exported helper if desired. Minimal check:

```ts
import { isPasskeySupported } from "./webauthn";

test("isPasskeySupported is false without window.PublicKeyCredential", () => {
  expect(isPasskeySupported()).toBe(false); // jsdom has no PublicKeyCredential
});
```

(If the repo has no JS test runner configured, skip the test file — the ceremony is exercised end-to-end in Task 5.5's manual verification. Do not add a test framework just for this; YAGNI.)

- [ ] **Step 4: Lint**

Run: `cd frontend && yarn lint`
Expected: PASS (no `max-lines` violation; file is small).

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/yarn.lock frontend/src/auth/infrastructure/webauthn.ts
git commit -m "feat(web): webauthn browser helper + @github/webauthn-json"
```

### Task 5.2: passkey gateway (frontend infrastructure)

**Files:**
- Create: `frontend/src/auth/infrastructure/passkey-gateway.ts`

**Interfaces produced:** `beginRegistration()`, `finishRegistration(flowId, credentialJson, name)`, `listPasskeys()`, `deletePasskey(id)`, `loginBegin()`, `loginFinish(flowId, assertionJson)` — the authenticated ones via `http*` (catch-all proxy), the login ones via the dedicated BFF routes (Task 5.3).

```ts
import { httpGet, httpPost, httpDelete } from "@/shared/infrastructure/http/client";

export interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
}

interface BeginResponse {
  optionsJson: string;
  flowId: string;
}

// Authenticated — routed through the /api/[...path] proxy (cookie→bearer).
export function beginRegistration(): Promise<BeginResponse> {
  return httpPost<BeginResponse>("/api/auth/passkey/register/begin");
}

export function finishRegistration(flowId: string, credentialJson: string, name: string): Promise<Passkey> {
  return httpPost<Passkey>("/api/auth/passkey/register/finish", { flowId, credentialJson, name });
}

export async function listPasskeys(): Promise<Passkey[]> {
  const r = await httpGet<{ credentials?: Passkey[] }>("/api/auth/passkey/credentials");
  return r.credentials ?? [];
}

export function deletePasskey(id: string): Promise<void> {
  return httpDelete(`/api/auth/passkey/credentials/${encodeURIComponent(id)}`);
}

// Public login — dedicated BFF routes that set the session cookie on finish.
export function loginBegin(): Promise<BeginResponse> {
  return httpPost<BeginResponse>("/api/auth/passkey/login/begin");
}

export function loginFinish(flowId: string, assertionJson: string): Promise<void> {
  return httpPost<void>("/api/auth/passkey/login/finish", { flowId, assertionJson });
}
```

- [ ] **Step 1: Write the file. Step 2:** `yarn lint` → PASS. **Step 3:** `git commit -m "feat(web): passkey gateway"`.

### Task 5.3: BFF login routes (cookie-setting)

**Files:**
- Create: `frontend/src/app/api/auth/passkey/login/begin/route.ts`
- Create: `frontend/src/app/api/auth/passkey/login/finish/route.ts`

- [ ] **Step 1: `begin/route.ts`** (public passthrough; no cookie)

```ts
import { gatewayUrl } from "@/auth/infrastructure/session-cookie";

export async function POST(): Promise<Response> {
  const res = await fetch(gatewayUrl("/api/auth/passkey/login/begin"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
```

- [ ] **Step 2: `finish/route.ts`** (mirrors `/api/auth/login/2fa/route.ts` — sets the session cookie)

```ts
import { gatewayUrl, setSession } from "@/auth/infrastructure/session-cookie";

export async function POST(req: Request): Promise<Response> {
  const { flowId, assertionJson } = await req.json();
  const res = await fetch(gatewayUrl("/api/auth/passkey/login/finish"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flowId, assertionJson }),
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

- [ ] **Step 3:** `yarn lint` → PASS. **Step 4:** `git commit -m "feat(web): passkey login BFF routes"`.

### Task 5.4: "Sign in with passkey" button on the login form

**Files:**
- Modify: `frontend/src/auth/presentation/login/login-form.tsx`

- [ ] **Step 1: Add a passkey handler + button** to the `creds` step. Insert the handler:

```tsx
  async function signInWithPasskey() {
    setBusy(true); setError("");
    try {
      const { loginBegin, loginFinish } = await import("@/auth/infrastructure/passkey-gateway");
      const { getAssertion } = await import("@/auth/infrastructure/webauthn");
      const { optionsJson, flowId } = await loginBegin();
      const assertionJson = await getAssertion(optionsJson);
      await loginFinish(flowId, assertionJson);
      window.location.assign(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Passkey sign-in failed");
    } finally { setBusy(false); }
  }
```

Render below the password submit button, in the `creds` form:

```tsx
          <button type="button" onClick={signInWithPasskey} disabled={busy}
            className="cursor-pointer rounded-full border border-white/20 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-white/[0.08] disabled:opacity-50">
            {busy ? "…" : "Sign in with passkey"}
          </button>
```

> If the 200-line cap is hit, extract the passkey handler into a small hook `usePasskeyLogin(next)` under `src/auth/application/`. Check with `yarn lint` after editing.

- [ ] **Step 2:** `yarn lint` → PASS. **Step 3:** `git commit -m "feat(web): sign in with passkey button"`.

### Task 5.5: Passkeys account section + wiring; end-to-end verify

**Files:**
- Create: `frontend/src/auth/presentation/account/passkeys-section.tsx`
- Modify: `frontend/src/app/account/page.tsx` (render `<PasskeysSection />`)

- [ ] **Step 1: `passkeys-section.tsx`** (client component; mirrors `two-factor-section.tsx` card/button idioms)

```tsx
"use client";

import { useEffect, useState } from "react";
import { listPasskeys, beginRegistration, finishRegistration, deletePasskey, type Passkey } from "@/auth/infrastructure/passkey-gateway";
import { createCredential, isPasskeySupported } from "@/auth/infrastructure/webauthn";
import { notify } from "@/shared/presentation/toast/use-toast";

const cardCls = "flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur";

export default function PasskeysSection() {
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const supported = isPasskeySupported();

  useEffect(() => { listPasskeys().then(setKeys).catch(() => {}); }, []);

  async function add() {
    setBusy(true);
    try {
      const { optionsJson, flowId } = await beginRegistration();
      const credentialJson = await createCredential(optionsJson);
      const name = window.prompt("Name this passkey", "My device") || "Passkey";
      const created = await finishRegistration(flowId, credentialJson, name);
      setKeys((k) => [created, ...k]);
      notify.success("Passkey added");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not add passkey");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    try {
      await deletePasskey(id);
      setKeys((k) => k.filter((x) => x.id !== id));
      notify.success("Passkey removed");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not remove passkey");
    }
  }

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Passkeys</p>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-400">{keys.length}</span>
      </div>
      {!supported ? (
        <p className="text-sm text-neutral-400">This browser doesn&apos;t support passkeys.</p>
      ) : (
        <>
          {keys.length ? (
            <ul className="flex flex-col gap-2">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{k.name}</p>
                    <p className="text-[11px] text-neutral-500">Added {k.createdAt.slice(0, 10)}{k.lastUsedAt ? ` · last used ${k.lastUsedAt.slice(0, 10)}` : ""}</p>
                  </div>
                  <button type="button" onClick={() => remove(k.id)} className="cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/20">Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-400">No passkeys yet. Add one for one-tap sign-in.</p>
          )}
          <button type="button" disabled={busy} onClick={add} className="cursor-pointer self-start rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200 disabled:bg-white/30">{busy ? "…" : "Add passkey"}</button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render in `account/page.tsx`** — add the import and place `<PasskeysSection />` after `<TwoFactorSection ... />`.

```tsx
import PasskeysSection from "@/auth/presentation/account/passkeys-section";
...
        <TwoFactorSection initiallyEnabled={p.totpEnabled} />
        <PasskeysSection />
```

- [ ] **Step 3: Lint + build**

Run: `cd frontend && yarn lint && yarn build`
Expected: PASS (no `max-lines` violations).

- [ ] **Step 4: End-to-end manual verification** (the real proof — WebAuthn can't be fully unit-tested)

Run: `docker compose up -d --build` and `cd frontend && yarn dev` (RP ID `localhost` matches `http://localhost:3000`).
1. Log in with password → `/account` → **Add passkey** → complete the platform prompt (Touch ID / Windows Hello / virtual authenticator) → the key appears in the list.
2. Log out. On `/login` click **Sign in with passkey** → pick the account in the browser sheet → lands signed in at `/`.
3. Confirm a user WITH TOTP enabled still signs in via passkey WITHOUT a TOTP prompt (skip-TOTP requirement).
4. Remove the passkey from `/account` → it disappears; a subsequent passkey sign-in offers no credential.

Expected: all four behave as described. Capture the result.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth/presentation/account/passkeys-section.tsx frontend/src/app/account/page.tsx
git commit -m "feat(web): passkeys account section"
```

---

## Cross-cutting: final review

- [ ] **Run `/code-review`** on the full branch diff (high effort) — backend Go + frontend. Address correctness findings.
- [ ] **Run `/ponytail-review`** — hunt for over-engineering introduced across the ~40 new files; delete anything speculative.
- [ ] **Verify** the deploy note for prod RP config lands in the deploy runbook (env `PASSKEY_RP_ID=andrey.vbncursed.fun`, `PASSKEY_RP_ORIGINS=https://andrey.vbncursed.fun`), since compose ships the `localhost` dev values.

---

## Spec coverage check

| Spec requirement | Task(s) |
| --- | --- |
| Separate passkey-service, mirrors twofa | 1.1–1.6 |
| Never mints a session; auth mints | 1.4 (FinishLogin→user_id), 2.2 (issue) |
| Usernameless / discoverable credentials | 0.1 proto, 1.3 (resident key), 1.4 BeginLogin |
| Postgres `passkey_credentials` schema | 1.1 |
| Redis ceremony state, TTL, DB 3 | 1.3, 1.1 config, 4.1 |
| RP config env (RPID/origins/name) | 1.1 config, 4.1 |
| gRPC surface (reg/list/delete + login) | 0.1, 1.6 |
| auth PasskeyLoginBegin/Finish + status gate | 2.2, 2.3 |
| Passkey login skips TOTP | 2.2 (no twofa call in the path) |
| gateway routes (authed reg/list/delete; public login) | 3.3 |
| openapi paths under auth tag | 3.4 |
| Login form passkey button | 5.4 |
| Account Passkeys section (create/list/delete) | 5.5 |
| Only two new BFF routes (login begin/finish) | 5.3 |
| `@github/webauthn-json` frontend | 5.1 |
| Sign-count regression rejected | 1.4 (CloneWarning) |
| No user enumeration (empty allowCredentials) | 1.4 BeginLogin (discoverable) |
| Security tests (finish-login, status gate) | 1.4, 2.2 |
| Compose service + wiring | 4.1 |
