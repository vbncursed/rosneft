# Auth Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend `auth-service` (gRPC + Postgres + Redis) with admin-created users, multi-role RBAC, optional TOTP 2FA, account freeze/soft-delete, and full gateway wiring (auth endpoints + middleware protecting existing routes).

**Architecture:** New Go module `services/auth-service` mirroring `catalog-service` (cobra/viper config → bootstrap DI → pgxpool storage → service layer → grpcapi transport, goose migrations embedded). Sessions are opaque tokens in Redis (instant revocation); users/roles/permissions live in Postgres. The gateway dials auth over gRPC, exposes `/api/auth/*` as plain chi handlers, and runs an auth middleware over the existing `/api` JSON group.

**Tech Stack:** Go 1.26.4, `jackc/pgx/v5`, `pressly/goose/v3`, `redis/go-redis/v9`, `google.golang.org/grpc`, `golang.org/x/crypto` (argon2id), `pquerna/otp` (TOTP), `gojuno/minimock/v3` (mocks), `testify/suite` + `gotest.tools/v3/assert`, `go-chi/chi/v5` (gateway). Build with `buf` for proto.

## Global Constraints

- **Go 1.26.4** — use modern idioms: `errors.AsType[T]`, `t.Context()` in tests, `new(val)`, `for i := range n`, `slices`/`maps`, `wg.Go`. Copy verbatim from catalog where shown.
- **File size cap: 200 lines** (skipBlankLines, skipComments). One concern per file. Split when a file grows.
- **Module path:** `github.com/vbncursed/rosneft/backend/services/auth-service`.
- **Proto import:** `authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"`.
- **Entry-point file convention:** `storage/<aggregate>/store.go` holds struct(+pool)+constructor+shared helpers; `models.go` holds row structs + column constants; one query per file. `service/<area>/<area>.go` declares the consumer-side store interface + service struct + constructor; one method per file; minimock mocks in sibling `mocks/`.
- **Errors:** sentinels in `domain/errors.go`; wrap with `fmt.Errorf("ctx: %w: detail", domain.ErrX)`; lowercase, no trailing punctuation. Transport maps sentinels to gRPC codes via a central `mapError`.
- **No new infra services beyond `auth`** — reuse the existing Postgres (new `auth` database) and Redis.
- **Tests:** `testify/suite` grouping + `gotest.tools/v3/assert`; mocks via minimock; no external deps in unit tests (no testcontainers).
- **DB:** parameterized `$1..$N` only; `errors.Is(err, pgx.ErrNoRows)` → domain not-found; `errors.AsType[*pgconn.PgError]` for unique violations (SQLSTATE `23505`); `defer rows.Close()` after `Query`.
- **Security (never simplified):** argon2id for passwords; `crypto/rand` for all tokens/secrets; `crypto/subtle.ConstantTimeCompare` for token/code comparison; AES-GCM for `totp_secret` at rest; recovery codes and passwords stored only as hashes.
- **All work in branch `feat/auth-service`** (create from `main` in Task 0.1).

---

## Phase 0 — Module scaffold & gRPC skeleton

### Task 0.1: Proto contract `auth.proto` + generate

**Files:**
- Create: `backend/proto/rosneft/auth/v1/auth.proto`
- Generated (by buf): `backend/proto/gen/go/rosneft/auth/v1/auth.pb.go`, `auth_grpc.pb.go`

**Interfaces:**
- Produces: `authv1` package with `AuthServiceServer`/`AuthServiceClient`, messages used by every later phase. Exact RPC + message field names below are authoritative.

- [ ] **Step 1: Branch**

```bash
cd /Users/vbncursed/programming/rosneft
git checkout main && git checkout -b feat/auth-service
```

- [ ] **Step 2: Write `backend/proto/rosneft/auth/v1/auth.proto`**

```protobuf
syntax = "proto3";

package rosneft.auth.v1;

option go_package = "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1;authv1";

import "google/protobuf/timestamp.proto";

// AuthService owns users, roles, permissions, sessions, and 2FA. Sessions
// are opaque tokens stored in Redis; everything else in Postgres. The gateway
// is the only caller.
service AuthService {
  // --- session / login ---
  rpc Login(LoginRequest) returns (LoginResponse);
  rpc LoginVerify2FA(LoginVerify2FARequest) returns (LoginResponse);
  rpc Logout(LogoutRequest) returns (LogoutResponse);
  rpc ValidateToken(ValidateTokenRequest) returns (ValidateTokenResponse);

  // --- self ---
  rpc GetMe(GetMeRequest) returns (User);
  rpc ChangePassword(ChangePasswordRequest) returns (ChangePasswordResponse);
  rpc Setup2FA(Setup2FARequest) returns (Setup2FAResponse);
  rpc Enable2FA(Enable2FARequest) returns (Enable2FAResponse);
  rpc Disable2FA(Disable2FARequest) returns (Disable2FAResponse);

  // --- user admin ---
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc GetUser(GetUserRequest) returns (User);
  rpc UpdateUser(UpdateUserRequest) returns (User);
  rpc FreezeUser(FreezeUserRequest) returns (User);
  rpc UnfreezeUser(UnfreezeUserRequest) returns (User);
  rpc SoftDeleteUser(SoftDeleteUserRequest) returns (SoftDeleteUserResponse);
  rpc RestoreUser(RestoreUserRequest) returns (User);

  // --- roles / permissions ---
  rpc ListRoles(ListRolesRequest) returns (ListRolesResponse);
  rpc CreateRole(CreateRoleRequest) returns (Role);
  rpc UpdateRole(UpdateRoleRequest) returns (Role);
  rpc DeleteRole(DeleteRoleRequest) returns (DeleteRoleResponse);
  rpc SetRolePermissions(SetRolePermissionsRequest) returns (Role);
  rpc ListPermissions(ListPermissionsRequest) returns (ListPermissionsResponse);
}

message User {
  string id = 1;
  string email = 2;
  string username = 3;
  string status = 4;            // active|frozen|deleted
  bool totp_enabled = 5;
  repeated string role_slugs = 6;
  repeated string permissions = 7;
  google.protobuf.Timestamp created_at = 8;
  google.protobuf.Timestamp updated_at = 9;
}

message Role {
  string slug = 1;
  string title = 2;
  bool is_system = 3;
  repeated string permission_slugs = 4;
}

message Permission {
  string slug = 1;
  string description = 2;
}

message LoginRequest { string identifier = 1; string password = 2; }
// LoginResponse carries a session token on success, OR a challenge when 2FA
// is required (token empty, two_factor_required=true, challenge_token set).
message LoginResponse {
  string token = 1;
  bool two_factor_required = 2;
  string challenge_token = 3;
}
message LoginVerify2FARequest { string challenge_token = 1; string code = 2; }

message LogoutRequest { string token = 1; }
message LogoutResponse {}

message ValidateTokenRequest { string token = 1; }
message ValidateTokenResponse {
  string user_id = 1;
  repeated string permissions = 2;
}

message GetMeRequest { string token = 1; }
message ChangePasswordRequest { string token = 1; string old_password = 2; string new_password = 3; }
message ChangePasswordResponse {}

message Setup2FARequest { string token = 1; }
message Setup2FAResponse { string secret = 1; string otpauth_url = 2; }
message Enable2FARequest { string token = 1; string code = 2; }
message Enable2FAResponse { repeated string recovery_codes = 1; }
message Disable2FARequest { string token = 1; string code = 2; }
message Disable2FAResponse {}

message CreateUserRequest {
  string email = 1;
  string username = 2;
  string password = 3;
  repeated string role_slugs = 4;
}
message ListUsersRequest { string status = 1; bool include_deleted = 2; }
message ListUsersResponse { repeated User users = 1; }
message GetUserRequest { string id = 1; }
message UpdateUserRequest {
  string id = 1;
  repeated string role_slugs = 2;  // replaces the user's roles when set
  string email = 3;                // empty = unchanged
  string username = 4;             // empty = unchanged
}
message FreezeUserRequest { string actor_id = 1; string id = 2; }
message UnfreezeUserRequest { string id = 1; }
message SoftDeleteUserRequest { string actor_id = 1; string id = 2; }
message SoftDeleteUserResponse {}
message RestoreUserRequest { string id = 1; }

message ListRolesRequest {}
message ListRolesResponse { repeated Role roles = 1; }
message CreateRoleRequest { string slug = 1; string title = 2; repeated string permission_slugs = 3; }
message UpdateRoleRequest { string slug = 1; string title = 2; }
message DeleteRoleRequest { string slug = 1; }
message DeleteRoleResponse {}
message SetRolePermissionsRequest { string slug = 1; repeated string permission_slugs = 2; }
message ListPermissionsRequest {}
message ListPermissionsResponse { repeated Permission permissions = 1; }
```

- [ ] **Step 3: Generate**

Run: `cd backend && make proto-gen`
Expected: creates `backend/proto/gen/go/rosneft/auth/v1/auth.pb.go` and `auth_grpc.pb.go`, no errors.

- [ ] **Step 4: Verify proto module compiles**

Run: `cd backend/proto && go build ./...`
Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add backend/proto/rosneft/auth backend/proto/gen/go/rosneft/auth
git commit -m "feat(auth): proto contract for auth-service"
```

### Task 0.2: Module skeleton — go.mod, config, logger, main

**Files:**
- Create: `backend/services/auth-service/go.mod`
- Modify: `backend/go.work` (add `./services/auth-service`)
- Create: `backend/services/auth-service/internal/config/config.go`
- Create: `backend/services/auth-service/internal/bootstrap/logger.go`
- Create: `backend/services/auth-service/cmd/auth/main.go`

**Interfaces:**
- Produces: `config.Config` with fields `GRPCAddr, DBDSN, RedisAddr, RedisDB, SecretKey, SessionIdleTTL, SessionAbsoluteTTL, Pending2FATTL, LoginMaxFails, LoginLockTTL, BootstrapEmail, BootstrapUsername, BootstrapPassword, LogLevel, LogFormat, AutoMigrate, ShutdownTimeout`; `config.Load(cmd) (Config, error)`; `(Config).Validate() error`; `bootstrap.InitLogger(cfg) *slog.Logger`.

- [ ] **Step 1: Write `backend/services/auth-service/go.mod`**

```
module github.com/vbncursed/rosneft/backend/services/auth-service

go 1.26.4

require (
	github.com/jackc/pgx/v5 v5.10.0
	github.com/pquerna/otp v1.5.0
	github.com/pressly/goose/v3 v3.27.1
	github.com/redis/go-redis/v9 v9.21.0
	github.com/spf13/cobra v1.10.2
	github.com/spf13/viper v1.21.0
	github.com/stretchr/testify v1.11.1
	github.com/vbncursed/rosneft/backend/pkg v0.0.0
	github.com/vbncursed/rosneft/backend/proto v0.0.0
	golang.org/x/crypto v0.45.0
	google.golang.org/grpc v1.81.1
	google.golang.org/protobuf v1.36.11
	gotest.tools/v3 v3.5.2
)

require (
	github.com/vbncursed/rosneft/backend/pkg v0.0.0 => ../../pkg
	github.com/vbncursed/rosneft/backend/proto v0.0.0 => ../../proto
)
```

Note: the `replace`-style local deps are provided by `go.work`; if `go mod tidy` complains, remove the second `require` block — the workspace resolves `pkg`/`proto`. Add the minimock tool dep in Task 6.1.

- [ ] **Step 2: Add module to `backend/go.work`**

```
go 1.26.4

use (
	./pkg
	./proto
	./services/asset-service
	./services/auth-service
	./services/catalog-service
	./services/gateway-service
	./services/mesh-service
	./services/upload-service
)
```

- [ ] **Step 3: Write `internal/config/config.go`** (mirror catalog config; add auth knobs)

```go
// Package config builds the auth service configuration via Viper, layered as
// flag > env (AUTH_*) > default.
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
	GRPCAddr           string        `mapstructure:"grpc-addr"`
	DBDSN              string        `mapstructure:"db-dsn"`
	RedisAddr          string        `mapstructure:"redis-addr"`
	RedisDB            int           `mapstructure:"redis-db"`
	SecretKey          string        `mapstructure:"secret-key"` // 32-byte hex/base64 for AES-GCM of totp secrets
	SessionIdleTTL     time.Duration `mapstructure:"session-idle-ttl"`
	SessionAbsoluteTTL time.Duration `mapstructure:"session-absolute-ttl"`
	Pending2FATTL      time.Duration `mapstructure:"pending-2fa-ttl"`
	LoginMaxFails      int           `mapstructure:"login-max-fails"`
	LoginLockTTL       time.Duration `mapstructure:"login-lock-ttl"`
	BootstrapEmail     string        `mapstructure:"bootstrap-email"`
	BootstrapUsername  string        `mapstructure:"bootstrap-username"`
	BootstrapPassword  string        `mapstructure:"bootstrap-password"`
	LogLevel           string        `mapstructure:"log-level"`
	LogFormat          string        `mapstructure:"log-format"`
	AutoMigrate        bool          `mapstructure:"auto-migrate"`
	ShutdownTimeout    time.Duration `mapstructure:"shutdown-timeout"`
}

const envPrefix = "AUTH"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("grpc-addr", ":9004")
	v.SetDefault("redis-addr", "redis:6379")
	v.SetDefault("redis-db", 1)
	v.SetDefault("session-idle-ttl", 24*time.Hour)
	v.SetDefault("session-absolute-ttl", 720*time.Hour)
	v.SetDefault("pending-2fa-ttl", 5*time.Minute)
	v.SetDefault("login-max-fails", 5)
	v.SetDefault("login-lock-ttl", 15*time.Minute)
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

- [ ] **Step 4: Write `internal/bootstrap/logger.go`** (verbatim from catalog, swap package doc + module path)

```go
// Package bootstrap wires the auth service together. One Init function per
// file; lifecycle entry points (RunServe, RunMigrate*) live alongside the
// components they drive.
package bootstrap

import (
	"log/slog"
	"os"

	pkglogger "github.com/vbncursed/rosneft/backend/pkg/logger"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
)

// InitLogger builds the process-wide structured logger and installs it as the
// slog default.
func InitLogger(cfg config.Config) *slog.Logger {
	logger := pkglogger.New(os.Stdout, pkglogger.Config{Level: cfg.LogLevel, Format: cfg.LogFormat})
	slog.SetDefault(logger)
	return logger
}
```

- [ ] **Step 5: Write `cmd/auth/main.go`** (mirror catalog main; flags for the new knobs)

```go
// Command auth is the gRPC service that owns users, roles, permissions,
// sessions, and 2FA. Wiring lives in internal/bootstrap.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
)

func main() {
	if err := newRootCmd().ExecuteContext(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "auth",
		Short:         "Rosneft auth service",
		Long:          "gRPC service that owns users, roles, permissions, sessions, and 2FA.",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          runServe,
	}
	flags := cmd.PersistentFlags()
	flags.String("grpc-addr", ":9004", "gRPC listen address")
	flags.String("db-dsn", "", "PostgreSQL DSN (or set AUTH_DB_DSN)")
	flags.String("redis-addr", "redis:6379", "Redis address")
	flags.Int("redis-db", 1, "Redis logical DB")
	flags.String("secret-key", "", "32-byte key (hex or base64) for TOTP secret encryption")
	flags.Duration("session-idle-ttl", 24*time.Hour, "session idle timeout")
	flags.Duration("session-absolute-ttl", 720*time.Hour, "session absolute max lifetime")
	flags.Duration("pending-2fa-ttl", 5*time.Minute, "2FA challenge lifetime")
	flags.Int("login-max-fails", 5, "failed logins before lockout")
	flags.Duration("login-lock-ttl", 15*time.Minute, "login lockout duration")
	flags.String("bootstrap-email", "", "first-admin email (created if no admin exists)")
	flags.String("bootstrap-username", "", "first-admin username")
	flags.String("bootstrap-password", "", "first-admin password")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
	flags.Bool("auto-migrate", true, "run goose migrations on startup")
	flags.Duration("shutdown-timeout", 15*time.Second, "graceful shutdown timeout")

	cmd.AddCommand(
		&cobra.Command{Use: "serve", Short: "Start the gRPC server (default)", RunE: runServe},
		subCmd("migrate-up", "Apply pending migrations", bootstrap.RunMigrateUp),
		subCmd("migrate-down", "Roll back the most recent migration", bootstrap.RunMigrateDown),
		subCmd("migrate-status", "Print migration status", bootstrap.RunMigrateStatus),
	)
	return cmd
}

func subCmd(use, short string, fn func(context.Context, config.Config) error) *cobra.Command {
	return &cobra.Command{Use: use, Short: short, RunE: func(cmd *cobra.Command, _ []string) error {
		cfg, err := loadCfg(cmd)
		if err != nil {
			return err
		}
		return fn(cmd.Context(), cfg)
	}}
}

func runServe(cmd *cobra.Command, _ []string) error {
	cfg, err := loadCfg(cmd)
	if err != nil {
		return err
	}
	return bootstrap.RunServe(cmd.Context(), cfg)
}

func loadCfg(cmd *cobra.Command) (config.Config, error) {
	cfg, err := config.Load(cmd)
	if err != nil {
		return config.Config{}, err
	}
	if err := cfg.Validate(); err != nil {
		return config.Config{}, err
	}
	return cfg, nil
}
```

- [ ] **Step 6: Sync workspace** — `cd backend && go work sync` (downloads otp, go-redis, x/crypto). Expected: no error. `main.go` won't build yet (bootstrap.Run* defined in Phase 1/0.3); that's fine.

- [ ] **Step 7: Commit**

```bash
git add backend/go.work backend/services/auth-service/go.mod backend/services/auth-service/internal/config backend/services/auth-service/internal/bootstrap/logger.go backend/services/auth-service/cmd
git commit -m "feat(auth): module skeleton, config, logger, main"
```

### Task 0.3: Bootstrap — postgres, redis, serve, gRPC skeleton

**Files:**
- Create: `internal/bootstrap/postgres.go`, `internal/bootstrap/redis.go`, `internal/bootstrap/transport.go`, `internal/bootstrap/serve.go`

**Interfaces:**
- Consumes: `config.Config`, `authv1.AuthService_ServiceDesc`.
- Produces: `bootstrap.InitPostgres(ctx,cfg) (*pgxpool.Pool,error)`, `bootstrap.InitRedis(ctx,cfg) (*redis.Client,error)`, `bootstrap.RunServe(ctx,cfg) error`. The gRPC server registers a placeholder until Phase 7 (`grpcapi.Server`). To keep this task self-contained and compiling, register only health + reflection now; wire the real handler in Task 7.1.

- [ ] **Step 1: Write `internal/bootstrap/postgres.go`** (verbatim from catalog, swap module path)

```go
package bootstrap

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
)

// InitPostgres opens and verifies a pgxpool.Pool. The caller must Close it.
func InitPostgres(ctx context.Context, cfg config.Config) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, cfg.DBDSN)
	if err != nil {
		return nil, fmt.Errorf("bootstrap: pgxpool.New: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("bootstrap: pool ping: %w", err)
	}
	return pool, nil
}
```

- [ ] **Step 2: Write `internal/bootstrap/redis.go`** (mirror mesh-service)

```go
package bootstrap

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
)

// InitRedis opens and verifies a redis.Client. The caller must Close it.
func InitRedis(ctx context.Context, cfg config.Config) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, DB: cfg.RedisDB})
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("bootstrap: redis ping: %w", err)
	}
	return client, nil
}
```

- [ ] **Step 3: Write `internal/bootstrap/transport.go`** (health + reflection only for now)

```go
package bootstrap

import (
	"log/slog"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// InitGRPCServer builds the gRPC server with the standard backend interceptors,
// the health probe (SERVING), and reflection. The AuthService handler is
// registered by the caller (RunServe) once the service layer exists.
func InitGRPCServer(logger *slog.Logger) (*grpc.Server, *health.Server) {
	srv := grpcutil.NewServer(logger)

	healthSrv := health.NewServer()
	healthSrv.SetServingStatus(authv1.AuthService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, healthSrv)

	reflection.Register(srv)
	return srv, healthSrv
}
```

- [ ] **Step 4: Write `internal/bootstrap/serve.go`** (skeleton: migrate → pool → redis → grpc → serve → shutdown; `// TODO Phase 7: register AuthService handler` is replaced in Task 7.1, NOT left as a placeholder in final code)

```go
package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
)

// RunServe is the full lifecycle of `auth serve`.
func RunServe(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("auth: starting", "grpc_addr", cfg.GRPCAddr)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if cfg.AutoMigrate {
		logger.Info("auth: applying migrations")
		if err := RunMigrateUp(rootCtx, cfg); err != nil {
			return fmt.Errorf("migrate up: %w", err)
		}
	}

	pool, err := InitPostgres(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	rdb, err := InitRedis(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer func() { _ = rdb.Close() }()

	grpcSrv, healthSrv := InitGRPCServer(logger)
	// Real AuthService handler + bootstrap-admin wired in Task 7.1 / Task 9.1.

	lis, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", cfg.GRPCAddr, err)
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- grpcSrv.Serve(lis) }()
	logger.Info("auth: serving gRPC", "addr", lis.Addr().String())

	select {
	case <-rootCtx.Done():
		logger.Info("auth: shutdown signal received")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			return fmt.Errorf("grpc serve: %w", err)
		}
	}

	healthSrv.SetServingStatus(authv1.AuthService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_NOT_SERVING)
	stopCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	stopped := make(chan struct{})
	go func() { grpcSrv.GracefulStop(); close(stopped) }()
	select {
	case <-stopped:
		logger.Info("auth: graceful shutdown complete")
	case <-stopCtx.Done():
		logger.Warn("auth: shutdown timeout, forcing stop")
		grpcSrv.Stop()
	}
	return nil
}
```

- [ ] **Step 5: Verify** — won't fully build until Phase 1 supplies `RunMigrateUp`. Proceed to Phase 1, then build at Task 1.1 Step 5. No commit yet (combined with Phase 1).

---

## Phase 1 — Migrations & seed

### Task 1.1: migrate package + init schema

**Files:**
- Create: `internal/migrate/migrate.go`, `up.go`, `down.go`, `status.go`
- Create: `internal/bootstrap/migrate.go`
- Create: `internal/migrate/migrations/00001_init.sql`

**Interfaces:**
- Produces: `migrate.Up/Down/Status(ctx,dsn) error`; `bootstrap.RunMigrateUp/Down/Status(ctx,cfg) error`. Schema tables: `users, roles, permissions, role_permissions, user_roles, recovery_codes`.

- [ ] **Step 1: Write `internal/migrate/migrate.go`** (verbatim from catalog, swap package doc)

```go
// Package migrate runs goose migrations against PostgreSQL using SQL files
// embedded into the binary at compile time.
package migrate

import (
	"database/sql"
	"embed"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib" // registers "pgx" driver for database/sql
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func openDB(dsn string) (*sql.DB, error) {
	if dsn == "" {
		return nil, fmt.Errorf("migrate: empty DSN")
	}
	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return nil, fmt.Errorf("migrate: set dialect: %w", err)
	}
	// auth shares the `andrey` database with catalog; a custom version table
	// keeps the two services' migration histories from colliding.
	goose.SetTableName("auth_goose_db_version")
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("migrate: open db: %w", err)
	}
	return db, nil
}
```

- [ ] **Step 2: Write `up.go`, `down.go`, `status.go`**

```go
// up.go
package migrate

import (
	"context"

	"github.com/pressly/goose/v3"
)

// Up applies all pending migrations.
func Up(ctx context.Context, dsn string) error {
	db, err := openDB(dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	return goose.UpContext(ctx, db, "migrations")
}
```

```go
// down.go
package migrate

import (
	"context"

	"github.com/pressly/goose/v3"
)

// Down rolls back the most recent migration.
func Down(ctx context.Context, dsn string) error {
	db, err := openDB(dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	return goose.DownContext(ctx, db, "migrations")
}
```

```go
// status.go
package migrate

import (
	"context"

	"github.com/pressly/goose/v3"
)

// Status prints the migration status.
func Status(ctx context.Context, dsn string) error {
	db, err := openDB(dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	return goose.StatusContext(ctx, db, "migrations")
}
```

- [ ] **Step 3: Write `internal/bootstrap/migrate.go`**

```go
package bootstrap

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/migrate"
)

func RunMigrateUp(ctx context.Context, cfg config.Config) error     { return migrate.Up(ctx, cfg.DBDSN) }
func RunMigrateDown(ctx context.Context, cfg config.Config) error   { return migrate.Down(ctx, cfg.DBDSN) }
func RunMigrateStatus(ctx context.Context, cfg config.Config) error { return migrate.Status(ctx, cfg.DBDSN) }
```

- [ ] **Step 4: Write `internal/migrate/migrations/00001_init.sql`**

```sql
-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE TABLE roles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       TEXT UNIQUE NOT NULL,
    title      TEXT NOT NULL,
    is_system  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         CITEXT UNIQUE NOT NULL,
    username      CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','deleted')),
    totp_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    totp_secret   BYTEA,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE recovery_codes (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at   TIMESTAMPTZ
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes(user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE recovery_codes;
DROP TABLE user_roles;
DROP TABLE users;
DROP TABLE role_permissions;
DROP TABLE permissions;
DROP TABLE roles;
-- +goose StatementEnd
```

- [ ] **Step 5: Build the module**

Run: `cd backend/services/auth-service && go build ./...`
Expected: builds (main wired through serve→migrate). No output.

- [ ] **Step 6: Apply migration against the shared `andrey` DB and verify**

Run (auth shares `andrey`, isolated by the `auth_goose_db_version` table):
```bash
cd backend/services/auth-service && AUTH_DB_DSN="postgres://andrey:andrey@localhost:5432/andrey?sslmode=disable" AUTH_SECRET_KEY=$(openssl rand -hex 32) go run ./cmd/auth migrate-up
```
Expected: goose logs `OK 00001_init.sql`. (If compose isn't running, skip — re-verified in Phase 9.)

### Task 1.2: Seed roles + permissions

**Files:**
- Create: `internal/migrate/migrations/00002_seed_roles_permissions.sql`

- [ ] **Step 1: Write the seed migration** (permission catalog + 4 system roles + bindings from the spec)

```sql
-- +goose Up
-- +goose StatementBegin
INSERT INTO permissions (slug, description) VALUES
    ('territory:read','read territories'),
    ('territory:write','create/update territories'),
    ('territory:delete','delete territories'),
    ('model:read','read models'),
    ('model:write','create/update models'),
    ('model:delete','delete models'),
    ('placement:read','read placements'),
    ('placement:write','create/update placements'),
    ('placement:delete','delete placements'),
    ('panorama:read','read panoramas'),
    ('panorama:write','create/update panoramas'),
    ('panorama:delete','delete panoramas'),
    ('upload:create','create chunked uploads'),
    ('users:read','read users'),
    ('users:write','create/update users'),
    ('users:freeze','freeze/unfreeze users'),
    ('users:delete','soft-delete/restore users'),
    ('roles:read','read roles'),
    ('roles:manage','create/update/delete roles and their permissions'),
    ('permissions:read','read the permission catalog');

INSERT INTO roles (slug, title, is_system) VALUES
    ('admin','Administrator',TRUE),
    ('owner','People & Roles Manager',TRUE),
    ('editor','Scene Editor',TRUE),
    ('viewer','Viewer',TRUE);

-- admin: every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.slug = 'admin';

-- owner: people + roles + all reads.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
    p.slug IN ('users:read','users:write','users:freeze','users:delete',
               'roles:read','roles:manage','permissions:read',
               'territory:read','model:read','placement:read','panorama:read')
WHERE r.slug = 'owner';

-- editor: scene work + all reads.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
    p.slug IN ('placement:write','placement:delete','panorama:write','panorama:delete',
               'territory:read','model:read','placement:read','panorama:read')
WHERE r.slug = 'editor';

-- viewer: all reads.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
    p.slug IN ('territory:read','model:read','placement:read','panorama:read')
WHERE r.slug = 'viewer';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions;
DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE is_system);
DELETE FROM roles WHERE is_system;
DELETE FROM permissions;
-- +goose StatementEnd
```

- [ ] **Step 2: Apply + verify counts**

Run (if compose up): `cd backend/services/auth-service && AUTH_DB_DSN="postgres://andrey:andrey@localhost:5432/andrey?sslmode=disable" AUTH_SECRET_KEY=$(openssl rand -hex 32) go run ./cmd/auth migrate-up`
Then: `docker compose -f docker-compose.yml -p andrey exec -T postgres psql -U andrey -d andrey -c "SELECT r.slug, count(*) FROM roles r JOIN role_permissions rp ON rp.role_id=r.id GROUP BY r.slug ORDER BY r.slug;"`
Expected: `admin=20, owner=11, editor=8, viewer=4`.

- [ ] **Step 3: Commit Phases 0.3 + 1**

```bash
git add backend/services/auth-service/internal/bootstrap backend/services/auth-service/internal/migrate
git commit -m "feat(auth): bootstrap (pg/redis/serve/grpc skeleton) + goose migrations & seed"
```

---

## Phase 2 — Domain types & errors

### Task 2.1: Domain model + sentinels

**Files:**
- Create: `internal/domain/user.go`, `role.go`, `permission.go`, `session.go`, `errors.go`

**Interfaces:**
- Produces: `domain.User`, `domain.Role`, `domain.Permission`, `domain.Session`, status constants, and sentinel errors used by every layer.

- [ ] **Step 1: Write `internal/domain/user.go`**

```go
// Package domain contains the auth service's data model — pure Go types, no
// proto, no SQL.
package domain

import "time"

// Account status values.
const (
	StatusActive  = "active"
	StatusFrozen  = "frozen"
	StatusDeleted = "deleted"
)

// User is an account. PasswordHash and TOTPSecret never leave the service
// boundary (transport omits them).
type User struct {
	ID           string
	Email        string
	Username     string
	PasswordHash string
	Status       string
	TOTPEnabled  bool
	TOTPSecret   []byte // AES-GCM ciphertext at rest; nil when 2FA off
	RoleSlugs    []string
	Permissions  []string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    *time.Time
}
```

- [ ] **Step 2: Write `role.go`, `permission.go`, `session.go`**

```go
// role.go
package domain

// Role groups permissions. System roles cannot be deleted via the API.
type Role struct {
	Slug            string
	Title           string
	IsSystem        bool
	PermissionSlugs []string
}
```

```go
// permission.go
package domain

// Permission is a single capability guarding a real endpoint.
type Permission struct {
	Slug        string
	Description string
}
```

```go
// session.go
package domain

import "time"

// Session is the data stored in Redis under session:<token>. Permissions is a
// snapshot taken at login so ValidateToken needs only one Redis GET.
type Session struct {
	UserID         string    `json:"user_id"`
	Permissions    []string  `json:"permissions"`
	Status         string    `json:"status"`
	AbsoluteExpiry time.Time `json:"absolute_expiry"`
}
```

- [ ] **Step 3: Write `errors.go`**

```go
package domain

import "errors"

// Sentinel errors propagated across layers; transport maps each to a status.
var (
	ErrInvalidInput      = errors.New("invalid input")
	ErrUserNotFound      = errors.New("user not found")
	ErrRoleNotFound      = errors.New("role not found")
	ErrPermissionUnknown = errors.New("unknown permission")
	ErrEmailTaken        = errors.New("email already exists")
	ErrUsernameTaken     = errors.New("username already exists")
	ErrRoleSlugTaken     = errors.New("role slug already exists")
	ErrInvalidCredential = errors.New("invalid credentials")
	ErrAccountFrozen     = errors.New("account is frozen")
	ErrAccountDeleted    = errors.New("account is deleted")
	ErrLoginThrottled    = errors.New("too many failed attempts")
	ErrSessionInvalid    = errors.New("session invalid or expired")
	Err2FARequired       = errors.New("2fa required")
	Err2FAInvalidCode    = errors.New("invalid 2fa code")
	Err2FANotEnabled     = errors.New("2fa not enabled")
	Err2FAAlreadyEnabled = errors.New("2fa already enabled")
	ErrSystemRole        = errors.New("system role cannot be modified this way")
	ErrLastAdmin         = errors.New("cannot remove the last admin")
	ErrSelfTarget        = errors.New("cannot perform this action on yourself")
)
```

- [ ] **Step 4: Build + commit**

Run: `cd backend/services/auth-service && go build ./internal/domain/...` → no output.

```bash
git add backend/services/auth-service/internal/domain
git commit -m "feat(auth): domain types and sentinel errors"
```

---

## Phase 3 — Crypto primitives (TDD)

### Task 3.1: Password hashing (argon2id)

**Files:**
- Create: `internal/password/argon2.go`
- Test: `internal/password/argon2_test.go`

**Interfaces:**
- Produces: `password.Hash(plain string) (string, error)`, `password.Verify(plain, encoded string) (bool, error)`. Encoded format is the standard PHC string `$argon2id$v=19$m=...,t=...,p=...$salt$hash` so params live with the hash.

- [ ] **Step 1: Write the failing test**

```go
package password_test

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

func TestHashVerifyRoundTrip(t *testing.T) {
	enc, err := password.Hash("s3cret-pw")
	assert.NilError(t, err)
	assert.Assert(t, enc != "s3cret-pw") // not plaintext

	ok, err := password.Verify("s3cret-pw", enc)
	assert.NilError(t, err)
	assert.Assert(t, ok)

	bad, err := password.Verify("wrong", enc)
	assert.NilError(t, err)
	assert.Assert(t, !bad)
}

func TestHashIsSalted(t *testing.T) {
	a, _ := password.Hash("same")
	b, _ := password.Hash("same")
	assert.Assert(t, a != b) // random salt → different encodings
}
```

- [ ] **Step 2: Run, expect FAIL** — `cd backend/services/auth-service && go test ./internal/password/...` → fails (package not found).

- [ ] **Step 3: Write `internal/password/argon2.go`**

```go
// Package password hashes and verifies passwords with argon2id, encoding
// parameters into a standard PHC string so they travel with the hash.
package password

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	saltLen = 16
	keyLen  = 32
	time_   = 1
	memory  = 64 * 1024
	threads = 4
)

// Hash returns a PHC-encoded argon2id hash of plain.
func Hash(plain string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("password.Hash: read salt: %w", err)
	}
	key := argon2.IDKey([]byte(plain), salt, time_, memory, threads, keyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, memory, time_, threads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

// Verify reports whether plain matches the PHC-encoded hash, using
// constant-time comparison.
func Verify(plain, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, fmt.Errorf("password.Verify: bad encoding")
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false, fmt.Errorf("password.Verify: params: %w", err)
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("password.Verify: salt: %w", err)
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("password.Verify: hash: %w", err)
	}
	got := argon2.IDKey([]byte(plain), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}
```

- [ ] **Step 4: Run, expect PASS** — `go test ./internal/password/... -race` → ok.

- [ ] **Step 5: Commit** — `git add backend/services/auth-service/internal/password && git commit -m "feat(auth): argon2id password hashing"`

### Task 3.2: TOTP + recovery codes (TDD)

**Files:**
- Create: `internal/totp/totp.go`, `internal/totp/recovery.go`
- Test: `internal/totp/totp_test.go`

**Interfaces:**
- Produces:
  - `totp.Generate(issuer, account string) (secret, otpauthURL string, err error)`
  - `totp.Validate(secret, code string) bool`
  - `totp.GenerateAt(secret string, t time.Time) (string, error)` (test helper for deterministic codes)
  - `recovery.Generate(n int) (plain []string, hashes []string, err error)`
  - `recovery.Match(plain string, hashes []string) (idx int, ok bool)` — returns index of the matching unused hash, constant-time per candidate.

- [ ] **Step 1: Write the failing test**

```go
package totp_test

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

func TestTOTPRoundTrip(t *testing.T) {
	secret, url, err := totp.Generate("Rosneft", "ivan")
	assert.NilError(t, err)
	assert.Assert(t, secret != "")
	assert.Assert(t, len(url) > 0)

	code, err := totp.GenerateNow(secret)
	assert.NilError(t, err)
	assert.Assert(t, totp.Validate(secret, code))
	assert.Assert(t, !totp.Validate(secret, "000000"))
}
```

- [ ] **Step 2: Run, expect FAIL** — `go test ./internal/totp/...` → fails.

- [ ] **Step 3: Write `internal/totp/totp.go`** (wrap `pquerna/otp`)

```go
// Package totp wraps pquerna/otp for TOTP secret generation and validation,
// plus one-time recovery codes.
package totp

import (
	"fmt"
	"time"

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

// GenerateNow returns the current code for secret — used to confirm setup.
func GenerateNow(secret string) (string, error) {
	return totp.GenerateCode(secret, time.Now())
}
```

- [ ] **Step 4: Write `internal/totp/recovery.go`**

```go
package totp

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/hex"
	"fmt"
	"strings"
)

// Generate returns n recovery codes (plaintext, shown once) and their SHA-256
// hashes (stored). Codes are 10 base32 chars, grouped as XXXXX-XXXXX.
func Generate(n int) (plain, hashes []string, err error) {
	plain = make([]string, 0, n)
	hashes = make([]string, 0, n)
	for range n {
		buf := make([]byte, 8)
		if _, err = rand.Read(buf); err != nil {
			return nil, nil, fmt.Errorf("recovery.Generate: %w", err)
		}
		raw := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf))[:10]
		code := raw[:5] + "-" + raw[5:]
		plain = append(plain, code)
		hashes = append(hashes, hashCode(code))
	}
	return plain, hashes, nil
}

// Match returns the index of the hash matching plain, or ok=false. Compares in
// constant time per candidate to avoid leaking which code matched via timing.
func Match(plain string, hashes []string) (int, bool) {
	want := hashCode(plain)
	idx, found := -1, false
	for i, h := range hashes {
		if subtle.ConstantTimeCompare([]byte(h), []byte(want)) == 1 {
			idx, found = i, true
		}
	}
	return idx, found
}

func hashCode(code string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(strings.ToLower(code))))
	return hex.EncodeToString(sum[:])
}
```

- [ ] **Step 5: Run, expect PASS** — `go test ./internal/totp/... -race` → ok.

- [ ] **Step 6: Commit** — `git add backend/services/auth-service/internal/totp && git commit -m "feat(auth): TOTP and recovery codes"`

### Task 3.3: Secret encryption (AES-GCM) + token generation (TDD)

**Files:**
- Create: `internal/secret/aesgcm.go`, `internal/secret/token.go`
- Test: `internal/secret/aesgcm_test.go`

**Interfaces:**
- Produces:
  - `secret.NewCipher(key string) (*secret.Cipher, error)` — key is hex (64 chars) or base64 decoding to 32 bytes.
  - `(*Cipher).Encrypt(plain []byte) ([]byte, error)`, `(*Cipher).Decrypt(ct []byte) ([]byte, error)`.
  - `secret.NewToken() (string, error)` — 32 random bytes, base64url, for session/challenge tokens.

- [ ] **Step 1: Write the failing test**

```go
package secret_test

import (
	"strings"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	c, err := secret.NewCipher(strings.Repeat("a", 64)) // 32 bytes hex
	assert.NilError(t, err)

	ct, err := c.Encrypt([]byte("totp-secret"))
	assert.NilError(t, err)
	assert.Assert(t, string(ct) != "totp-secret")

	pt, err := c.Decrypt(ct)
	assert.NilError(t, err)
	assert.Equal(t, string(pt), "totp-secret")
}

func TestNewTokenIsRandomAndURLSafe(t *testing.T) {
	a, err := secret.NewToken()
	assert.NilError(t, err)
	b, _ := secret.NewToken()
	assert.Assert(t, a != b)
	assert.Assert(t, !strings.ContainsAny(a, "+/="))
}
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Write `internal/secret/aesgcm.go`**

```go
// Package secret encrypts TOTP secrets at rest (AES-GCM) and mints random
// opaque tokens.
package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// Cipher encrypts/decrypts with a fixed 32-byte key.
type Cipher struct{ aead cipher.AEAD }

// NewCipher parses key (64-char hex or base64 → 32 bytes) and builds AES-GCM.
func NewCipher(key string) (*Cipher, error) {
	raw, err := decodeKey(key)
	if err != nil {
		return nil, err
	}
	if len(raw) != 32 {
		return nil, fmt.Errorf("secret.NewCipher: key must be 32 bytes, got %d", len(raw))
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, fmt.Errorf("secret.NewCipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("secret.NewCipher: gcm: %w", err)
	}
	return &Cipher{aead: aead}, nil
}

// Encrypt prepends a random nonce to the ciphertext.
func (c *Cipher) Encrypt(plain []byte) ([]byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("secret.Encrypt: nonce: %w", err)
	}
	return c.aead.Seal(nonce, nonce, plain, nil), nil
}

// Decrypt reverses Encrypt.
func (c *Cipher) Decrypt(ct []byte) ([]byte, error) {
	ns := c.aead.NonceSize()
	if len(ct) < ns {
		return nil, fmt.Errorf("secret.Decrypt: ciphertext too short")
	}
	pt, err := c.aead.Open(nil, ct[:ns], ct[ns:], nil)
	if err != nil {
		return nil, fmt.Errorf("secret.Decrypt: %w", err)
	}
	return pt, nil
}

func decodeKey(key string) ([]byte, error) {
	if raw, err := hex.DecodeString(key); err == nil && len(raw) == 32 {
		return raw, nil
	}
	raw, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return nil, fmt.Errorf("secret: key is neither 32-byte hex nor base64: %w", err)
	}
	return raw, nil
}
```

- [ ] **Step 4: Write `internal/secret/token.go`**

```go
package secret

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

// NewToken returns a URL-safe random opaque token (32 bytes of entropy).
func NewToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("secret.NewToken: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
```

- [ ] **Step 5: Run, expect PASS** — `go test ./internal/secret/... -race` → ok.

- [ ] **Step 6: Commit** — `git add backend/services/auth-service/internal/secret && git commit -m "feat(auth): AES-GCM secret encryption and token minting"`

---

## Phase 4 — Storage (Postgres)

### Task 4.1: Users store

**Files:**
- Create: `internal/storage/users/store.go`, `models.go`, `create.go`, `get.go`, `list.go`, `set_status.go`, `set_roles.go`, `change_password.go`, `set_totp.go`, `permissions.go`

**Interfaces:**
- Produces a `users.Store` with methods consumed by services (Task 6). Exact signatures:
  - `New(pool *pgxpool.Pool) *Store`
  - `Create(ctx, u domain.User) (domain.User, error)` — inserts user + role bindings; maps unique violations to `ErrEmailTaken`/`ErrUsernameTaken`.
  - `GetByID(ctx, id string) (domain.User, error)` / `GetByIdentifier(ctx, identifier string) (domain.User, error)` — the latter matches email OR username; both hydrate `RoleSlugs` + `Permissions`.
  - `List(ctx, status string, includeDeleted bool) ([]domain.User, error)`
  - `SetStatus(ctx, id, status string, deletedAt *time.Time) (domain.User, error)`
  - `SetRoles(ctx, id string, roleSlugs []string) (domain.User, error)`
  - `ChangePassword(ctx, id, hash string) error`
  - `SetTOTP(ctx, id string, enabled bool, secret []byte) error`
  - `CountAdmins(ctx, excludeUserID string) (int, error)` — active/frozen admins excluding one id (last-admin guard).
  - `Permissions(ctx, id string) ([]string, error)` — distinct permission slugs across the user's roles.

- [ ] **Step 1: Write `store.go` + `models.go`**

```go
// Package users is the PostgreSQL store for accounts and their role bindings.
// One query per file; this file holds the struct + constructor + shared helpers.
package users

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store is the users persistence adapter.
type Store struct{ pool *pgxpool.Pool }

// New wraps a pgxpool.Pool.
func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const pgUniqueViolation = "23505"

func constraintOf(err error) string {
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == pgUniqueViolation {
		return pgErr.ConstraintName
	}
	return ""
}
```

```go
// models.go
package users

// Column list selected by the scan helpers (see get.go/list.go).
const userColumns = `u.id, u.email, u.username, u.password_hash, u.status,
	u.totp_enabled, u.totp_secret, u.created_at, u.updated_at, u.deleted_at`
```

- [ ] **Step 2: Write `get.go`** (scan + hydration helpers used everywhere)

```go
package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type rowScanner interface{ Scan(dst ...any) error }

func scanUser(r rowScanner) (domain.User, error) {
	var u domain.User
	err := r.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.Status,
		&u.TOTPEnabled, &u.TOTPSecret, &u.CreatedAt, &u.UpdatedAt, &u.DeletedAt)
	return u, err
}

// GetByID returns one user with roles + permissions hydrated.
func (s *Store) GetByID(ctx context.Context, id string) (domain.User, error) {
	const q = `SELECT ` + userColumns + ` FROM users u WHERE u.id = $1`
	u, err := scanUser(s.pool.QueryRow(ctx, q, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.GetByID: %w", err)
	}
	return s.hydrate(ctx, u)
}

// GetByIdentifier matches email OR username (citext = case-insensitive).
func (s *Store) GetByIdentifier(ctx context.Context, identifier string) (domain.User, error) {
	const q = `SELECT ` + userColumns + ` FROM users u WHERE u.email = $1 OR u.username = $1`
	u, err := scanUser(s.pool.QueryRow(ctx, q, identifier))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.GetByIdentifier: %w", err)
	}
	return s.hydrate(ctx, u)
}

func (s *Store) hydrate(ctx context.Context, u domain.User) (domain.User, error) {
	roles, err := s.roleSlugs(ctx, u.ID)
	if err != nil {
		return domain.User{}, err
	}
	perms, err := s.Permissions(ctx, u.ID)
	if err != nil {
		return domain.User{}, err
	}
	u.RoleSlugs, u.Permissions = roles, perms
	return u, nil
}
```

- [ ] **Step 3: Write `permissions.go`** (role slugs + permission slugs)

```go
package users

import (
	"context"
	"fmt"
)

func (s *Store) roleSlugs(ctx context.Context, id string) ([]string, error) {
	const q = `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1 ORDER BY r.slug`
	return s.scanStrings(ctx, q, id)
}

// Permissions returns the distinct permission slugs across all of the user's roles.
func (s *Store) Permissions(ctx context.Context, id string) ([]string, error) {
	const q = `SELECT DISTINCT p.slug
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE ur.user_id = $1 ORDER BY p.slug`
	return s.scanStrings(ctx, q, id)
}

func (s *Store) scanStrings(ctx context.Context, q, arg string) ([]string, error) {
	rows, err := s.pool.Query(ctx, q, arg)
	if err != nil {
		return nil, fmt.Errorf("users.scanStrings: %w", err)
	}
	defer rows.Close()
	out := make([]string, 0, 8)
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, fmt.Errorf("users.scanStrings: scan: %w", err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("users.scanStrings: rows: %w", err)
	}
	return out, nil
}
```

- [ ] **Step 4: Write `create.go`, `list.go`, `set_status.go`, `set_roles.go`, `change_password.go`, `set_totp.go`** (each its own file)

```go
// create.go
package users

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create inserts the user and binds the given role slugs in one transaction.
func (s *Store) Create(ctx context.Context, u domain.User) (domain.User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("users.Create: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	const ins = `INSERT INTO users (email, username, password_hash, status)
		VALUES ($1, $2, $3, 'active') RETURNING id`
	var id string
	if err := tx.QueryRow(ctx, ins, u.Email, u.Username, u.PasswordHash).Scan(&id); err != nil {
		switch constraintOf(err) {
		case "users_email_key":
			return domain.User{}, domain.ErrEmailTaken
		case "users_username_key":
			return domain.User{}, domain.ErrUsernameTaken
		}
		return domain.User{}, fmt.Errorf("users.Create: insert: %w", err)
	}
	if err := bindRoles(ctx, tx, id, u.RoleSlugs); err != nil {
		return domain.User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.User{}, fmt.Errorf("users.Create: commit: %w", err)
	}
	return s.GetByID(ctx, id)
}

// bindRoles resolves role slugs to ids and inserts user_roles rows. Unknown
// slug → ErrRoleNotFound (the FK/lookup fails closed).
func bindRoles(ctx context.Context, tx pgx.Tx, userID string, slugs []string) error {
	for _, slug := range slugs {
		var roleID string
		if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE slug = $1`, slug).Scan(&roleID); err != nil {
			if err == pgx.ErrNoRows {
				return domain.ErrRoleNotFound
			}
			return fmt.Errorf("users.bindRoles: lookup %q: %w", slug, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
			userID, roleID); err != nil {
			return fmt.Errorf("users.bindRoles: insert: %w", err)
		}
	}
	return nil
}
```

```go
// list.go
package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns users filtered by status (empty = any) and, unless
// includeDeleted, hides soft-deleted rows. Roles/permissions are NOT hydrated
// here (list views don't need the per-user permission fan-out).
func (s *Store) List(ctx context.Context, status string, includeDeleted bool) ([]domain.User, error) {
	q := `SELECT ` + userColumns + ` FROM users u WHERE 1=1`
	args := make([]any, 0, 2)
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

```go
// set_status.go
package users

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetStatus updates status and deleted_at, returning the refreshed user.
func (s *Store) SetStatus(ctx context.Context, id, status string, deletedAt *time.Time) (domain.User, error) {
	const q = `UPDATE users SET status = $2, deleted_at = $3, updated_at = now()
		WHERE id = $1 RETURNING id`
	var got string
	if err := s.pool.QueryRow(ctx, q, id, status, deletedAt).Scan(&got); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.SetStatus: %w", err)
	}
	return s.GetByID(ctx, id)
}

// CountAdmins counts active+frozen users holding the admin role, excluding one id.
func (s *Store) CountAdmins(ctx context.Context, excludeUserID string) (int, error) {
	const q = `SELECT count(DISTINCT ur.user_id)
		FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		JOIN users u ON u.id = ur.user_id
		WHERE r.slug = 'admin' AND u.status <> 'deleted' AND ur.user_id <> $1`
	var n int
	if err := s.pool.QueryRow(ctx, q, excludeUserID).Scan(&n); err != nil {
		return 0, fmt.Errorf("users.CountAdmins: %w", err)
	}
	return n, nil
}
```

```go
// set_roles.go
package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetRoles replaces the user's role set with roleSlugs.
func (s *Store) SetRoles(ctx context.Context, id string, roleSlugs []string) (domain.User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("users.SetRoles: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, id); err != nil {
		return domain.User{}, fmt.Errorf("users.SetRoles: clear: %w", err)
	}
	if err := bindRoles(ctx, tx, id, roleSlugs); err != nil {
		return domain.User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.User{}, fmt.Errorf("users.SetRoles: commit: %w", err)
	}
	return s.GetByID(ctx, id)
}
```

```go
// change_password.go
package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// ChangePassword sets a new password hash.
func (s *Store) ChangePassword(ctx context.Context, id, hash string) error {
	const q = `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id`
	var got string
	if err := s.pool.QueryRow(ctx, q, id, hash).Scan(&got); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrUserNotFound
		}
		return fmt.Errorf("users.ChangePassword: %w", err)
	}
	return nil
}
```

```go
// set_totp.go
package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetTOTP sets the enabled flag and encrypted secret (nil secret clears it).
func (s *Store) SetTOTP(ctx context.Context, id string, enabled bool, secret []byte) error {
	const q = `UPDATE users SET totp_enabled = $2, totp_secret = $3, updated_at = now()
		WHERE id = $1 RETURNING id`
	var got string
	if err := s.pool.QueryRow(ctx, q, id, enabled, secret).Scan(&got); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrUserNotFound
		}
		return fmt.Errorf("users.SetTOTP: %w", err)
	}
	return nil
}
```

- [ ] **Step 5: Build + commit** — `go build ./internal/storage/...` → ok. `git add backend/services/auth-service/internal/storage/users && git commit -m "feat(auth): users Postgres store"`

### Task 4.2: Roles, permissions, recovery stores

**Files:**
- Create: `internal/storage/roles/store.go`, `list.go`, `create.go`, `update.go`, `delete.go`, `set_permissions.go`
- Create: `internal/storage/permissions/store.go`, `list.go`
- Create: `internal/storage/recovery/store.go`

**Interfaces:**
- Produces:
  - `roles.New(pool) *Store` with `List(ctx) ([]domain.Role,error)`, `Get(ctx, slug) (domain.Role,error)`, `Create(ctx, domain.Role) (domain.Role,error)`, `UpdateTitle(ctx, slug, title) (domain.Role,error)`, `Delete(ctx, slug) error` (refuses system roles → `ErrSystemRole`; FK RESTRICT surfaces as a wrapped error), `SetPermissions(ctx, slug string, permSlugs []string) (domain.Role,error)` (unknown slug → `ErrPermissionUnknown`).
  - `permissions.New(pool) *Store` with `List(ctx) ([]domain.Permission,error)`.
  - `recovery.New(pool) *Store` with `Replace(ctx, userID string, hashes []string) error`, `List(ctx, userID string) (ids, hashes []string, err error)`, `MarkUsed(ctx, id string) error`, `DeleteAll(ctx, userID string) error`.

- [ ] **Step 1: Write `roles/store.go` + `list.go` + `create.go`**

```go
// Package roles is the PostgreSQL store for roles and their permission bindings.
package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Get returns one role with its permission slugs.
func (s *Store) Get(ctx context.Context, slug string) (domain.Role, error) {
	const q = `SELECT slug, title, is_system FROM roles WHERE slug = $1`
	var r domain.Role
	if err := s.pool.QueryRow(ctx, q, slug).Scan(&r.Slug, &r.Title, &r.IsSystem); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Role{}, domain.ErrRoleNotFound
		}
		return domain.Role{}, fmt.Errorf("roles.Get: %w", err)
	}
	perms, err := s.permSlugs(ctx, slug)
	if err != nil {
		return domain.Role{}, err
	}
	r.PermissionSlugs = perms
	return r, nil
}

func (s *Store) permSlugs(ctx context.Context, slug string) ([]string, error) {
	const q = `SELECT p.slug FROM role_permissions rp
		JOIN roles r ON r.id = rp.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE r.slug = $1 ORDER BY p.slug`
	rows, err := s.pool.Query(ctx, q, slug)
	if err != nil {
		return nil, fmt.Errorf("roles.permSlugs: %w", err)
	}
	defer rows.Close()
	out := make([]string, 0, 8)
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, fmt.Errorf("roles.permSlugs: scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func isUnique(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == "23505"
}
```

```go
// list.go
package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns every role with permission slugs.
func (s *Store) List(ctx context.Context) ([]domain.Role, error) {
	rows, err := s.pool.Query(ctx, `SELECT slug FROM roles ORDER BY slug`)
	if err != nil {
		return nil, fmt.Errorf("roles.List: %w", err)
	}
	slugs := make([]string, 0, 8)
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			rows.Close()
			return nil, fmt.Errorf("roles.List: scan: %w", err)
		}
		slugs = append(slugs, slug)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("roles.List: rows: %w", err)
	}
	out := make([]domain.Role, 0, len(slugs))
	for _, slug := range slugs {
		r, err := s.Get(ctx, slug)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}
```

```go
// create.go
package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create inserts a non-system role with the given permission slugs.
func (s *Store) Create(ctx context.Context, r domain.Role) (domain.Role, error) {
	const q = `INSERT INTO roles (slug, title, is_system) VALUES ($1, $2, FALSE) RETURNING id`
	var id string
	if err := s.pool.QueryRow(ctx, q, r.Slug, r.Title).Scan(&id); err != nil {
		if isUnique(err) {
			return domain.Role{}, domain.ErrRoleSlugTaken
		}
		return domain.Role{}, fmt.Errorf("roles.Create: %w", err)
	}
	if err := s.replacePermissions(ctx, r.Slug, r.PermissionSlugs); err != nil {
		return domain.Role{}, err
	}
	return s.Get(ctx, r.Slug)
}
```

- [ ] **Step 2: Write `roles/update.go`, `delete.go`, `set_permissions.go`**

```go
// update.go
package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// UpdateTitle renames a role (allowed on system roles too).
func (s *Store) UpdateTitle(ctx context.Context, slug, title string) (domain.Role, error) {
	const q = `UPDATE roles SET title = $2, updated_at = now() WHERE slug = $1 RETURNING id`
	var id string
	if err := s.pool.QueryRow(ctx, q, slug, title).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Role{}, domain.ErrRoleNotFound
		}
		return domain.Role{}, fmt.Errorf("roles.UpdateTitle: %w", err)
	}
	return s.Get(ctx, slug)
}
```

```go
// delete.go
package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Delete removes a non-system role. System roles are refused. A role still
// assigned to users fails on the user_roles FK (RESTRICT) — surfaced wrapped.
func (s *Store) Delete(ctx context.Context, slug string) error {
	var isSystem bool
	if err := s.pool.QueryRow(ctx, `SELECT is_system FROM roles WHERE slug = $1`, slug).Scan(&isSystem); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrRoleNotFound
		}
		return fmt.Errorf("roles.Delete: lookup: %w", err)
	}
	if isSystem {
		return domain.ErrSystemRole
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM roles WHERE slug = $1`, slug); err != nil {
		return fmt.Errorf("roles.Delete: %w", err)
	}
	return nil
}
```

```go
// set_permissions.go
package roles

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetPermissions replaces a role's permission set.
func (s *Store) SetPermissions(ctx context.Context, slug string, permSlugs []string) (domain.Role, error) {
	if _, err := s.Get(ctx, slug); err != nil {
		return domain.Role{}, err
	}
	if err := s.replacePermissions(ctx, slug, permSlugs); err != nil {
		return domain.Role{}, err
	}
	return s.Get(ctx, slug)
}

func (s *Store) replacePermissions(ctx context.Context, slug string, permSlugs []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("roles.replacePermissions: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var roleID string
	if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE slug = $1`, slug).Scan(&roleID); err != nil {
		return fmt.Errorf("roles.replacePermissions: role id: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return fmt.Errorf("roles.replacePermissions: clear: %w", err)
	}
	for _, ps := range permSlugs {
		var permID string
		if err := tx.QueryRow(ctx, `SELECT id FROM permissions WHERE slug = $1`, ps).Scan(&permID); err != nil {
			if err == pgx.ErrNoRows {
				return domain.ErrPermissionUnknown
			}
			return fmt.Errorf("roles.replacePermissions: perm %q: %w", ps, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)`, roleID, permID); err != nil {
			return fmt.Errorf("roles.replacePermissions: insert: %w", err)
		}
	}
	return tx.Commit(ctx)
}
```

- [ ] **Step 3: Write `permissions/store.go` + `list.go`**

```go
// store.go
// Package permissions is the read-only PostgreSQL store for the permission catalog.
package permissions

import "github.com/jackc/pgx/v5/pgxpool"

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }
```

```go
// list.go
package permissions

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns the full permission catalog.
func (s *Store) List(ctx context.Context) ([]domain.Permission, error) {
	rows, err := s.pool.Query(ctx, `SELECT slug, description FROM permissions ORDER BY slug`)
	if err != nil {
		return nil, fmt.Errorf("permissions.List: %w", err)
	}
	defer rows.Close()
	out := make([]domain.Permission, 0, 24)
	for rows.Next() {
		var p domain.Permission
		if err := rows.Scan(&p.Slug, &p.Description); err != nil {
			return nil, fmt.Errorf("permissions.List: scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
```

- [ ] **Step 4: Write `recovery/store.go`**

```go
// Package recovery is the PostgreSQL store for one-time 2FA recovery codes.
package recovery

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Replace deletes the user's existing codes and inserts fresh hashes.
func (s *Store) Replace(ctx context.Context, userID string, hashes []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("recovery.Replace: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `DELETE FROM recovery_codes WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("recovery.Replace: clear: %w", err)
	}
	for _, h := range hashes {
		if _, err := tx.Exec(ctx, `INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1,$2)`, userID, h); err != nil {
			return fmt.Errorf("recovery.Replace: insert: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// List returns ids + hashes of the user's UNUSED codes (same index order).
func (s *Store) List(ctx context.Context, userID string) (ids, hashes []string, err error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`, userID)
	if err != nil {
		return nil, nil, fmt.Errorf("recovery.List: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, h string
		if err := rows.Scan(&id, &h); err != nil {
			return nil, nil, fmt.Errorf("recovery.List: scan: %w", err)
		}
		ids = append(ids, id)
		hashes = append(hashes, h)
	}
	return ids, hashes, rows.Err()
}

// MarkUsed stamps a code as consumed.
func (s *Store) MarkUsed(ctx context.Context, id string) error {
	if _, err := s.pool.Exec(ctx, `UPDATE recovery_codes SET used_at = now() WHERE id = $1`, id); err != nil {
		return fmt.Errorf("recovery.MarkUsed: %w", err)
	}
	return nil
}

// DeleteAll removes every code for a user (on 2FA disable).
func (s *Store) DeleteAll(ctx context.Context, userID string) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM recovery_codes WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("recovery.DeleteAll: %w", err)
	}
	return nil
}
```

- [ ] **Step 5: Build + commit** — `go build ./internal/storage/...` → ok. `git add backend/services/auth-service/internal/storage && git commit -m "feat(auth): roles, permissions, recovery stores"`

---

## Phase 5 — Session store (Redis)

### Task 5.1: Session + 2FA-pending + throttle

**Files:**
- Create: `internal/session/store.go`, `create.go`, `get.go`, `delete.go`, `pending_2fa.go`, `throttle.go`

**Interfaces:**
- Produces `session.New(rdb *redis.Client, idleTTL, absoluteTTL, pendingTTL time.Duration, maxFails int, lockTTL time.Duration) *Store` with:
  - `Create(ctx, sess domain.Session) (token string, err error)` — stores `session:<token>` (idle TTL) and adds to `user_sessions:<uid>`.
  - `Get(ctx, token string) (domain.Session, error)` — `ErrSessionInvalid` if missing; refreshes idle TTL (bounded by AbsoluteExpiry).
  - `Delete(ctx, token string) error` — removes session + set membership.
  - `DeleteUser(ctx, userID string) error` — kills all of a user's sessions.
  - `PutPending(ctx, userID string) (challenge string, err error)` / `TakePending(ctx, challenge string) (userID string, err error)` (single-use).
  - `RegisterFail(ctx, identifier string) error` / `IsLocked(ctx, identifier string) (bool, error)` / `ClearFails(ctx, identifier string) error`.

- [ ] **Step 1: Write `store.go`**

```go
// Package session stores opaque session tokens, 2FA challenges, and login
// throttle counters in Redis. Keys: session:<token>, user_sessions:<uid>,
// 2fa_pending:<challenge>, login_fail:<identifier>.
package session

import (
	"time"

	"github.com/redis/go-redis/v9"
)

// Store is the Redis-backed session adapter.
type Store struct {
	rdb         *redis.Client
	idleTTL     time.Duration
	absoluteTTL time.Duration
	pendingTTL  time.Duration
	maxFails    int
	lockTTL     time.Duration
}

// New builds a session Store.
func New(rdb *redis.Client, idleTTL, absoluteTTL, pendingTTL time.Duration, maxFails int, lockTTL time.Duration) *Store {
	return &Store{rdb: rdb, idleTTL: idleTTL, absoluteTTL: absoluteTTL, pendingTTL: pendingTTL, maxFails: maxFails, lockTTL: lockTTL}
}

func sessionKey(token string) string { return "session:" + token }
func userKey(uid string) string      { return "user_sessions:" + uid }
func pendingKey(c string) string     { return "2fa_pending:" + c }
func failKey(id string) string       { return "login_fail:" + id }
```

- [ ] **Step 2: Write `create.go` + `get.go`**

```go
// create.go
package session

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
)

// Create mints a token, stores the session under its idle TTL, and tracks it
// in the per-user set so it can be revoked en masse.
func (s *Store) Create(ctx context.Context, sess domain.Session) (string, error) {
	token, err := secret.NewToken()
	if err != nil {
		return "", err
	}
	if sess.AbsoluteExpiry.IsZero() {
		sess.AbsoluteExpiry = time.Now().Add(s.absoluteTTL)
	}
	payload, err := json.Marshal(sess)
	if err != nil {
		return "", fmt.Errorf("session.Create: marshal: %w", err)
	}
	pipe := s.rdb.TxPipeline()
	pipe.Set(ctx, sessionKey(token), payload, s.idleTTL)
	pipe.SAdd(ctx, userKey(sess.UserID), token)
	pipe.Expire(ctx, userKey(sess.UserID), s.absoluteTTL)
	if _, err := pipe.Exec(ctx); err != nil {
		return "", fmt.Errorf("session.Create: exec: %w", err)
	}
	return token, nil
}
```

```go
// get.go
package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Get loads a session, refreshing the idle TTL up to the absolute cap.
func (s *Store) Get(ctx context.Context, token string) (domain.Session, error) {
	raw, err := s.rdb.Get(ctx, sessionKey(token)).Bytes()
	if errors.Is(err, redis.Nil) {
		return domain.Session{}, domain.ErrSessionInvalid
	}
	if err != nil {
		return domain.Session{}, fmt.Errorf("session.Get: %w", err)
	}
	var sess domain.Session
	if err := json.Unmarshal(raw, &sess); err != nil {
		return domain.Session{}, fmt.Errorf("session.Get: unmarshal: %w", err)
	}
	remaining := time.Until(sess.AbsoluteExpiry)
	if remaining <= 0 {
		_ = s.Delete(ctx, token)
		return domain.Session{}, domain.ErrSessionInvalid
	}
	// Slide the idle window, never past the absolute expiry.
	ttl := min(s.idleTTL, remaining)
	s.rdb.Expire(ctx, sessionKey(token), ttl)
	return sess, nil
}
```

- [ ] **Step 3: Write `delete.go`**

```go
package session

import (
	"context"
	"errors"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// Delete removes one session and its set membership.
func (s *Store) Delete(ctx context.Context, token string) error {
	sess, err := s.peek(ctx, token)
	if err == nil {
		s.rdb.SRem(ctx, userKey(sess.UserID), token)
	}
	if err := s.rdb.Del(ctx, sessionKey(token)).Err(); err != nil {
		return fmt.Errorf("session.Delete: %w", err)
	}
	return nil
}

// DeleteUser kills every session of a user (freeze/soft-delete/role change).
func (s *Store) DeleteUser(ctx context.Context, userID string) error {
	tokens, err := s.rdb.SMembers(ctx, userKey(userID)).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf("session.DeleteUser: members: %w", err)
	}
	pipe := s.rdb.TxPipeline()
	for _, t := range tokens {
		pipe.Del(ctx, sessionKey(t))
	}
	pipe.Del(ctx, userKey(userID))
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("session.DeleteUser: exec: %w", err)
	}
	return nil
}

func (s *Store) peek(ctx context.Context, token string) (domain.Session, error) {
	raw, err := s.rdb.Get(ctx, sessionKey(token)).Bytes()
	if err != nil {
		return domain.Session{}, err
	}
	var sess domain.Session
	return sess, json.Unmarshal(raw, &sess)
}
```

Note: `peek` needs imports `encoding/json` and the `domain` package — add them to the import block.

- [ ] **Step 4: Write `pending_2fa.go` + `throttle.go`**

```go
// pending_2fa.go
package session

import (
	"context"
	"errors"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
)

// PutPending stores a single-use 2FA challenge → userID with the pending TTL.
func (s *Store) PutPending(ctx context.Context, userID string) (string, error) {
	challenge, err := secret.NewToken()
	if err != nil {
		return "", err
	}
	if err := s.rdb.Set(ctx, pendingKey(challenge), userID, s.pendingTTL).Err(); err != nil {
		return "", fmt.Errorf("session.PutPending: %w", err)
	}
	return challenge, nil
}

// TakePending atomically reads + deletes a challenge, returning its userID.
func (s *Store) TakePending(ctx context.Context, challenge string) (string, error) {
	userID, err := s.rdb.GetDel(ctx, pendingKey(challenge)).Result()
	if errors.Is(err, redis.Nil) {
		return "", domain.Err2FAInvalidCode
	}
	if err != nil {
		return "", fmt.Errorf("session.TakePending: %w", err)
	}
	return userID, nil
}
```

Note: `pending_2fa.go` imports `domain` for `Err2FAInvalidCode` — add it.

```go
// throttle.go
package session

import (
	"context"
	"errors"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// RegisterFail increments the failure counter, arming the lock TTL on first fail.
func (s *Store) RegisterFail(ctx context.Context, identifier string) error {
	n, err := s.rdb.Incr(ctx, failKey(identifier)).Result()
	if err != nil {
		return fmt.Errorf("session.RegisterFail: %w", err)
	}
	if n == 1 {
		s.rdb.Expire(ctx, failKey(identifier), s.lockTTL)
	}
	return nil
}

// IsLocked reports whether identifier has exceeded maxFails.
func (s *Store) IsLocked(ctx context.Context, identifier string) (bool, error) {
	n, err := s.rdb.Get(ctx, failKey(identifier)).Int()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("session.IsLocked: %w", err)
	}
	return n >= s.maxFails, nil
}

// ClearFails resets the counter after a successful login.
func (s *Store) ClearFails(ctx context.Context, identifier string) error {
	if err := s.rdb.Del(ctx, failKey(identifier)).Err(); err != nil {
		return fmt.Errorf("session.ClearFails: %w", err)
	}
	return nil
}
```

- [ ] **Step 5: Build + commit** — `go build ./internal/session/...` → ok (fix any missing imports flagged). `git add backend/services/auth-service/internal/session && git commit -m "feat(auth): Redis session, 2FA-pending, throttle store"`

---

## Phase 6 — Services (TDD with minimock)

Install the mock tool once: `go install github.com/gojuno/minimock/v3/cmd/minimock@latest`, and add `require github.com/gojuno/minimock/v3 v3.4.5` to `go.mod` (run `go work sync`).

minimock usage in tests: `mc := minimock.NewController(t)`; `m := mocks.NewUserStoreMock(mc)`; `m.GetByIDMock.Expect(ctx, "id").Return(user, nil)`. The controller asserts all expectations at test end via `t.Cleanup`.

### Task 6.1: Auth service (login, 2FA verify, logout, validate)

**Files:**
- Create: `internal/service/auth/auth.go`, `login.go`, `login_2fa.go`, `logout.go`, `validate_token.go`
- Create: `internal/service/auth/mocks/` (generated)
- Test: `internal/service/auth/login_test.go`

**Interfaces:**
- Consumes: `users.Store`, `session.Store`, `recovery.Store`, `secret.Cipher`, `password.Verify`, `totp.Validate`, `totp.Match`.
- Produces `auth.Service` with:
  - `Login(ctx, identifier, plainPassword string) (token string, twoFAChallenge string, err error)` — on success returns `token`; when 2FA on returns `twoFAChallenge` (token empty); throttled → `ErrLoginThrottled`; bad creds → `ErrInvalidCredential`; frozen/deleted → `ErrAccountFrozen`/`ErrAccountDeleted`.
  - `LoginVerify2FA(ctx, challenge, code string) (token string, err error)`
  - `Logout(ctx, token string) error`
  - `ValidateToken(ctx, token string) (userID string, permissions []string, err error)`

- [ ] **Step 1: Write `auth.go`** (consumer interfaces + struct + constructor + `//go:generate`)

```go
// Package auth implements login, 2FA verification, logout, and token
// validation over the Postgres user store and the Redis session store.
package auth

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

//go:generate minimock -i UserStore,SessionStore,RecoveryStore -o ./mocks -s _mock.go

// UserStore is the subset of the users store this service needs.
type UserStore interface {
	GetByIdentifier(ctx context.Context, identifier string) (domain.User, error)
	GetByID(ctx context.Context, id string) (domain.User, error)
}

// SessionStore is the Redis-backed session contract.
type SessionStore interface {
	Create(ctx context.Context, sess domain.Session) (string, error)
	Get(ctx context.Context, token string) (domain.Session, error)
	Delete(ctx context.Context, token string) error
	PutPending(ctx context.Context, userID string) (string, error)
	TakePending(ctx context.Context, challenge string) (string, error)
	RegisterFail(ctx context.Context, identifier string) error
	IsLocked(ctx context.Context, identifier string) (bool, error)
	ClearFails(ctx context.Context, identifier string) error
}

// RecoveryStore lets 2FA accept one-time recovery codes.
type RecoveryStore interface {
	List(ctx context.Context, userID string) (ids, hashes []string, err error)
	MarkUsed(ctx context.Context, id string) error
}

// Decryptor decrypts the stored TOTP secret (satisfied by *secret.Cipher).
type Decryptor interface {
	Decrypt(ct []byte) ([]byte, error)
}

// Service is the auth/login service.
type Service struct {
	users       UserStore
	sessions    SessionStore
	recovery    RecoveryStore
	cipher      Decryptor
	absoluteTTL time.Duration
}

// New constructs the auth Service.
func New(users UserStore, sessions SessionStore, recovery RecoveryStore, cipher Decryptor, absoluteTTL time.Duration) *Service {
	return &Service{users: users, sessions: sessions, recovery: recovery, cipher: cipher, absoluteTTL: absoluteTTL}
}
```

- [ ] **Step 2: Generate mocks** — `cd backend/services/auth-service && go generate ./internal/service/auth/...` → creates `mocks/*_mock.go`.

- [ ] **Step 3: Write the failing test `login_test.go`**

```go
package auth_test

import (
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth/mocks"
)

func newSvc(t *testing.T) (*auth.Service, *mocks.UserStoreMock, *mocks.SessionStoreMock, *mocks.RecoveryStoreMock) {
	mc := minimock.NewController(t)
	us := mocks.NewUserStoreMock(mc)
	ss := mocks.NewSessionStoreMock(mc)
	rs := mocks.NewRecoveryStoreMock(mc)
	return auth.New(us, ss, rs, nil, 720*time.Hour), us, ss, rs
}

func TestLoginSuccessNo2FA(t *testing.T) {
	svc, us, ss, _ := newSvc(t)
	ctx := t.Context()
	hash, _ := password.Hash("pw")
	u := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash, Permissions: []string{"territory:read"}}

	ss.IsLockedMock.Expect(ctx, "ivan").Return(false, nil)
	us.GetByIdentifierMock.Expect(ctx, "ivan").Return(u, nil)
	ss.ClearFailsMock.Expect(ctx, "ivan").Return(nil)
	ss.CreateMock.Return("tok123", nil)

	token, challenge, err := svc.Login(ctx, "ivan", "pw")
	assert.NilError(t, err)
	assert.Equal(t, token, "tok123")
	assert.Equal(t, challenge, "")
}

func TestLoginWrongPassword(t *testing.T) {
	svc, us, ss, _ := newSvc(t)
	ctx := t.Context()
	hash, _ := password.Hash("pw")
	ss.IsLockedMock.Expect(ctx, "ivan").Return(false, nil)
	us.GetByIdentifierMock.Expect(ctx, "ivan").Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)
	ss.RegisterFailMock.Expect(ctx, "ivan").Return(nil)

	_, _, err := svc.Login(ctx, "ivan", "WRONG")
	assert.ErrorIs(t, err, domain.ErrInvalidCredential)
}

func TestLoginFrozen(t *testing.T) {
	svc, us, ss, _ := newSvc(t)
	ctx := t.Context()
	hash, _ := password.Hash("pw")
	ss.IsLockedMock.Expect(ctx, "ivan").Return(false, nil)
	us.GetByIdentifierMock.Expect(ctx, "ivan").Return(domain.User{ID: "u1", Status: domain.StatusFrozen, PasswordHash: hash}, nil)

	_, _, err := svc.Login(ctx, "ivan", "pw")
	assert.ErrorIs(t, err, domain.ErrAccountFrozen)
}

func TestLoginThrottled(t *testing.T) {
	svc, _, ss, _ := newSvc(t)
	ctx := t.Context()
	ss.IsLockedMock.Expect(ctx, "ivan").Return(true, nil)
	_, _, err := svc.Login(ctx, "ivan", "pw")
	assert.ErrorIs(t, err, domain.ErrLoginThrottled)
}

func TestLogin2FARequired(t *testing.T) {
	svc, us, ss, _ := newSvc(t)
	ctx := t.Context()
	hash, _ := password.Hash("pw")
	ss.IsLockedMock.Expect(ctx, "ivan").Return(false, nil)
	us.GetByIdentifierMock.Expect(ctx, "ivan").Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash, TOTPEnabled: true}, nil)
	ss.ClearFailsMock.Expect(ctx, "ivan").Return(nil)
	ss.PutPendingMock.Expect(ctx, "u1").Return("chal1", nil)

	token, challenge, err := svc.Login(ctx, "ivan", "pw")
	assert.NilError(t, err)
	assert.Equal(t, token, "")
	assert.Equal(t, challenge, "chal1")
}
```

- [ ] **Step 4: Run, expect FAIL** — `go test ./internal/service/auth/...` → fails (Login undefined).

- [ ] **Step 5: Write `login.go`, `login_2fa.go`, `logout.go`, `validate_token.go`**

```go
// login.go
package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

// Login authenticates by email-or-username + password. Returns a session token
// directly when 2FA is off, or a challenge token (token empty) when on.
func (s *Service) Login(ctx context.Context, identifier, plain string) (string, string, error) {
	if identifier == "" || plain == "" {
		return "", "", fmt.Errorf("auth.Login: %w: identifier and password required", domain.ErrInvalidInput)
	}
	locked, err := s.sessions.IsLocked(ctx, identifier)
	if err != nil {
		return "", "", err
	}
	if locked {
		return "", "", domain.ErrLoginThrottled
	}

	u, err := s.users.GetByIdentifier(ctx, identifier)
	if err != nil {
		// Unknown user is an auth failure, not a 404 — don't leak existence.
		_ = s.sessions.RegisterFail(ctx, identifier)
		return "", "", domain.ErrInvalidCredential
	}
	ok, err := password.Verify(plain, u.PasswordHash)
	if err != nil {
		return "", "", fmt.Errorf("auth.Login: verify: %w", err)
	}
	if !ok {
		_ = s.sessions.RegisterFail(ctx, identifier)
		return "", "", domain.ErrInvalidCredential
	}
	switch u.Status {
	case domain.StatusFrozen:
		return "", "", domain.ErrAccountFrozen
	case domain.StatusDeleted:
		return "", "", domain.ErrAccountDeleted
	}
	_ = s.sessions.ClearFails(ctx, identifier)

	if u.TOTPEnabled {
		challenge, err := s.sessions.PutPending(ctx, u.ID)
		if err != nil {
			return "", "", err
		}
		return "", challenge, nil
	}
	token, err := s.issue(ctx, u)
	return token, "", err
}

// issue creates a session carrying a permission snapshot.
func (s *Service) issue(ctx context.Context, u domain.User) (string, error) {
	return s.sessions.Create(ctx, domain.Session{
		UserID:         u.ID,
		Permissions:    u.Permissions,
		Status:         u.Status,
		AbsoluteExpiry: time.Now().Add(s.absoluteTTL),
	})
}
```

```go
// login_2fa.go
package auth

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

// LoginVerify2FA consumes a challenge and a TOTP (or recovery) code, issuing a
// session on success.
func (s *Service) LoginVerify2FA(ctx context.Context, challenge, code string) (string, error) {
	if challenge == "" || code == "" {
		return "", fmt.Errorf("auth.LoginVerify2FA: %w: challenge and code required", domain.ErrInvalidInput)
	}
	userID, err := s.sessions.TakePending(ctx, challenge)
	if err != nil {
		return "", err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", err
	}
	secretPlain, err := s.cipher.Decrypt(u.TOTPSecret)
	if err != nil {
		return "", fmt.Errorf("auth.LoginVerify2FA: decrypt: %w", err)
	}
	if totp.Validate(string(secretPlain), code) {
		return s.issue(ctx, u)
	}
	// Fall back to one-time recovery codes.
	ids, hashes, err := s.recovery.List(ctx, userID)
	if err != nil {
		return "", err
	}
	if idx, ok := totp.Match(code, hashes); ok {
		if err := s.recovery.MarkUsed(ctx, ids[idx]); err != nil {
			return "", err
		}
		return s.issue(ctx, u)
	}
	return "", domain.Err2FAInvalidCode
}
```

```go
// logout.go
package auth

import "context"

// Logout deletes the session token.
func (s *Service) Logout(ctx context.Context, token string) error {
	return s.sessions.Delete(ctx, token)
}
```

```go
// validate_token.go
package auth

import "context"

// ValidateToken returns the user id + permission snapshot for a live session.
func (s *Service) ValidateToken(ctx context.Context, token string) (string, []string, error) {
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return "", nil, err
	}
	return sess.UserID, sess.Permissions, nil
}
```

- [ ] **Step 6: Run, expect PASS** — `go test ./internal/service/auth/... -race` → ok.

- [ ] **Step 7: Commit** — `git add backend/services/auth-service/internal/service/auth && git commit -m "feat(auth): auth/login service with 2FA + tests"`

### Task 6.2: Users service (admin ops + guards)

**Files:**
- Create: `internal/service/users/users.go`, `create.go`, `list.go`, `get.go`, `update.go`, `freeze.go`, `soft_delete.go`, `change_password.go`
- Create: `internal/service/users/mocks/`
- Test: `internal/service/users/users_test.go`

**Interfaces:**
- Consumes a `Store` (the users store) + a `Sessions` (only `DeleteUser`) + `Hasher` (`password.Hash`).
- Produces `users.Service` with:
  - `Create(ctx, email, username, plainPassword string, roleSlugs []string) (domain.User, error)` — validates non-empty fields, hashes password.
  - `List(ctx, status string, includeDeleted bool) ([]domain.User, error)`
  - `Get(ctx, id string) (domain.User, error)`
  - `Update(ctx, id string, roleSlugs []string, email, username string) (domain.User, error)`
  - `Freeze(ctx, actorID, id string) (domain.User, error)` — self-guard (`ErrSelfTarget`), last-admin guard (`ErrLastAdmin`); kills sessions.
  - `Unfreeze(ctx, id string) (domain.User, error)`
  - `SoftDelete(ctx, actorID, id string) error` — same guards; sets deleted_at; kills sessions.
  - `Restore(ctx, id string) (domain.User, error)`
  - `ChangePassword(ctx, userID, oldPlain, newPlain string) error` — verifies old; hashes new.

- [ ] **Step 1: Write `users.go`** (interfaces + struct + constructor + `//go:generate`)

```go
// Package users implements admin user management with self/last-admin guards.
package users

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

//go:generate minimock -i Store,Sessions -o ./mocks -s _mock.go

// Store is the persistence contract.
type Store interface {
	Create(ctx context.Context, u domain.User) (domain.User, error)
	GetByID(ctx context.Context, id string) (domain.User, error)
	List(ctx context.Context, status string, includeDeleted bool) ([]domain.User, error)
	SetStatus(ctx context.Context, id, status string, deletedAt *time.Time) (domain.User, error)
	SetRoles(ctx context.Context, id string, roleSlugs []string) (domain.User, error)
	ChangePassword(ctx context.Context, id, hash string) error
	CountAdmins(ctx context.Context, excludeUserID string) (int, error)
}

// Sessions lets status changes evict live sessions.
type Sessions interface {
	DeleteUser(ctx context.Context, userID string) error
}

// Service is the user-admin service.
type Service struct {
	store    Store
	sessions Sessions
}

// New constructs the user service.
func New(store Store, sessions Sessions) *Service {
	return &Service{store: store, sessions: sessions}
}

// guard enforces the self-target and last-admin invariants shared by freeze
// and soft-delete.
func (s *Service) guard(ctx context.Context, actorID, id string) error {
	if actorID == id {
		return domain.ErrSelfTarget
	}
	target, err := s.store.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if isAdmin(target) {
		n, err := s.store.CountAdmins(ctx, id)
		if err != nil {
			return err
		}
		if n == 0 {
			return domain.ErrLastAdmin
		}
	}
	return nil
}

func isAdmin(u domain.User) bool {
	for _, r := range u.RoleSlugs {
		if r == "admin" {
			return true
		}
	}
	return false
}
```

- [ ] **Step 2: Generate mocks** — `go generate ./internal/service/users/...`.

- [ ] **Step 3: Write failing test `users_test.go`** (guards are the high-value logic)

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

func newSvc(t *testing.T) (*users.Service, *mocks.StoreMock, *mocks.SessionsMock) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	ss := mocks.NewSessionsMock(mc)
	return users.New(st, ss), st, ss
}

func TestFreezeRejectsSelf(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Freeze(t.Context(), "u1", "u1")
	assert.ErrorIs(t, err, domain.ErrSelfTarget)
}

func TestFreezeRejectsLastAdmin(t *testing.T) {
	svc, st, _ := newSvc(t)
	ctx := t.Context()
	st.GetByIDMock.Expect(ctx, "admin1").Return(domain.User{ID: "admin1", RoleSlugs: []string{"admin"}}, nil)
	st.CountAdminsMock.Expect(ctx, "admin1").Return(0, nil)

	_, err := svc.Freeze(ctx, "actor", "admin1")
	assert.ErrorIs(t, err, domain.ErrLastAdmin)
}

func TestFreezeKillsSessions(t *testing.T) {
	svc, st, ss := newSvc(t)
	ctx := t.Context()
	st.GetByIDMock.Expect(ctx, "u2").Return(domain.User{ID: "u2", RoleSlugs: []string{"editor"}}, nil)
	st.SetStatusMock.Return(domain.User{ID: "u2", Status: domain.StatusFrozen}, nil)
	ss.DeleteUserMock.Expect(ctx, "u2").Return(nil)

	out, err := svc.Freeze(ctx, "actor", "u2")
	assert.NilError(t, err)
	assert.Equal(t, out.Status, domain.StatusFrozen)
}
```

- [ ] **Step 4: Run, expect FAIL.**

- [ ] **Step 5: Write the method files**

```go
// freeze.go
package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Freeze sets status=frozen (with guards) and evicts the user's sessions.
func (s *Service) Freeze(ctx context.Context, actorID, id string) (domain.User, error) {
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

// Unfreeze returns a frozen account to active.
func (s *Service) Unfreeze(ctx context.Context, id string) (domain.User, error) {
	return s.store.SetStatus(ctx, id, domain.StatusActive, nil)
}
```

```go
// soft_delete.go
package users

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SoftDelete marks the account deleted (guarded) and evicts its sessions.
func (s *Service) SoftDelete(ctx context.Context, actorID, id string) error {
	if err := s.guard(ctx, actorID, id); err != nil {
		return err
	}
	now := time.Now()
	if _, err := s.store.SetStatus(ctx, id, domain.StatusDeleted, &now); err != nil {
		return err
	}
	return s.sessions.DeleteUser(ctx, id)
}

// Restore reactivates a soft-deleted account.
func (s *Service) Restore(ctx context.Context, id string) (domain.User, error) {
	return s.store.SetStatus(ctx, id, domain.StatusActive, nil)
}
```

```go
// create.go
package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

// Create validates input, hashes the password, and inserts the user.
func (s *Service) Create(ctx context.Context, email, username, plain string, roleSlugs []string) (domain.User, error) {
	if email == "" || username == "" || plain == "" {
		return domain.User{}, fmt.Errorf("users.Create: %w: email, username, password required", domain.ErrInvalidInput)
	}
	hash, err := password.Hash(plain)
	if err != nil {
		return domain.User{}, fmt.Errorf("users.Create: hash: %w", err)
	}
	return s.store.Create(ctx, domain.User{Email: email, Username: username, PasswordHash: hash, RoleSlugs: roleSlugs})
}
```

```go
// list.go
package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *Service) List(ctx context.Context, status string, includeDeleted bool) ([]domain.User, error) {
	return s.store.List(ctx, status, includeDeleted)
}
```

```go
// get.go
package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *Service) Get(ctx context.Context, id string) (domain.User, error) {
	if id == "" {
		return domain.User{}, fmt.Errorf("users.Get: %w: empty id", domain.ErrInvalidInput)
	}
	return s.store.GetByID(ctx, id)
}
```

```go
// update.go
package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Update replaces the user's roles when roleSlugs is non-nil. (Email/username
// edits are out of v1 scope — fields reserved in the proto; pass-through here
// only updates roles to keep the change minimal. ponytail: add field edits
// when a real need appears.)
func (s *Service) Update(ctx context.Context, id string, roleSlugs []string, _, _ string) (domain.User, error) {
	if roleSlugs != nil {
		return s.store.SetRoles(ctx, id, roleSlugs)
	}
	return s.store.GetByID(ctx, id)
}
```

```go
// change_password.go
package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

// ChangePassword verifies the old password then stores the new hash.
func (s *Service) ChangePassword(ctx context.Context, userID, oldPlain, newPlain string) error {
	if newPlain == "" {
		return fmt.Errorf("users.ChangePassword: %w: empty new password", domain.ErrInvalidInput)
	}
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	ok, err := password.Verify(oldPlain, u.PasswordHash)
	if err != nil {
		return fmt.Errorf("users.ChangePassword: verify: %w", err)
	}
	if !ok {
		return domain.ErrInvalidCredential
	}
	hash, err := password.Hash(newPlain)
	if err != nil {
		return fmt.Errorf("users.ChangePassword: hash: %w", err)
	}
	return s.store.ChangePassword(ctx, userID, hash)
}
```

- [ ] **Step 6: Run, expect PASS** — `go test ./internal/service/users/... -race` → ok.

- [ ] **Step 7: Commit** — `git add backend/services/auth-service/internal/service/users && git commit -m "feat(auth): user-admin service with guards + tests"`

### Task 6.3: 2FA service (setup, enable, disable)

**Files:**
- Create: `internal/service/twofa/twofa.go`, `setup.go`, `enable.go`, `disable.go`
- Create: `internal/service/twofa/mocks/`
- Test: `internal/service/twofa/twofa_test.go`

**Interfaces:**
- Consumes a `Store` (`GetByID`, `SetTOTP`), a `Recovery` (`Replace`, `DeleteAll`), and a `Cipher` (`Encrypt`/`Decrypt`).
- Produces `twofa.Service` with:
  - `Setup(ctx, userID string) (secretPlain, otpauthURL string, err error)` — generates a secret, stores it encrypted with `totp_enabled=false` (pending confirmation), returns provisioning data.
  - `Enable(ctx, userID, code string) (recoveryCodes []string, err error)` — verifies code against the pending secret, flips `totp_enabled=true`, generates+stores recovery hashes, returns plaintext codes once. `Err2FAAlreadyEnabled` if already on.
  - `Disable(ctx, userID, code string) error` — verifies code (or recovery), clears secret + recovery codes.

- [ ] **Step 1: Write `twofa.go`**

```go
// Package twofa enables/disables TOTP for a user and issues recovery codes.
package twofa

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

//go:generate minimock -i Store,Recovery,Cipher -o ./mocks -s _mock.go

type Store interface {
	GetByID(ctx context.Context, id string) (domain.User, error)
	SetTOTP(ctx context.Context, id string, enabled bool, secret []byte) error
}

type Recovery interface {
	Replace(ctx context.Context, userID string, hashes []string) error
	DeleteAll(ctx context.Context, userID string) error
}

type Cipher interface {
	Encrypt(plain []byte) ([]byte, error)
	Decrypt(ct []byte) ([]byte, error)
}

type Service struct {
	store    Store
	recovery Recovery
	cipher   Cipher
	issuer   string
}

func New(store Store, recovery Recovery, cipher Cipher, issuer string) *Service {
	return &Service{store: store, recovery: recovery, cipher: cipher, issuer: issuer}
}
```

- [ ] **Step 2: Generate mocks** — `go generate ./internal/service/twofa/...`.

- [ ] **Step 3: Write failing test `twofa_test.go`**

```go
package twofa_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/twofa"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/twofa/mocks"
)

func TestEnableRejectsWhenAlreadyOn(t *testing.T) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	rc := mocks.NewRecoveryMock(mc)
	cp := mocks.NewCipherMock(mc)
	svc := twofa.New(st, rc, cp, "Rosneft")
	ctx := t.Context()

	st.GetByIDMock.Expect(ctx, "u1").Return(domain.User{ID: "u1", TOTPEnabled: true}, nil)
	_, err := svc.Enable(ctx, "u1", "123456")
	assert.ErrorIs(t, err, domain.Err2FAAlreadyEnabled)
}
```

- [ ] **Step 4: Run, expect FAIL.**

- [ ] **Step 5: Write `setup.go`, `enable.go`, `disable.go`**

```go
// setup.go
package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

// Setup provisions a pending secret (stored encrypted, not yet enabled).
func (s *Service) Setup(ctx context.Context, userID string) (string, string, error) {
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return "", "", err
	}
	if u.TOTPEnabled {
		return "", "", domain.Err2FAAlreadyEnabled
	}
	secretPlain, url, err := totp.Generate(s.issuer, u.Username)
	if err != nil {
		return "", "", err
	}
	ct, err := s.cipher.Encrypt([]byte(secretPlain))
	if err != nil {
		return "", "", fmt.Errorf("twofa.Setup: encrypt: %w", err)
	}
	if err := s.store.SetTOTP(ctx, userID, false, ct); err != nil {
		return "", "", err
	}
	return secretPlain, url, nil
}
```

```go
// enable.go
package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

const recoveryCodeCount = 10

// Enable confirms the pending secret with a code, flips the flag on, and
// returns one-time recovery codes (shown once).
func (s *Service) Enable(ctx context.Context, userID, code string) ([]string, error) {
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.TOTPEnabled {
		return nil, domain.Err2FAAlreadyEnabled
	}
	if len(u.TOTPSecret) == 0 {
		return nil, fmt.Errorf("twofa.Enable: %w: run setup first", domain.Err2FANotEnabled)
	}
	secretPlain, err := s.cipher.Decrypt(u.TOTPSecret)
	if err != nil {
		return nil, fmt.Errorf("twofa.Enable: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return nil, domain.Err2FAInvalidCode
	}
	if err := s.store.SetTOTP(ctx, userID, true, u.TOTPSecret); err != nil {
		return nil, err
	}
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

Note: `enable.go` calls `totp.GenerateRecovery` — that is the `recovery.Generate` function from Task 3.2. Rename the Task 3.2 function to `GenerateRecovery` (and keep `Match`) so both live in package `totp` without collision, OR import the `recovery` codegen helper. To keep one home for code generation, in Task 3.2 name them `totp.GenerateRecovery(n)` and `totp.MatchRecovery(plain, hashes)`; update Task 6.1 `login_2fa.go` to call `totp.MatchRecovery`. (Apply this naming when implementing Task 3.2.)

```go
// disable.go
package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

// Disable verifies a current code then clears the secret and recovery codes.
func (s *Service) Disable(ctx context.Context, userID, code string) error {
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if !u.TOTPEnabled {
		return domain.Err2FANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(u.TOTPSecret)
	if err != nil {
		return fmt.Errorf("twofa.Disable: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return domain.Err2FAInvalidCode
	}
	if err := s.store.SetTOTP(ctx, userID, false, nil); err != nil {
		return err
	}
	return s.recovery.DeleteAll(ctx, userID)
}
```

- [ ] **Step 6: Run, expect PASS** — `go test ./internal/service/twofa/... -race`. (Requires the Task 3.2 rename to `totp.GenerateRecovery`/`totp.MatchRecovery`.)

- [ ] **Step 7: Commit** — `git add backend/services/auth-service/internal/service/twofa && git commit -m "feat(auth): 2FA setup/enable/disable service + tests"`

### Task 6.4: Roles service

**Files:**
- Create: `internal/service/roles/roles.go`, `crud.go`, `set_permissions.go`, `list_permissions.go`
- Test: `internal/service/roles/roles_test.go`

**Interfaces:**
- Consumes a `Store` (roles store) + a `Perms` (permissions store `List`).
- Produces `roles.Service` with `List`, `Create(ctx, slug, title string, permSlugs []string)`, `UpdateTitle(ctx, slug, title)`, `Delete(ctx, slug)`, `SetPermissions(ctx, slug, permSlugs)`, `ListPermissions(ctx)`. Validation: non-empty slug/title → else `ErrInvalidInput`.

- [ ] **Step 1: Write `roles.go`** (interfaces + struct + constructor)

```go
// Package roles implements role CRUD and permission assignment.
package roles

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type Store interface {
	List(ctx context.Context) ([]domain.Role, error)
	Create(ctx context.Context, r domain.Role) (domain.Role, error)
	UpdateTitle(ctx context.Context, slug, title string) (domain.Role, error)
	Delete(ctx context.Context, slug string) error
	SetPermissions(ctx context.Context, slug string, permSlugs []string) (domain.Role, error)
}

type Perms interface {
	List(ctx context.Context) ([]domain.Permission, error)
}

type Service struct {
	store Store
	perms Perms
}

func New(store Store, perms Perms) *Service { return &Service{store: store, perms: perms} }
```

- [ ] **Step 2: Write `crud.go`, `set_permissions.go`, `list_permissions.go`**

```go
// crud.go
package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *Service) List(ctx context.Context) ([]domain.Role, error) { return s.store.List(ctx) }

func (s *Service) Create(ctx context.Context, slug, title string, permSlugs []string) (domain.Role, error) {
	if slug == "" || title == "" {
		return domain.Role{}, fmt.Errorf("roles.Create: %w: slug and title required", domain.ErrInvalidInput)
	}
	return s.store.Create(ctx, domain.Role{Slug: slug, Title: title, PermissionSlugs: permSlugs})
}

func (s *Service) UpdateTitle(ctx context.Context, slug, title string) (domain.Role, error) {
	if slug == "" || title == "" {
		return domain.Role{}, fmt.Errorf("roles.UpdateTitle: %w: slug and title required", domain.ErrInvalidInput)
	}
	return s.store.UpdateTitle(ctx, slug, title)
}

func (s *Service) Delete(ctx context.Context, slug string) error {
	if slug == "" {
		return fmt.Errorf("roles.Delete: %w: empty slug", domain.ErrInvalidInput)
	}
	return s.store.Delete(ctx, slug)
}
```

```go
// set_permissions.go
package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *Service) SetPermissions(ctx context.Context, slug string, permSlugs []string) (domain.Role, error) {
	if slug == "" {
		return domain.Role{}, fmt.Errorf("roles.SetPermissions: %w: empty slug", domain.ErrInvalidInput)
	}
	return s.store.SetPermissions(ctx, slug, permSlugs)
}
```

```go
// list_permissions.go
package roles

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *Service) ListPermissions(ctx context.Context) ([]domain.Permission, error) {
	return s.perms.List(ctx)
}
```

- [ ] **Step 3: Write `roles_test.go`** (validation guard)

```go
package roles_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles/mocks"
)

func TestCreateRejectsEmptySlug(t *testing.T) {
	mc := minimock.NewController(t)
	svc := roles.New(mocks.NewStoreMock(mc), mocks.NewPermsMock(mc))
	_, err := svc.Create(t.Context(), "", "Title", nil)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}
```

Add `//go:generate minimock -i Store,Perms -o ./mocks -s _mock.go` to `roles.go` and run `go generate ./internal/service/roles/...` before the test.

- [ ] **Step 4: Run tests, expect PASS; commit** — `go test ./internal/service/roles/... -race` → ok. `git add backend/services/auth-service/internal/service/roles && git commit -m "feat(auth): roles service + tests"`

---

## Phase 7 — gRPC transport

### Task 7.1: grpcapi server, converters, handlers + wire into serve

**Files:**
- Create: `internal/transport/grpcapi/server.go`, `converters.go`, `login.go`, `self.go`, `users.go`, `roles.go`
- Create: `internal/bootstrap/service.go` (wires all stores + services + cipher + session)
- Modify: `internal/bootstrap/transport.go` (accept handler), `internal/bootstrap/serve.go` (build + register)

**Interfaces:**
- Consumes: every service from Phase 6.
- Produces: `grpcapi.Server` implementing `authv1.AuthServiceServer`; `grpcapi.New(deps)`/`(*Server).Register(srv)`; `bootstrap.InitService(pool, rdb, cfg) (*grpcapi.Server, error)` returning the fully-wired handler.

- [ ] **Step 1: Write `server.go`** (the transport-facing service interfaces it calls + struct + mapError)

```go
// Package grpcapi exposes the auth service over gRPC. One method per file;
// this file holds the dependency interfaces, the Server, registration, and the
// central error mapper.
package grpcapi

import (
	"context"
	"errors"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// AuthFlow is the login/session surface.
type AuthFlow interface {
	Login(ctx context.Context, identifier, password string) (string, string, error)
	LoginVerify2FA(ctx context.Context, challenge, code string) (string, error)
	Logout(ctx context.Context, token string) error
	ValidateToken(ctx context.Context, token string) (string, []string, error)
}

// UsersSvc is the user surface (self + admin). userByToken resolves a session
// token to a user id for self endpoints.
type UsersSvc interface {
	Create(ctx context.Context, email, username, password string, roleSlugs []string) (domain.User, error)
	List(ctx context.Context, status string, includeDeleted bool) ([]domain.User, error)
	Get(ctx context.Context, id string) (domain.User, error)
	Update(ctx context.Context, id string, roleSlugs []string, email, username string) (domain.User, error)
	Freeze(ctx context.Context, actorID, id string) (domain.User, error)
	Unfreeze(ctx context.Context, id string) (domain.User, error)
	SoftDelete(ctx context.Context, actorID, id string) error
	Restore(ctx context.Context, id string) (domain.User, error)
	ChangePassword(ctx context.Context, userID, oldPlain, newPlain string) error
}

// TwoFASvc is the 2FA surface.
type TwoFASvc interface {
	Setup(ctx context.Context, userID string) (string, string, error)
	Enable(ctx context.Context, userID, code string) ([]string, error)
	Disable(ctx context.Context, userID, code string) error
}

// RolesSvc is the roles/permissions surface.
type RolesSvc interface {
	List(ctx context.Context) ([]domain.Role, error)
	Create(ctx context.Context, slug, title string, permSlugs []string) (domain.Role, error)
	UpdateTitle(ctx context.Context, slug, title string) (domain.Role, error)
	Delete(ctx context.Context, slug string) error
	SetPermissions(ctx context.Context, slug string, permSlugs []string) (domain.Role, error)
	ListPermissions(ctx context.Context) ([]domain.Permission, error)
}

// Server implements authv1.AuthServiceServer.
type Server struct {
	authv1.UnimplementedAuthServiceServer
	auth  AuthFlow
	users UsersSvc
	twofa TwoFASvc
	roles RolesSvc
}

// New builds the gRPC handler.
func New(auth AuthFlow, users UsersSvc, twofa TwoFASvc, roles RolesSvc) *Server {
	return &Server{auth: auth, users: users, twofa: twofa, roles: roles}
}

// Register attaches the handler to a grpc.Server.
func (s *Server) Register(srv *grpc.Server) { authv1.RegisterAuthServiceServer(srv, s) }

// userIDFromToken resolves a session token to a user id (self endpoints).
func (s *Server) userIDFromToken(ctx context.Context, token string) (string, error) {
	uid, _, err := s.auth.ValidateToken(ctx, token)
	return uid, err
}

// mapError translates domain sentinels to gRPC status codes.
func mapError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, domain.ErrInvalidInput),
		errors.Is(err, domain.ErrPermissionUnknown):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, domain.ErrUserNotFound),
		errors.Is(err, domain.ErrRoleNotFound):
		return status.Error(codes.NotFound, err.Error())
	case errors.Is(err, domain.ErrInvalidCredential),
		errors.Is(err, domain.ErrSessionInvalid),
		errors.Is(err, domain.Err2FAInvalidCode):
		return status.Error(codes.Unauthenticated, err.Error())
	case errors.Is(err, domain.ErrAccountFrozen),
		errors.Is(err, domain.ErrAccountDeleted),
		errors.Is(err, domain.ErrLoginThrottled),
		errors.Is(err, domain.Err2FARequired):
		return status.Error(codes.PermissionDenied, err.Error())
	case errors.Is(err, domain.ErrEmailTaken),
		errors.Is(err, domain.ErrUsernameTaken),
		errors.Is(err, domain.ErrRoleSlugTaken),
		errors.Is(err, domain.Err2FAAlreadyEnabled):
		return status.Error(codes.AlreadyExists, err.Error())
	case errors.Is(err, domain.ErrLastAdmin),
		errors.Is(err, domain.ErrSelfTarget),
		errors.Is(err, domain.ErrSystemRole),
		errors.Is(err, domain.Err2FANotEnabled):
		return status.Error(codes.FailedPrecondition, err.Error())
	default:
		return status.Errorf(codes.Internal, "internal: %v", err)
	}
}
```

- [ ] **Step 2: Write `converters.go`**

```go
package grpcapi

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func userToProto(u domain.User) *authv1.User {
	return &authv1.User{
		Id:          u.ID,
		Email:       u.Email,
		Username:    u.Username,
		Status:      u.Status,
		TotpEnabled: u.TOTPEnabled,
		RoleSlugs:   u.RoleSlugs,
		Permissions: u.Permissions,
		CreatedAt:   timestamppb.New(u.CreatedAt),
		UpdatedAt:   timestamppb.New(u.UpdatedAt),
	}
}

func roleToProto(r domain.Role) *authv1.Role {
	return &authv1.Role{Slug: r.Slug, Title: r.Title, IsSystem: r.IsSystem, PermissionSlugs: r.PermissionSlugs}
}

func permissionToProto(p domain.Permission) *authv1.Permission {
	return &authv1.Permission{Slug: p.Slug, Description: p.Description}
}
```

- [ ] **Step 3: Write the handler files** — each RPC is a thin translate→call→map. `login.go` (Login, LoginVerify2FA, Logout, ValidateToken), `self.go` (GetMe, ChangePassword, Setup2FA, Enable2FA, Disable2FA), `users.go` (CreateUser, ListUsers, GetUser, UpdateUser, FreezeUser, UnfreezeUser, SoftDeleteUser, RestoreUser), `roles.go` (ListRoles, CreateRole, UpdateRole, DeleteRole, SetRolePermissions, ListPermissions). Representative examples (the rest follow this exact shape — decode request getters, call the service method, `return nil, mapError(err)` on error, wrap success in the proto response):

```go
// login.go
package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (s *Server) Login(ctx context.Context, req *authv1.LoginRequest) (*authv1.LoginResponse, error) {
	token, challenge, err := s.auth.Login(ctx, req.GetIdentifier(), req.GetPassword())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.LoginResponse{
		Token:             token,
		TwoFactorRequired: challenge != "",
		ChallengeToken:    challenge,
	}, nil
}

func (s *Server) LoginVerify2FA(ctx context.Context, req *authv1.LoginVerify2FARequest) (*authv1.LoginResponse, error) {
	token, err := s.auth.LoginVerify2FA(ctx, req.GetChallengeToken(), req.GetCode())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.LoginResponse{Token: token}, nil
}

func (s *Server) Logout(ctx context.Context, req *authv1.LogoutRequest) (*authv1.LogoutResponse, error) {
	if err := s.auth.Logout(ctx, req.GetToken()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.LogoutResponse{}, nil
}

func (s *Server) ValidateToken(ctx context.Context, req *authv1.ValidateTokenRequest) (*authv1.ValidateTokenResponse, error) {
	uid, perms, err := s.auth.ValidateToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.ValidateTokenResponse{UserId: uid, Permissions: perms}, nil
}
```

```go
// self.go (GetMe + Setup2FA shown; ChangePassword/Enable2FA/Disable2FA follow identically)
package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (s *Server) GetMe(ctx context.Context, req *authv1.GetMeRequest) (*authv1.User, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Get(ctx, uid)
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) ChangePassword(ctx context.Context, req *authv1.ChangePasswordRequest) (*authv1.ChangePasswordResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.users.ChangePassword(ctx, uid, req.GetOldPassword(), req.GetNewPassword()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.ChangePasswordResponse{}, nil
}

func (s *Server) Setup2FA(ctx context.Context, req *authv1.Setup2FARequest) (*authv1.Setup2FAResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	secretPlain, url, err := s.twofa.Setup(ctx, uid)
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.Setup2FAResponse{Secret: secretPlain, OtpauthUrl: url}, nil
}

func (s *Server) Enable2FA(ctx context.Context, req *authv1.Enable2FARequest) (*authv1.Enable2FAResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	codes, err := s.twofa.Enable(ctx, uid, req.GetCode())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.Enable2FAResponse{RecoveryCodes: codes}, nil
}

func (s *Server) Disable2FA(ctx context.Context, req *authv1.Disable2FARequest) (*authv1.Disable2FAResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.twofa.Disable(ctx, uid, req.GetCode()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.Disable2FAResponse{}, nil
}
```

```go
// users.go (admin) — CreateUser + ListUsers + FreezeUser shown; Get/Update/Unfreeze/SoftDelete/Restore follow identically
package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (s *Server) CreateUser(ctx context.Context, req *authv1.CreateUserRequest) (*authv1.User, error) {
	u, err := s.users.Create(ctx, req.GetEmail(), req.GetUsername(), req.GetPassword(), req.GetRoleSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) ListUsers(ctx context.Context, req *authv1.ListUsersRequest) (*authv1.ListUsersResponse, error) {
	list, err := s.users.List(ctx, req.GetStatus(), req.GetIncludeDeleted())
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
	u, err := s.users.Get(ctx, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) UpdateUser(ctx context.Context, req *authv1.UpdateUserRequest) (*authv1.User, error) {
	u, err := s.users.Update(ctx, req.GetId(), req.GetRoleSlugs(), req.GetEmail(), req.GetUsername())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) FreezeUser(ctx context.Context, req *authv1.FreezeUserRequest) (*authv1.User, error) {
	u, err := s.users.Freeze(ctx, req.GetActorId(), req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) UnfreezeUser(ctx context.Context, req *authv1.UnfreezeUserRequest) (*authv1.User, error) {
	u, err := s.users.Unfreeze(ctx, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) SoftDeleteUser(ctx context.Context, req *authv1.SoftDeleteUserRequest) (*authv1.SoftDeleteUserResponse, error) {
	if err := s.users.SoftDelete(ctx, req.GetActorId(), req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.SoftDeleteUserResponse{}, nil
}

func (s *Server) RestoreUser(ctx context.Context, req *authv1.RestoreUserRequest) (*authv1.User, error) {
	u, err := s.users.Restore(ctx, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}
```

```go
// roles.go
package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (s *Server) ListRoles(ctx context.Context, _ *authv1.ListRolesRequest) (*authv1.ListRolesResponse, error) {
	list, err := s.roles.List(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*authv1.Role, 0, len(list))
	for _, r := range list {
		out = append(out, roleToProto(r))
	}
	return &authv1.ListRolesResponse{Roles: out}, nil
}

func (s *Server) CreateRole(ctx context.Context, req *authv1.CreateRoleRequest) (*authv1.Role, error) {
	r, err := s.roles.Create(ctx, req.GetSlug(), req.GetTitle(), req.GetPermissionSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	return roleToProto(r), nil
}

func (s *Server) UpdateRole(ctx context.Context, req *authv1.UpdateRoleRequest) (*authv1.Role, error) {
	r, err := s.roles.UpdateTitle(ctx, req.GetSlug(), req.GetTitle())
	if err != nil {
		return nil, mapError(err)
	}
	return roleToProto(r), nil
}

func (s *Server) DeleteRole(ctx context.Context, req *authv1.DeleteRoleRequest) (*authv1.DeleteRoleResponse, error) {
	if err := s.roles.Delete(ctx, req.GetSlug()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.DeleteRoleResponse{}, nil
}

func (s *Server) SetRolePermissions(ctx context.Context, req *authv1.SetRolePermissionsRequest) (*authv1.Role, error) {
	r, err := s.roles.SetPermissions(ctx, req.GetSlug(), req.GetPermissionSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	return roleToProto(r), nil
}

func (s *Server) ListPermissions(ctx context.Context, _ *authv1.ListPermissionsRequest) (*authv1.ListPermissionsResponse, error) {
	list, err := s.roles.ListPermissions(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*authv1.Permission, 0, len(list))
	for _, p := range list {
		out = append(out, permissionToProto(p))
	}
	return &authv1.ListPermissionsResponse{Permissions: out}, nil
}
```

- [ ] **Step 4: Write `internal/bootstrap/service.go`** (wires stores + cipher + session + services + handler)

```go
package bootstrap

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
	authsvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth"
	rolesvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles"
	twofasvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/twofa"
	usersvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	permstore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/permissions"
	recstore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/recovery"
	rolestore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/roles"
	userstore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/transport/grpcapi"
)

// InitService wires storage → session → services → gRPC handler. Also returns
// the user store + session store so RunServe can run the bootstrap-admin step.
func InitService(pool *pgxpool.Pool, rdb *redis.Client, cfg config.Config) (*grpcapi.Server, *userstore.Store, error) {
	cipher, err := secret.NewCipher(cfg.SecretKey)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: cipher: %w", err)
	}
	us := userstore.New(pool)
	rs := rolestore.New(pool)
	ps := permstore.New(pool)
	rc := recstore.New(pool)
	sess := session.New(rdb, cfg.SessionIdleTTL, cfg.SessionAbsoluteTTL, cfg.Pending2FATTL, cfg.LoginMaxFails, cfg.LoginLockTTL)

	authS := authsvc.New(us, sess, rc, cipher, cfg.SessionAbsoluteTTL)
	userS := usersvc.New(us, sess)
	twoS := twofasvc.New(us, rc, cipher, "Rosneft")
	roleS := rolesvc.New(rs, ps)

	return grpcapi.New(authS, userS, twoS, roleS), us, nil
}
```

- [ ] **Step 5: Update `transport.go` + `serve.go`** to register the handler.

In `transport.go`, change `InitGRPCServer(logger)` to accept the handler and register it:
```go
func InitGRPCServer(handler *grpcapi.Server, logger *slog.Logger) (*grpc.Server, *health.Server) {
	srv := grpcutil.NewServer(logger)
	handler.Register(srv)
	// ... health + reflection as before ...
}
```
Add import `grpcapi "github.com/vbncursed/rosneft/backend/services/auth-service/internal/transport/grpcapi"`.

In `serve.go`, replace the placeholder comment with:
```go
	handler, userStore, err := InitService(pool, rdb, cfg)
	if err != nil {
		return err
	}
	if err := EnsureBootstrapAdmin(rootCtx, userStore, cfg); err != nil { // Task 9.1
		return err
	}
	grpcSrv, healthSrv := InitGRPCServer(handler, logger)
```
(`EnsureBootstrapAdmin` is added in Task 9.1; until then, stub it as `func EnsureBootstrapAdmin(context.Context, *userstore.Store, config.Config) error { return nil }` in `service.go` so this compiles, and flesh it out in Task 9.1.)

- [ ] **Step 6: Build + test the whole module**

Run: `cd backend/services/auth-service && go build ./... && go test ./... -race -shuffle=on`
Expected: builds; all unit tests pass.

- [ ] **Step 7: Commit** — `git add backend/services/auth-service/internal && git commit -m "feat(auth): gRPC transport + service wiring"`

---

## Phase 8 — Gateway integration

### Task 8.1: Auth gRPC client + bootstrap + config

**Files:**
- Create: `gateway-service/internal/clients/auth/client.go` + one file per RPC group (`session.go`, `users.go`, `roles.go`)
- Modify: `gateway-service/internal/config/config.go` (add `AuthGRPCAddr`), `cmd/gateway/main.go` (flag), `gateway-service/internal/bootstrap/auth.go` (dial), `gateway-service/go.mod` (already has proto dep)

**Interfaces:**
- Produces `auth.Client` wrapping `authv1.AuthServiceClient` with a Go method per RPC returning domain-ish values (strings/structs), e.g.:
  - `Dial(target string) (*Client, error)`, `(*Client).Close() error`
  - `Login(ctx, identifier, password string) (token, challenge string, twoFA bool, err error)`
  - `ValidateToken(ctx, token string) (userID string, perms []string, err error)`
  - …one passthrough per RPC. Each method marshals the request, calls `c.cc.X`, and returns response getters. Errors propagate as gRPC status errors (the HTTP layer maps them).

- [ ] **Step 1: Write `client.go`** (Dial + struct, mirroring the catalog client)

```go
// Package auth is the gateway's gRPC client for the auth-service.
package auth

import (
	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	"google.golang.org/grpc"
)

// Client wraps the generated AuthServiceClient.
type Client struct {
	conn *grpc.ClientConn
	cc   authv1.AuthServiceClient
}

// Dial opens a connection to the auth service. Caller must Close.
func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, cc: authv1.NewAuthServiceClient(conn)}, nil
}

// Close releases the gRPC connection.
func (c *Client) Close() error { return c.conn.Close() }
```

- [ ] **Step 2: Write `session.go` / `users.go` / `roles.go`** — one thin method per RPC. Two representative methods (every other method is the same shape: build the `authv1.*Request`, call `c.cc.<RPC>`, return the response getters + err):

```go
// session.go
package auth

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (c *Client) Login(ctx context.Context, identifier, password string) (token, challenge string, twoFA bool, err error) {
	resp, err := c.cc.Login(ctx, &authv1.LoginRequest{Identifier: identifier, Password: password})
	if err != nil {
		return "", "", false, err
	}
	return resp.GetToken(), resp.GetChallengeToken(), resp.GetTwoFactorRequired(), nil
}

func (c *Client) ValidateToken(ctx context.Context, token string) (string, []string, error) {
	resp, err := c.cc.ValidateToken(ctx, &authv1.ValidateTokenRequest{Token: token})
	if err != nil {
		return "", nil, err
	}
	return resp.GetUserId(), resp.GetPermissions(), nil
}
```

The remaining client methods to implement, each a direct passthrough (signatures the HTTP layer consumes):
`LoginVerify2FA(ctx, challenge, code) (token string, err error)`, `Logout(ctx, token) error`, `GetMe(ctx, token) (*authv1.User, error)`, `ChangePassword(ctx, token, old, new) error`, `Setup2FA(ctx, token) (secret, url string, err error)`, `Enable2FA(ctx, token, code) (codes []string, err error)`, `Disable2FA(ctx, token, code) error`, `CreateUser(ctx, email, username, password string, roles []string) (*authv1.User, error)`, `ListUsers(ctx, status string, includeDeleted bool) ([]*authv1.User, error)`, `GetUser(ctx, id) (*authv1.User, error)`, `UpdateUser(ctx, id string, roles []string, email, username string) (*authv1.User, error)`, `FreezeUser(ctx, actorID, id) (*authv1.User, error)`, `UnfreezeUser(ctx, id) (*authv1.User, error)`, `SoftDeleteUser(ctx, actorID, id) error`, `RestoreUser(ctx, id) (*authv1.User, error)`, `ListRoles(ctx) ([]*authv1.Role, error)`, `CreateRole(ctx, slug, title string, perms []string) (*authv1.Role, error)`, `UpdateRole(ctx, slug, title) (*authv1.Role, error)`, `DeleteRole(ctx, slug) error`, `SetRolePermissions(ctx, slug string, perms []string) (*authv1.Role, error)`, `ListPermissions(ctx) ([]*authv1.Permission, error)`.

- [ ] **Step 3: Config + flag + bootstrap dial**

In `gateway-service/internal/config/config.go` add field `AuthGRPCAddr string mapstructure:"auth-grpc-addr"`, default `"auth:9004"`, and require it in `Validate()`. In `cmd/gateway/main.go` add `flags.String("auth-grpc-addr", "auth:9004", "Auth gRPC address")`. Create `gateway-service/internal/bootstrap/auth.go`:

```go
package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
)

// InitAuth dials the auth gRPC service. The caller must Close the client.
func InitAuth(cfg config.Config) (*auth.Client, error) {
	return auth.Dial(cfg.AuthGRPCAddr)
}
```

- [ ] **Step 4: Build + commit** — `cd backend/services/gateway-service && go build ./...` → ok. `git add backend/services/gateway-service && git commit -m "feat(gateway): auth gRPC client + config"`

### Task 8.2: Auth HTTP handlers (`/api/auth/*`)

**Files:**
- Create: `gateway-service/internal/transport/authhttp/handlers.go`, `dto.go`, `users.go`, `roles.go`, `respond.go`

**Interfaces:**
- Consumes: `auth.Client`. Produces `authhttp.New(client, logger) *Handlers` and `(*Handlers).Mount(r chi.Router)` registering the routes. Bearer token is read from `Authorization: Bearer <token>`.

Ponytail note: these are plain chi handlers (not oapi-codegen) — they decode JSON, call the client, map gRPC `status.Code` → HTTP status, and encode JSON. This avoids regenerating the OpenAPI strict layer for auth.

- [ ] **Step 1: Write `respond.go`** (JSON + gRPC-status→HTTP mapping, the shared helper)

```go
package authhttp

import (
	"encoding/json"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

// fail maps a gRPC status error to an HTTP status + JSON error body.
func fail(w http.ResponseWriter, err error) {
	st := status.Convert(err)
	http := codeToHTTP(st.Code())
	writeJSON(w, http, map[string]string{"error": st.Message()})
}

func codeToHTTP(c codes.Code) int {
	switch c {
	case codes.InvalidArgument:
		return 400
	case codes.Unauthenticated:
		return 401
	case codes.PermissionDenied:
		return 403
	case codes.NotFound:
		return 404
	case codes.AlreadyExists:
		return 409
	case codes.FailedPrecondition:
		return 422
	default:
		return 500
	}
}

// bearer extracts the token from the Authorization header.
func bearer(r *http.Request) string {
	const p = "Bearer "
	h := r.Header.Get("Authorization")
	if len(h) > len(p) && h[:len(p)] == p {
		return h[len(p):]
	}
	return ""
}
```

- [ ] **Step 2: Write `handlers.go` + `dto.go`** (constructor, Mount, login/self handlers). `dto.go` holds the request/response JSON structs (`loginReq{Identifier,Password}`, `login2FAReq{ChallengeToken,Code}`, `changePwReq`, `enable2FAReq{Code}`, `userJSON`, `roleJSON`, etc.). Representative handlers:

```go
// handlers.go
package authhttp

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
)

type Handlers struct {
	client *auth.Client
	logger *slog.Logger
}

func New(client *auth.Client, logger *slog.Logger) *Handlers {
	return &Handlers{client: client, logger: logger}
}

// Mount registers the public + authenticated auth routes. Public: login,
// login/2fa. Everything else requires a Bearer token (validated inside the
// handler via the client; admin endpoints are additionally gated by the
// middleware in Task 8.3 when mounted under the protected group).
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/api/auth", func(ar chi.Router) {
		ar.Post("/login", h.login)
		ar.Post("/login/2fa", h.login2FA)
		ar.Post("/logout", h.logout)
		ar.Get("/me", h.me)
		ar.Post("/me/password", h.changePassword)
		ar.Post("/2fa/setup", h.setup2FA)
		ar.Post("/2fa/enable", h.enable2FA)
		ar.Post("/2fa/disable", h.disable2FA)
		// admin
		ar.Get("/users", h.listUsers)
		ar.Post("/users", h.createUser)
		ar.Get("/users/{id}", h.getUser)
		ar.Patch("/users/{id}", h.updateUser)
		ar.Post("/users/{id}/freeze", h.freezeUser)
		ar.Post("/users/{id}/unfreeze", h.unfreezeUser)
		ar.Delete("/users/{id}", h.softDeleteUser)
		ar.Post("/users/{id}/restore", h.restoreUser)
		ar.Get("/roles", h.listRoles)
		ar.Post("/roles", h.createRole)
		ar.Patch("/roles/{slug}", h.updateRole)
		ar.Delete("/roles/{slug}", h.deleteRole)
		ar.Put("/roles/{slug}/permissions", h.setRolePermissions)
		ar.Get("/permissions", h.listPermissions)
	})
}

func (h *Handlers) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	token, challenge, twoFA, err := h.client.Login(r.Context(), req.Identifier, req.Password)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"token": token, "twoFactorRequired": twoFA, "challengeToken": challenge})
}

func (h *Handlers) me(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.GetMe(r.Context(), bearer(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, userToJSON(u))
}
```

The remaining handlers (`login2FA`, `logout`, `changePassword`, `setup2FA`, `enable2FA`, `disable2FA`, all `users.go` + `roles.go` handlers) follow the same three-line shape: decode body / read `chi.URLParam(r,"id")` / `bearer(r)`, call the matching `h.client.X`, then `fail` or `writeJSON`. For admin actions needing the actor id (`freezeUser`, `softDeleteUser`), read it from the request context set by the middleware (Task 8.3): `principalID(r.Context())`. `userToJSON` / `roleJSON` mappers live in `dto.go`.

- [ ] **Step 3: Build + commit** — `cd backend/services/gateway-service && go build ./...` (will compile once Task 8.3 supplies `principalID`; if doing 8.2 alone, stub it). `git add ... && git commit -m "feat(gateway): /api/auth HTTP handlers"`

### Task 8.3: Auth middleware + route→permission map + wire router

**Files:**
- Create: `gateway-service/internal/transport/authhttp/middleware.go`, `route_permissions.go`, `principal.go`
- Modify: `gateway-service/internal/bootstrap/transport.go` (mount auth handlers on root; wrap `/api` group with the middleware), `serve.go` (pass auth client)

**Interfaces:**
- Produces:
  - `principal.go`: `WithPrincipal(ctx, userID string, perms []string) context.Context`, `principalID(ctx) string`, `principalPerms(ctx) []string`.
  - `middleware.go`: `(*Handlers).Authenticate(next http.Handler) http.Handler` — validates the Bearer token via the client, injects the principal. 401 if missing/invalid.
  - `route_permissions.go`: `RequirePermissionForRoute(next http.Handler) http.Handler` — looks up the required permission for `(method, routePattern)` and 403s if the principal lacks it.

- [ ] **Step 1: Write `principal.go`**

```go
package authhttp

import "context"

type ctxKey int

const (
	keyUserID ctxKey = iota
	keyPerms
)

func WithPrincipal(ctx context.Context, userID string, perms []string) context.Context {
	ctx = context.WithValue(ctx, keyUserID, userID)
	return context.WithValue(ctx, keyPerms, perms)
}

func principalID(ctx context.Context) string {
	id, _ := ctx.Value(keyUserID).(string)
	return id
}

func principalPerms(ctx context.Context) []string {
	p, _ := ctx.Value(keyPerms).([]string)
	return p
}
```

- [ ] **Step 2: Write `middleware.go`**

```go
package authhttp

import "net/http"

// Authenticate validates the Bearer token via the auth-service and injects the
// principal (user id + permission snapshot) into the request context. Requests
// without a valid token get 401.
func (h *Handlers) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearer(r)
		if token == "" {
			writeJSON(w, 401, map[string]string{"error": "missing bearer token"})
			return
		}
		uid, perms, err := h.client.ValidateToken(r.Context(), token)
		if err != nil {
			fail(w, err) // maps Unauthenticated → 401
			return
		}
		next.ServeHTTP(w, r.WithContext(WithPrincipal(r.Context(), uid, perms)))
	})
}
```

- [ ] **Step 3: Write `route_permissions.go`** (the route→permission map + enforcement)

```go
package authhttp

import (
	"net/http"
	"slices"

	"github.com/go-chi/chi/v5"
)

// routePerms maps "METHOD <chi route pattern>" to the permission it requires.
// GET reads require the matching :read; writes require :write/:delete.
var routePerms = map[string]string{
	"POST /api/territories":                          "territory:write",
	"DELETE /api/territories/{slug}":                 "territory:delete",
	"POST /api/models":                               "model:write",
	"DELETE /api/models/{slug}":                      "model:delete",
	"POST /api/territories/{slug}/placements":        "placement:write",
	"PUT /api/territories/{slug}/placements/{id}":    "placement:write",
	"DELETE /api/territories/{slug}/placements/{id}": "placement:delete",
	"POST /api/territories/{slug}/panoramas":         "panorama:write",
	"PUT /api/territories/{slug}/panoramas/{id}":     "panorama:write",
	"DELETE /api/territories/{slug}/panoramas/{id}":  "panorama:delete",
	"POST /api/uploads":                              "upload:create",
	"PATCH /api/uploads/{id}":                        "upload:create",
	"POST /api/uploads/{id}/finalize":                "upload:create",
}

// RequirePermissionForRoute enforces routePerms against the principal. Routes
// not in the map require only a valid session (authentication). GETs that are
// pure reads are allowed for any authenticated principal carrying the matching
// :read — which every role has — so they pass the not-in-map path.
func RequirePermissionForRoute(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rc := chi.RouteContext(r.Context())
		pattern := rc.RoutePattern()
		need, ok := routePerms[r.Method+" "+pattern]
		if ok && !slices.Contains(principalPerms(r.Context()), need) {
			writeJSON(w, 403, map[string]string{"error": "permission denied: " + need})
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

Ponytail note: only write/delete/upload routes are mapped — reads need any authenticated user (the spec's "everything protected" = authenticated; per-permission gating focuses on mutations, which is where the role differences actually bite). Add read-permission rows here later if read access must differ per role.

- [ ] **Step 4: Wire into `bootstrap/transport.go`** — mount auth handlers + protect the `/api` group.

`InitRouter` gains an `authH *authhttp.Handlers` parameter. After the health routes, mount the public+self auth routes on the root router (they self-validate the Bearer where needed):
```go
	authH.Mount(r)
```
And wrap the existing `/api` JSON group with authentication + permission enforcement:
```go
	r.Group(func(api chi.Router) {
		api.Use(authH.Authenticate)
		api.Use(authhttp.RequirePermissionForRoute)
		api.Use(httpapi.ETagMiddleware)
		api.Use(newCompressor().Handler)
		httpapi.HandlerFromMux(httpapi.NewStrictHandler(apiServer, nil), api)
	})
```
Update `serve.go` to dial the auth client (`InitAuth(cfg)`), build `authhttp.New(authClient, logger)`, pass it to `InitRouter`, and `defer authClient.Close()`.

Note: `/api/auth/login` and `/api/auth/login/2fa` must stay public. Since `authH.Mount` registers `/api/auth/*` on the **root** router (not inside the protected `/api` group), they bypass `Authenticate`. The self/admin auth handlers validate the Bearer themselves via the client, returning 401 on bad tokens — so they are protected without being in the chi `/api` group. ✅

- [ ] **Step 5: Build the gateway + run its tests**

Run: `cd backend/services/gateway-service && go build ./... && go test ./... -race`
Expected: builds; existing tests pass.

- [ ] **Step 6: Commit** — `git add backend/services/gateway-service && git commit -m "feat(gateway): auth middleware + route permission map + wiring"`

---

## Phase 9 — Compose, bootstrap-admin, end-to-end

Ponytail decision (DB): auth shares the existing `andrey` Postgres database with catalog, isolated by a **custom goose version table** so the two services' migration histories don't collide. No second database, no init script. (Apply in Task 9.1 Step 1.)

### Task 9.1: Bootstrap-admin

**Files:**
- Modify: `auth-service/internal/bootstrap/service.go` (real `EnsureBootstrapAdmin`)

(The custom goose table `auth_goose_db_version` was already set in Task 1.1 `migrate.go`.)

- [ ] **Step 1: Replace the `EnsureBootstrapAdmin` stub** in `service.go`

```go
// EnsureBootstrapAdmin creates the first admin from config if no admin exists.
// Idempotent: a no-op once any admin is present, or when bootstrap creds are
// unset.
func EnsureBootstrapAdmin(ctx context.Context, store *userstore.Store, cfg config.Config) error {
	if cfg.BootstrapEmail == "" || cfg.BootstrapPassword == "" || cfg.BootstrapUsername == "" {
		return nil
	}
	n, err := store.CountAdmins(ctx, "")
	if err != nil {
		return fmt.Errorf("bootstrap admin: count: %w", err)
	}
	if n > 0 {
		return nil
	}
	hash, err := password.Hash(cfg.BootstrapPassword)
	if err != nil {
		return fmt.Errorf("bootstrap admin: hash: %w", err)
	}
	_, err = store.Create(ctx, domain.User{
		Email: cfg.BootstrapEmail, Username: cfg.BootstrapUsername,
		PasswordHash: hash, RoleSlugs: []string{"admin"},
	})
	if err != nil && !errors.Is(err, domain.ErrEmailTaken) && !errors.Is(err, domain.ErrUsernameTaken) {
		return fmt.Errorf("bootstrap admin: create: %w", err)
	}
	return nil
}
```

Add imports: `context`, `errors`, `fmt`, `password`, `domain`. `CountAdmins(ctx, "")` counts all admins (exclude id empty matches none).

- [ ] **Step 2: Build + test** — `cd backend/services/auth-service && go build ./... && go test ./... -race` → ok.

- [ ] **Step 3: Commit** — `git add backend/services/auth-service && git commit -m "feat(auth): bootstrap-admin"`

### Task 9.2: Dockerfile + compose + end-to-end smoke

**Files:**
- Create: `backend/services/auth-service/Dockerfile` (copy `catalog-service/Dockerfile`, swap binary name `catalog`→`auth`, cmd path `./cmd/auth`)
- Modify: `docker-compose.yml` (add `auth` service; add `AUTH_*` env to it; add `GATEWAY_AUTH_GRPC_ADDR` to gateway; gateway `depends_on` auth)

- [ ] **Step 1: Write `Dockerfile`** — replicate `backend/services/catalog-service/Dockerfile` exactly, replacing every `catalog` token with `auth` and the build target `./cmd/auth`. (Read the catalog Dockerfile first; it's a distroless/static multi-stage build.)

- [ ] **Step 2: Add the `auth` service to `docker-compose.yml`** (after `catalog`)

```yaml
  auth:
    build:
      context: ./backend
      dockerfile: services/auth-service/Dockerfile
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    expose:
      - "9004"
    environment:
      AUTH_GRPC_ADDR: ":9004"
      AUTH_DB_DSN: "postgres://andrey:andrey@postgres:5432/andrey?sslmode=disable"
      AUTH_REDIS_ADDR: "redis:6379"
      AUTH_REDIS_DB: "1"
      AUTH_SECRET_KEY: "0000000000000000000000000000000000000000000000000000000000000000"
      AUTH_BOOTSTRAP_EMAIL: "admin@rosneft.local"
      AUTH_BOOTSTRAP_USERNAME: "admin"
      AUTH_BOOTSTRAP_PASSWORD: "change-me-now"
      AUTH_LOG_LEVEL: "info"
```

Security note (do not skip): `AUTH_SECRET_KEY` and `AUTH_BOOTSTRAP_PASSWORD` here are placeholders for local compose. For any deployed environment, inject real secrets (32-byte random key via `openssl rand -hex 32`) through the deploy environment, never committed. Add a `# CHANGE IN PROD` comment in the compose file.

- [ ] **Step 3: Add auth wiring to the gateway service block**

```yaml
      GATEWAY_AUTH_GRPC_ADDR: "auth:9004"
```
and add to gateway `depends_on`: `auth: { condition: service_started }`.

- [ ] **Step 4: Build + bring up**

Run: `cd backend && make compose-up`
Expected: all containers including `auth` start; `docker compose -f ../docker-compose.yml -p andrey logs auth` shows `auth: serving gRPC` and migration `OK 00001_init.sql`, `OK 00002_seed_roles_permissions.sql`.

- [ ] **Step 5: End-to-end smoke (login as bootstrap admin → list users)**

```bash
# Login
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"change-me-now"}' | jq -r .token)
echo "token=$TOKEN"

# Authenticated self
curl -s localhost:8080/api/auth/me -H "Authorization: Bearer $TOKEN" | jq .

# Admin: list users
curl -s localhost:8080/api/auth/users -H "Authorization: Bearer $TOKEN" | jq .

# Protected mutation without token → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8080/api/territories \
  -H 'Content-Type: application/json' -d '{}'
```
Expected: `me` returns the admin user with `role_slugs:["admin"]` and 20 permissions; users list contains the admin; the unauthenticated POST returns `401`.

- [ ] **Step 6: Verify a non-permitted role is blocked**

```bash
# Create a viewer and log in as them
curl -s -X POST localhost:8080/api/auth/users -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"v@x.io","username":"vic","password":"viewerpass","roleSlugs":["viewer"]}' | jq .
VTOKEN=$(curl -s -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"vic","password":"viewerpass"}' | jq -r .token)
# viewer attempts a territory write → 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8080/api/territories \
  -H "Authorization: Bearer $VTOKEN" -H 'Content-Type: application/json' -d '{}'
```
Expected: `403`.

- [ ] **Step 7: Commit + finish**

```bash
git add backend/services/auth-service/Dockerfile docker-compose.yml
git commit -m "feat(auth): Dockerfile + compose wiring + gateway auth addr"
```

Then use **superpowers:finishing-a-development-branch** to merge/PR `feat/auth-service`.

---

## Self-Review

**Spec coverage** (each spec section → task):
- Opaque Redis sessions, instant revocation → Tasks 5.1, 6.1, 6.2 (freeze/delete kill sessions).
- Postgres user/role/permission model + soft-delete → Tasks 1.1, 1.2, 4.1, 4.2.
- argon2id, AES-GCM totp secret, crypto/rand tokens, subtle compares → Tasks 3.1, 3.2, 3.3.
- TOTP + recovery codes, optional per user → Tasks 3.2, 6.3.
- 4 seeded roles + permission catalog, editable roles → Tasks 1.2, 6.4.
- Admin-created users (no self-registration) → no `/register`; only `CreateUser` (Tasks 6.2, 7.1, 8.2).
- email OR username login → `users.GetByIdentifier` (Task 4.1) + `auth.Login` (Task 6.1).
- Freeze/unfreeze, soft-delete/restore, last-admin & self guards → Task 6.2.
- 2FA challenge flow → Tasks 5.1 (pending), 6.1 (login challenge), 6.3.
- Gateway `/api/auth/*` + middleware over existing routes → Tasks 8.2, 8.3.
- Bootstrap admin + compose → Tasks 9.1, 9.2.

**Type consistency:** `users.GetByIdentifier`/`GetByID`, `session.Create/Get/Delete/DeleteUser/PutPending/TakePending/RegisterFail/IsLocked/ClearFails`, `auth.Login(...)->(token,challenge,err)`, `users.Freeze(actorID,id)`, `totp.GenerateRecovery`/`MatchRecovery` (rename flagged in Tasks 3.2 & 6.3), `secret.Cipher.Encrypt/Decrypt`, `grpcapi.New(auth,users,twofa,roles)` — names are consistent across producer/consumer tasks.

**Known follow-ups deliberately deferred (ponytail, documented not hidden):**
- `UpdateUser` only edits roles in v1 (email/username edit reserved in proto) — Task 6.2 `update.go`.
- Read endpoints require authentication but not per-role read permissions — Task 8.3 note.
- Future "downloader" role + `*:download` permissions — out of scope per spec.
- bufconn gRPC integration test for the transport layer is not included (unit tests cover service logic; the Phase 9 smoke covers the wire). Add if a regression appears.
