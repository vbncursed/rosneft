# content-service Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the `documents` and `panoramas` concerns out of `catalog-service` into a new standalone `content-service`, mirroring the `twofa-service` template, leaving the public REST API and frontend unchanged.

**Architecture:** New gRPC service `content-service` on `:9007` owns the `territory_documents` and `panoramas` tables in the **shared `andrey` Postgres** (isolated by its own `content_goose_db_version` goose table — same pattern as twofa). Tables are **not** recreated or copied; content-service reads/writes the existing tables in place, so the DB-level `ON DELETE CASCADE` from `territories` keeps working for free. The gateway gains a `Content` gRPC client and re-points its already-per-concern documents/panoramas/scene-bundle code at it. Catalog sheds the 7 corresponding RPCs.

**Tech Stack:** Go 1.26, gRPC + protobuf (buf), pgx/v5, goose, cobra+viper, testify/suite + gotest.tools/v3 + minimock/v3, Docker Compose.

## Global Constraints

- **Go 1.26**; use modern idioms per backend CLAUDE.md (`t.Context()`, `wg.Go`, `errors.AsType`, `for i := range n`, `omitzero`, `slices`/`maps`, `new(val)`).
- **File size cap: 200 lines** (skip blank/comment), one concern per file. Never a god-file.
- **No brand word** in any displayed/log text: use "Andrey", never "Rosneft"/"Роснефть". Lowercase `rosneft` in module paths is structural and stays.
- **Tests:** `testify/suite` + `gotest.tools/v3/assert` (`assert.X(s.T(), …)`, not `s.Equal`) + `minimock/v3`. Build controller in `SetupTest` with `minimock.NewController(s.T())`. `minimock.AnyContext` for errgroup/derived ctx. `mocks/` is lint-exempt via `//go:generate minimock -i <Ifaces> -o ./mocks -s _mock.go`.
- **Module path root:** `github.com/vbncursed/rosneft/backend/...`.
- **Generated proto import alias:** `contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"`.
- **Env prefix:** `CONTENT_*`. **gRPC port:** `:9007`.
- Domain sentinels live in `domain/errors.go`; transport maps them to gRPC `codes.*`.

## Move vs. Create convention (read before starting)

Most files are **moved** from catalog with mechanical edits, not rewritten. For a moved file the change is fully specified by: source path → dest path + the exact string substitutions. Apply substitutions with your editor; do not hand-retype the bodies. **New** files (proto, bootstrap wiring, config, gateway `Content` interface, compose/Dockerfile) are given with full content.

Standard substitution for every file moved into `content-service`:
- import `.../catalog-service/internal/domain` → `.../content-service/internal/domain`
- import `.../catalog-service/internal/...` → `.../content-service/internal/...`
- receiver/type references stay as-is unless a task says otherwise.

---

## Task 1: `content.proto` + code generation

**Files:**
- Create: `backend/proto/rosneft/content/v1/content.proto`
- Generated (by buf): `backend/proto/gen/go/rosneft/content/v1/*.pb.go`

**Interfaces:**
- Produces: `contentv1.ContentServiceServer`, `contentv1.ContentServiceClient`, messages `Document`, `Panorama`, `Vec3`, and the 7 request/response pairs. Consumed by every later task.

- [ ] **Step 1: Create the proto file**

`backend/proto/rosneft/content/v1/content.proto`:

```proto
syntax = "proto3";

package rosneft.content.v1;

option go_package = "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1;contentv1";

import "google/protobuf/timestamp.proto";

// ContentService owns non-geometry media attached to a territory: documents
// (PDFs) and panoramas (equirectangular images). Neither touches the mesh
// OBJ→GLB pipeline; both are a blob hash + metadata anchored to a territory.
service ContentService {
  rpc ListPanoramas(ListPanoramasRequest) returns (ListPanoramasResponse);
  rpc CreatePanorama(CreatePanoramaRequest) returns (CreatePanoramaResponse);
  rpc UpdatePanorama(UpdatePanoramaRequest) returns (UpdatePanoramaResponse);
  rpc DeletePanorama(DeletePanoramaRequest) returns (DeletePanoramaResponse);

  rpc ListDocuments(ListDocumentsRequest) returns (ListDocumentsResponse);
  rpc CreateDocument(CreateDocumentRequest) returns (CreateDocumentResponse);
  rpc DeleteDocument(DeleteDocumentRequest) returns (DeleteDocumentResponse);
}

message Vec3 {
  double x = 1;
  double y = 2;
  double z = 3;
}

message Panorama {
  int64 id = 1;
  string territory_slug = 2;
  string slug = 3;
  string title = 4;
  string source_blob_hash = 5;
  Vec3 position = 6;
  double yaw_offset = 7;
  google.protobuf.Timestamp created_at = 8;
  google.protobuf.Timestamp updated_at = 9;
}

message ListPanoramasRequest { string territory_slug = 1; }
message ListPanoramasResponse { repeated Panorama panoramas = 1; }

message CreatePanoramaRequest {
  string territory_slug = 1;
  string slug = 2;
  string title = 3;
  string source_blob_hash = 4;
  Vec3 position = 5;
  double yaw_offset = 6;
}
message CreatePanoramaResponse { Panorama panorama = 1; }

message UpdatePanoramaRequest {
  int64 id = 1;
  string title = 2;
  Vec3 position = 3;
  double yaw_offset = 4;
}
message UpdatePanoramaResponse { Panorama panorama = 1; }

message DeletePanoramaRequest { int64 id = 1; }
message DeletePanoramaResponse {}

// Document is a PDF attached to a territory. No scene position, no slug —
// identified by id; bytes served from BlobStore via asset at /api/assets/{hash}.
message Document {
  int64 id = 1;
  string territory_slug = 2;
  string title = 3;
  string source_blob_hash = 4;
  google.protobuf.Timestamp created_at = 5;
}

message ListDocumentsRequest { string territory_slug = 1; }
message ListDocumentsResponse { repeated Document documents = 1; }

message CreateDocumentRequest {
  string territory_slug = 1;
  string title = 2;
  string source_blob_hash = 3;
}
message CreateDocumentResponse { Document document = 1; }

message DeleteDocumentRequest { int64 id = 1; }
message DeleteDocumentResponse {}
```

- [ ] **Step 2: Generate**

Run: `cd backend && make proto-gen`
Expected: exit 0; new dir `backend/proto/gen/go/rosneft/content/v1/` with `content.pb.go` and `content_grpc.pb.go`.

- [ ] **Step 3: Verify generated stubs compile**

Run: `cd backend/proto && go build ./...`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add backend/proto/rosneft/content backend/proto/gen/go/rosneft/content
git commit -m "feat(proto): add content.v1 ContentService (documents + panoramas)"
```

---

## Task 2: content-service module skeleton (module, config, domain, migrate)

**Files:**
- Create: `backend/services/content-service/go.mod`
- Create: `backend/services/content-service/internal/config/config.go`
- Create: `backend/services/content-service/internal/domain/{vec3.go,document.go,panorama.go,errors.go}`
- Create: `backend/services/content-service/internal/migrate/{migrate.go,up.go,down.go,status.go}`
- Create: `backend/services/content-service/internal/migrate/migrations/00001_init.sql`
- Modify: `backend/go.work`

**Interfaces:**
- Produces: `config.Config` (fields `GRPCAddr`, `DBDSN`, `LogLevel`, `LogFormat`, `AutoMigrate`, `ShutdownTimeout`), `config.Load(cmd)`, `config.Config.Validate()`; `migrate.Up/Down/Status(ctx, dsn)`; domain types `Vec3`, `Document`, `Panorama`, and sentinels `ErrInvalidInput`, `ErrNotFound`, `ErrTerritoryNotFound`.

- [ ] **Step 1: Create `go.mod`**

`backend/services/content-service/go.mod` — copy `backend/services/twofa-service/go.mod`, change the module line to:
```
module github.com/vbncursed/rosneft/backend/services/content-service
```
Remove the `redis` require if present (content needs no Redis); keep pgx, goose, cobra, viper, grpc, testify, gotest.tools, minimock, and the `pkg`/`proto` replace/workspace deps. (Deps resolve via `go.work`; `go mod tidy` in a later step fixes the exact set.)

- [ ] **Step 2: Add module to `go.work`**

Modify `backend/go.work` — add inside `use (`, keeping alphabetical order after `./services/catalog-service`:
```
	./services/content-service
```

- [ ] **Step 3: Create `config.go`**

`backend/services/content-service/internal/config/config.go` — start from `twofa-service/internal/config/config.go` and reduce to the fields content needs:

```go
// Package config builds the content service configuration via Viper, layered
// as flag > env (CONTENT_*) > default.
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
	LogLevel        string        `mapstructure:"log-level"`
	LogFormat       string        `mapstructure:"log-format"`
	AutoMigrate     bool          `mapstructure:"auto-migrate"`
	ShutdownTimeout time.Duration `mapstructure:"shutdown-timeout"`
}

const envPrefix = "CONTENT"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("grpc-addr", ":9007")
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
	return nil
}
```

- [ ] **Step 4: Create domain files**

`backend/services/content-service/internal/domain/vec3.go`:
```go
package domain

// Vec3 is a point in the territory's normalized scene-units space.
type Vec3 struct {
	X float64
	Y float64
	Z float64
}
```

`backend/services/content-service/internal/domain/document.go` — move `catalog-service/internal/domain/document.go` verbatim (only the `package domain` header changes if needed; it is already `package domain`).

`backend/services/content-service/internal/domain/panorama.go` — move `catalog-service/internal/domain/panorama.go` verbatim.

`backend/services/content-service/internal/domain/errors.go`:
```go
package domain

import "errors"

var (
	// ErrInvalidInput is returned for empty/invalid request fields.
	ErrInvalidInput = errors.New("invalid input")
	// ErrNotFound is returned when a document/panorama id does not exist.
	ErrNotFound = errors.New("not found")
	// ErrTerritoryNotFound is returned when the anchoring territory slug is unknown.
	ErrTerritoryNotFound = errors.New("territory not found")
)
```
> Note: copy the exact sentinel names/messages from `catalog-service/internal/domain/errors.go` for `ErrInvalidInput`, `ErrNotFound`, `ErrTerritoryNotFound`. If catalog spells any differently, match catalog's spelling so the moved storage/service files compile unchanged.

- [ ] **Step 5: Create migrate package**

Move `twofa-service/internal/migrate/{migrate.go,up.go,down.go,status.go}` into `content-service/internal/migrate/`, applying substitutions. In `migrate.go` change the goose version table line:
```go
	// content shares the `andrey` database with catalog + auth + twofa; a custom
	// version table keeps the services' migration histories from colliding.
	goose.SetTableName("content_goose_db_version")
```

`backend/services/content-service/internal/migrate/migrations/00001_init.sql`:
```sql
-- +goose Up
-- +goose StatementBegin
-- content-service adopts the existing territory_documents + panoramas tables in
-- the shared `andrey` DB. IF NOT EXISTS makes this a no-op on a DB where catalog
-- already created them, and a clean create on a fresh DB. Schema MUST match the
-- catalog originals (00004_panoramas.sql, 00010_territory_documents.sql).
CREATE TABLE IF NOT EXISTS territories (
    id   BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS territory_documents (
    id               BIGSERIAL PRIMARY KEY,
    territory_id     BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    source_blob_hash TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_territory_documents_territory ON territory_documents(territory_id);
CREATE TABLE IF NOT EXISTS panoramas (
    id               BIGSERIAL PRIMARY KEY,
    territory_id     BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    slug             TEXT NOT NULL,
    title            TEXT NOT NULL,
    source_blob_hash TEXT NOT NULL,
    position_x       DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_y       DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_z       DOUBLE PRECISION NOT NULL DEFAULT 0,
    yaw_offset       DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(territory_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_panoramas_territory ON panoramas(territory_id);
CREATE INDEX IF NOT EXISTS idx_panoramas_blob      ON panoramas(source_blob_hash);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- No-op: content-service never owned these tables exclusively; dropping them
-- would break catalog. Down is intentionally empty.
SELECT 1;
-- +goose StatementEnd
```
> `ponytail:` the bare `territories(id, slug)` create-if-not-exists is a guard for the fresh-DB case only; on the real shared DB catalog's richer `territories` already exists and this is a no-op. It exists so content-service can migrate standalone in tests/CI. Do not add other territory columns here — catalog owns that table's shape.

- [ ] **Step 6: Compile the packages**

Run: `cd backend/services/content-service && go build ./internal/config/... ./internal/domain/... ./internal/migrate/...`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/go.work backend/services/content-service/go.mod backend/services/content-service/internal/config backend/services/content-service/internal/domain backend/services/content-service/internal/migrate
git commit -m "feat(content): module skeleton — config, domain, migrate"
```

---

## Task 3: content-service storage layer

**Files:**
- Create: `backend/services/content-service/internal/storage/postgres.go` (PG struct + constructor)
- Create: `backend/services/content-service/internal/storage/queries.go` (scan helpers moved)
- Create: `backend/services/content-service/internal/storage/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go`

**Interfaces:**
- Produces: `storage.PG` with methods `CreateDocument`, `ListDocuments`, `DeleteDocument`, `CreatePanorama`, `ListPanoramas`, `UpdatePanorama`, `DeletePanorama` (exact signatures as the catalog originals, using `content-service` domain types).

- [ ] **Step 1: Create `postgres.go`**

Copy the `PG` struct + `New(pool *pgxpool.Pool) *PG` constructor from `catalog-service/internal/storage/postgres.go`, but keep ONLY the fields/wiring the moved methods need (the `pool`). Header comment: `// Package storage is the content-service PostgreSQL store.`

- [ ] **Step 2: Move scan helpers**

From `catalog-service/internal/storage/queries.go`, move **only** `scanDocument` and `scanPanorama` (and any tiny helper they call, e.g. a `rowScanner` interface if used) into `content-service/internal/storage/queries.go`. Apply the domain import substitution. Do not move catalog's other scanners.

Run: `cd backend && grep -n 'scanDocument\|scanPanorama' services/catalog-service/internal/storage/queries.go`
Expected: shows the two funcs to move.

- [ ] **Step 3: Move the 7 storage method files**

`git mv` each of these from `catalog-service/internal/storage/` to `content-service/internal/storage/`:
`create_document.go, list_documents.go, delete_document.go, create_panorama.go, list_panoramas.go, update_panorama.go, delete_panorama.go`

Apply the domain import substitution in each. Bodies (the SQL CTEs joining `territories`) are unchanged — they resolve `territory_slug → territory_id` via the shared `territories` table.

- [ ] **Step 4: Compile**

Run: `cd backend/services/content-service && go build ./internal/storage/...`
Expected: exit 0. (If `scanPanorama`/`scanDocument` reference a helper not moved, move it too.)

- [ ] **Step 5: Commit**

```bash
git add backend/services/content-service/internal/storage
git rm backend/services/catalog-service/internal/storage/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go
git commit -m "feat(content): move documents + panoramas storage from catalog"
```
> Catalog won't compile until Task 8 removes the Repository methods; that's expected and fixed in Task 8. Commit is still coherent (storage move is one reviewable unit).

---

## Task 4: content-service service layer (with moved tests)

**Files:**
- Create: `backend/services/content-service/internal/service/content.go` (Repository interface + constructor + `//go:generate`)
- Create: `backend/services/content-service/internal/service/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go`
- Create: `backend/services/content-service/internal/service/documents_test.go` (+ panorama tests if catalog has them)
- Create: `backend/services/content-service/internal/service/mocks/` (generated)

**Interfaces:**
- Consumes: `storage.PG` (satisfies `Repository` implicitly).
- Produces: `service.Content` with the 7 public methods; `service.Repository` interface.

- [ ] **Step 1: Create `content.go`**

`backend/services/content-service/internal/service/content.go`:
```go
// Package service is the content business layer. It validates inputs and
// delegates persistence to a Repository. One method per file — this file
// holds the Repository contract and the Content constructor.
package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

//go:generate minimock -i Repository -o ./mocks -s _mock.go

// Repository is what the content service needs from persistence. The Postgres
// implementation lives in internal/storage and satisfies this implicitly.
type Repository interface {
	ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error)
	CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	DeletePanorama(ctx context.Context, id int64) error

	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, id int64) error
}

// Content is the content service.
type Content struct {
	repo Repository
}

// New constructs a Content backed by repo.
func New(repo Repository) *Content { return &Content{repo: repo} }
```

- [ ] **Step 2: Move the 7 service method files**

`git mv` from `catalog-service/internal/service/` to `content-service/internal/service/`:
`create_document.go, list_documents.go, delete_document.go, create_panorama.go, list_panoramas.go, update_panorama.go, delete_panorama.go`.

In each, apply the domain import substitution AND change the receiver from `(c *Catalog)` to `(c *Content)`. Logic is unchanged (validation + `c.repo.X`).

- [ ] **Step 3: Move the test file(s)**

`git mv catalog-service/internal/service/documents_test.go content-service/internal/service/documents_test.go`. Apply domain import substitution; change the constructed subject from `service.New(repoMock)` returning `*Catalog` to `*Content` (the variable/type names in the test that reference `Catalog`). If catalog has no separate panorama service test, do not invent one (YAGNI).

- [ ] **Step 4: Generate mocks**

Run: `cd backend/services/content-service && go generate ./internal/service/...`
Expected: creates `internal/service/mocks/repository_mock.go`.

- [ ] **Step 5: Run the tests**

Run: `cd backend/services/content-service && go test ./internal/service/...`
Expected: PASS (moved tests exercise the same validation logic against the new mock).

- [ ] **Step 6: Commit**

```bash
git add backend/services/content-service/internal/service
git rm backend/services/catalog-service/internal/service/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go backend/services/catalog-service/internal/service/documents_test.go
git commit -m "feat(content): move documents + panoramas service layer + tests from catalog"
```

---

## Task 5: content-service transport + bootstrap + main (service starts)

**Files:**
- Create: `backend/services/content-service/internal/transport/grpcapi/{server.go,documents.go,panoramas.go}`
- Create: `backend/services/content-service/internal/bootstrap/{logger.go,postgres.go,migrate.go,service.go,transport.go,serve.go}`
- Create: `backend/services/content-service/cmd/content/main.go`

**Interfaces:**
- Consumes: `service.Content`, `contentv1` stubs, `config.Config`.
- Produces: `grpcapi.Server` (implements `contentv1.ContentServiceServer`), `bootstrap.RunServe/RunMigrateUp/Down/Status`.

- [ ] **Step 1: Create `grpcapi/server.go`**

```go
// Package grpcapi exposes content-service over gRPC. One method per file; this
// file holds the dependency interface, the Server, registration, and the error
// mapper.
package grpcapi

import (
	"context"
	"errors"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// Service is the content business surface.
type Service interface {
	ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error)
	CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	DeletePanorama(ctx context.Context, id int64) error
	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, id int64) error
}

// Server implements contentv1.ContentServiceServer.
type Server struct {
	contentv1.UnimplementedContentServiceServer
	svc Service
}

// New builds the gRPC handler.
func New(svc Service) *Server { return &Server{svc: svc} }

// Register attaches the handler to a grpc.Server.
func (s *Server) Register(srv *grpc.Server) { contentv1.RegisterContentServiceServer(srv, s) }

// mapErr converts domain sentinels to gRPC status codes.
func mapErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.ErrInvalidInput):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, domain.ErrTerritoryNotFound), errors.Is(err, domain.ErrNotFound):
		return status.Error(codes.NotFound, err.Error())
	default:
		return status.Error(codes.Internal, err.Error())
	}
}
```

- [ ] **Step 2: Create `grpcapi/documents.go` and `grpcapi/panoramas.go`**

Port the handler bodies from `catalog-service/internal/transport/grpcapi/{list,create,delete}_document.go` and the panorama equivalents: same pb↔domain conversion, but the request/response types are now `contentv1.*` and the receiver calls `s.svc.X`. Split across the two files (documents.go = the 3 document RPCs; panoramas.go = the 4 panorama RPCs). Reuse the exact Vec3↔domain and Timestamp conversion the catalog handlers use.

Reference the catalog originals for the conversion code:
Run: `cd backend && sed -n '1,60p' services/catalog-service/internal/transport/grpcapi/create_panorama.go`
Copy its body, swapping `catalogv1` → `contentv1` and adjusting the receiver type to the content `Server`.

- [ ] **Step 3: Create bootstrap files**

Move `twofa-service/internal/bootstrap/{logger.go,postgres.go,migrate.go}` with substitutions (twofa → content, `TWOFA_`→`CONTENT_` in comments/log strings, service name `twofa`→`content`).

`bootstrap/service.go` (no Redis, no clients — simpler than twofa):
```go
package bootstrap

import (
	"github.com/jackc/pgx/v5/pgxpool"

	svc "github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/transport/grpcapi"
)

// InitService wires storage → service → gRPC handler.
func InitService(pool *pgxpool.Pool) *grpcapi.Server {
	repo := storage.New(pool)
	return grpcapi.New(svc.New(repo))
}
```

`bootstrap/transport.go` — copy twofa's, swap `twofav1`→`contentv1`, `TwoFAService_ServiceDesc`→`ContentService_ServiceDesc`, and `New(handler, authClient)`→ handler only:
```go
package bootstrap

import (
	"log/slog"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/transport/grpcapi"
)

// InitGRPCServer builds the gRPC server with standard interceptors, the
// ContentService handler, health (SERVING), and reflection.
func InitGRPCServer(handler *grpcapi.Server, logger *slog.Logger) (*grpc.Server, *health.Server) {
	srv := grpcutil.NewServer(logger)
	handler.Register(srv)

	healthSrv := health.NewServer()
	healthSrv.SetServingStatus(contentv1.ContentService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, healthSrv)

	reflection.Register(srv)
	return srv, healthSrv
}
```

`bootstrap/serve.go` — copy twofa's `serve.go` and remove the Redis + auth-client lines; the service wiring becomes `handler := InitService(pool)`. Swap all `twofa`→`content`, `twofav1`→`contentv1`, `TwoFAService_ServiceDesc`→`ContentService_ServiceDesc`. Resulting middle section:
```go
	pool, err := InitPostgres(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	handler := InitService(pool)
	grpcSrv, healthSrv := InitGRPCServer(handler, logger)
```
(Everything else — signal ctx, listen, serve goroutine, graceful shutdown — is identical to twofa with the name swaps.)

- [ ] **Step 4: Create `cmd/content/main.go`**

Copy `twofa-service/cmd/twofa/main.go`, swap `twofa`→`content`, `TWOFA_`→`CONTENT_`, and reduce `PersistentFlags()` to content's config (drop redis/secret/issuer/auth/verify flags):
```go
	flags.String("grpc-addr", ":9007", "gRPC listen address")
	flags.String("db-dsn", "", "PostgreSQL DSN (or set CONTENT_DB_DSN)")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
	flags.Bool("auto-migrate", true, "run goose migrations on startup")
	flags.Duration("shutdown-timeout", 15*time.Second, "graceful shutdown timeout")
```
Keep the `subCmd` migrate-up/down/status wiring and `Use: "content"`, `Short: "Andrey content service"`.

- [ ] **Step 5: Tidy + build the whole module**

Run: `cd backend/services/content-service && go mod tidy && go build ./...`
Expected: exit 0.

- [ ] **Step 6: Smoke-run against the dev DB** (optional but recommended)

Run: `cd backend/services/content-service && CONTENT_DB_DSN="postgres://andrey:andrey@localhost:5432/andrey?sslmode=disable" go run ./cmd/content migrate-status`
Expected: prints goose status for `content_goose_db_version` (requires local Postgres up; skip if not running).

- [ ] **Step 7: Commit**

```bash
git add backend/services/content-service/internal/transport backend/services/content-service/internal/bootstrap backend/services/content-service/cmd backend/services/content-service/go.mod backend/services/content-service/go.sum
git commit -m "feat(content): grpc transport + bootstrap + main — service boots"
```

---

## Task 6: Dockerfile, compose, Makefile

**Files:**
- Create: `backend/services/content-service/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `backend/Makefile:1`

**Interfaces:** none (deploy plumbing).

- [ ] **Step 1: Create Dockerfile**

Copy `backend/services/twofa-service/Dockerfile` to `backend/services/content-service/Dockerfile`, changing every `twofa` token to `content` (build path `./cmd/content`, binary name `content`, any `TWOFA` label). It is a `distroless/static` static-Go image (no gltfpack), same as twofa.

- [ ] **Step 2: Add `content` to `docker-compose.yml`**

Insert after the `twofa:` service block:
```yaml
  content:
    build:
      context: ./backend
      dockerfile: services/content-service/Dockerfile
    depends_on:
      postgres: { condition: service_healthy }
    expose:
      - "9007"
    environment:
      CONTENT_GRPC_ADDR: ":9007"
      # Shares the andrey DB with catalog/auth/twofa; isolated by content_goose_db_version.
      CONTENT_DB_DSN: "postgres://andrey:andrey@postgres:5432/andrey?sslmode=disable"
      CONTENT_AUTO_MIGRATE: "true"
      CONTENT_LOG_LEVEL: "info"
```

Then in the `gateway:` block add to `depends_on`:
```yaml
      content: { condition: service_started }
```
and to `gateway.environment`:
```yaml
      GATEWAY_CONTENT_GRPC_ADDR: "content:9007"
```

- [ ] **Step 3: Add to Makefile**

Modify `backend/Makefile:1`:
```make
SERVICES := gateway-service catalog-service auth-service twofa-service content-service mesh-service asset-service upload-service
```

- [ ] **Step 4: Build the image**

Run: `cd /Users/vbncursed/programming/rosneft && docker compose build content`
Expected: image builds successfully.

- [ ] **Step 5: Commit**

```bash
git add backend/services/content-service/Dockerfile docker-compose.yml backend/Makefile
git commit -m "build(content): Dockerfile, compose service, Makefile entry"
```

---

## Task 7: Gateway — Content client + re-point documents/panoramas/scene-bundle

**Files:**
- Create: `backend/services/gateway-service/internal/clients/content/{client.go,documents.go,panoramas.go,converters.go}`
- Modify: `backend/services/gateway-service/internal/service/gateway.go` (add `Content` iface + field + ctor)
- Modify: `backend/services/gateway-service/internal/service/documents.go`, `.../panoramas.go` (`g.catalog`→`g.content`)
- Modify: `backend/services/gateway-service/internal/service/scene_bundle.go` (docs/panorama legs → `g.content`)
- Modify: `backend/services/gateway-service/internal/bootstrap/*` (dial content, pass to `service.New`)
- Modify: `backend/services/gateway-service/internal/config/*` (add `ContentGRPCAddr`)
- Regenerate: `backend/services/gateway-service/internal/service/mocks/`

**Interfaces:**
- Consumes: `contentv1` client, gateway `domain.Document`/`domain.Panorama`.
- Produces: `service.Content` interface; `content.Client` with the 7 methods (same signatures the `Catalog` iface had for these).

- [ ] **Step 1: Create the content client package**

`clients/content/client.go` — copy `clients/catalog/client.go`, swap `catalog`→`content`, `catalogv1`→`contentv1`, `CatalogServiceClient`→`ContentServiceClient`.

`clients/content/documents.go` and `clients/content/panoramas.go` — `git mv` from `clients/catalog/documents.go` and `clients/catalog/panoramas.go`, then swap package `catalog`→`content`, `c.cc.ListDocuments`/etc. now hit `contentv1` requests. The pb→domain conversion moves too.

`clients/content/converters.go` — move ONLY the document/panorama converters (pb↔domain) needed by the two files above out of `clients/catalog/converters.go` into the new file. Leave territory/model/placement converters in catalog's.

- [ ] **Step 2: Add `Content` interface to `gateway.go`**

In `backend/services/gateway-service/internal/service/gateway.go`:
- Remove the 7 doc/panorama methods from the `Catalog` interface.
- Add a new interface:
```go
// Content is the content-service client surface this service calls.
type Content interface {
	ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error)
	CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	DeletePanorama(ctx context.Context, id int64) error
	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, id int64) error
}
```
- Update the `//go:generate` line: `//go:generate minimock -i Catalog,Content,Mesh,Upload -o ./mocks -s _mock.go`.
- Add `content Content` to the `Gateway` struct and a `content` param to `New`:
```go
type Gateway struct {
	catalog Catalog
	content Content
	mesh    Mesh
	upload  Upload
}

func New(catalog Catalog, content Content, mesh Mesh, upload Upload) *Gateway {
	return &Gateway{catalog: catalog, content: content, mesh: mesh, upload: upload}
}
```

- [ ] **Step 3: Re-point service methods**

In `service/documents.go` and `service/panoramas.go`: replace every `g.catalog.` with `g.content.` (the 7 call sites). Validation logic unchanged.

In `service/scene_bundle.go`: the errgroup legs that call `g.catalog.ListPanoramas(...)` and `g.catalog.ListDocuments(...)` become `g.content.ListPanoramas(...)` / `g.content.ListDocuments(...)`. Territory/model/placement legs stay on `g.catalog`.

- [ ] **Step 4: Config + bootstrap wiring**

In gateway `config` — add `ContentGRPCAddr string` (mapstructure `content-grpc-addr`), a default `"content:9007"`, and the `--content-grpc-addr` flag mirroring `--catalog-grpc-addr` (find those in gateway `cmd`/`config` and copy the pattern).

In gateway `bootstrap` — where it dials catalog and calls `service.New(catalogClient, meshClient, uploadClient)`:
```go
	contentClient, err := content.Dial(cfg.ContentGRPCAddr)
	if err != nil { return ... }
	defer func() { _ = contentClient.Close() }()
	...
	svc := service.New(catalogClient, contentClient, meshClient, uploadClient)
```
Add the `content` client import.

- [ ] **Step 5: Regenerate mocks + fix test constructors**

Run: `cd backend/services/gateway-service && go generate ./internal/service/...`
Expected: `mocks/content_mock.go` created, `catalog_mock.go` shrinks (7 methods gone).

Then update every `service.New(...)` call in gateway `*_test.go` to pass a `ContentMock` in the new 2nd position. In `scene_bundle_test.go`, `documents`/`panoramas` service tests: set expectations on the `ContentMock` instead of `CatalogMock` for those calls.

- [ ] **Step 6: Build + test gateway**

Run: `cd backend/services/gateway-service && go mod tidy && go build ./... && go test ./...`
Expected: exit 0, tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/services/gateway-service
git commit -m "feat(gateway): route documents + panoramas to content-service"
```

---

## Task 8: Remove documents + panoramas from catalog

**Files:**
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto` (drop 7 RPCs + doc/panorama messages) + regenerate
- Modify: `backend/services/catalog-service/internal/service/catalog.go` (drop 7 Repository methods)
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/server.go` if it references removed handlers
- Delete: catalog `transport/grpcapi/{create,list,delete}_document.go`, panorama handler files
- Delete: catalog `domain/document.go`, `domain/panorama.go` (if now unused)
- Modify: `catalog-service/internal/storage/queries.go` (scanDocument/scanPanorama already moved — ensure none dangling)
- Regenerate: catalog service `mocks/`

**Interfaces:**
- Produces: slimmer `CatalogService` (48 RPCs), slimmer catalog `Repository`.

- [ ] **Step 1: Trim `catalog.proto`**

Remove the 3 document + 4 panorama `rpc` lines from `service CatalogService`, and delete the `Panorama`, `Document`, and their 7 request/response messages. Keep `Vec3` (still used by artifacts/placements).

Run: `cd backend && make proto-gen`
Expected: exit 0; catalog gen no longer has ListDocuments/Panorama stubs.

- [ ] **Step 2: Trim catalog `Repository`**

In `catalog-service/internal/service/catalog.go`, delete the 7 method signatures (the `ListPanoramas … DeleteDocument` block shown in the design). Keep everything else.

- [ ] **Step 3: Delete catalog transport handlers**

`git rm` catalog `internal/transport/grpcapi/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go`. In `grpcapi/server.go`, remove any references (the `UnimplementedCatalogServiceServer` covers absent methods; delete any leftover registration lines that named them).

- [ ] **Step 4: Delete now-unused domain files**

Run: `cd backend && grep -rn 'domain.Document\|domain.Panorama' services/catalog-service/`
Expected: no hits. Then `git rm services/catalog-service/internal/domain/document.go services/catalog-service/internal/domain/panorama.go`. (If any hit remains, resolve it before deleting.)

- [ ] **Step 5: Regenerate catalog mocks + build + test**

Run: `cd backend/services/catalog-service && go generate ./internal/service/... && go mod tidy && go build ./... && go test ./...`
Expected: exit 0, tests PASS. (`documents_test.go` already moved in Task 4.)

- [ ] **Step 6: Full workspace build + test**

Run: `cd backend && make build && make test`
Expected: every module builds and tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/proto backend/services/catalog-service
git commit -m "refactor(catalog): drop documents + panoramas (now owned by content-service)"
```

---

## Task 9: Integration verification + docs

**Files:**
- Modify: `backend/CLAUDE.md` (services table + mesh/CLAUDE stale bits)

- [ ] **Step 1: Bring the stack up**

Run: `cd /Users/vbncursed/programming/rosneft && docker compose up --build -d`
Expected: `content` container healthy; `docker compose ps` shows it Up.

- [ ] **Step 2: Exercise documents end-to-end**

With an existing territory slug `<slug>` and a valid uploaded blob hash `<hash>`:
```bash
curl -s -X POST localhost:8080/api/territories/<slug>/documents \
  -H 'content-type: application/json' \
  -d '{"title":"Spec","sourceBlobHash":"<hash>"}'
curl -s localhost:8080/api/territories/<slug>/documents
```
Expected: POST returns 201 with the document; GET lists it. (Confirms gateway→content path.)

- [ ] **Step 3: Exercise panoramas end-to-end**

```bash
curl -s -X POST localhost:8080/api/territories/<slug>/panoramas \
  -H 'content-type: application/json' \
  -d '{"slug":"p1","title":"Pano","sourceBlobHash":"<hash>","position":{"x":0,"y":0,"z":0},"yawOffset":0}'
curl -s "localhost:8080/api/territories/<slug>/scene" | jq '.panoramas, .documents'
```
Expected: POST 201; the scene bundle returns the panorama and document (confirms the errgroup legs now hit content-service).

- [ ] **Step 4: Verify cascade**

Delete the territory and confirm its documents/panoramas rows are gone (DB-level cascade still fires despite the ownership move):
```bash
curl -s -X DELETE localhost:8080/api/territories/<slug>
docker compose exec postgres psql -U andrey -d andrey -c \
  "SELECT count(*) FROM territory_documents td JOIN territories t ON t.id=td.territory_id WHERE t.slug='<slug>';"
```
Expected: DELETE 204; count query returns 0 rows (territory gone → children cascaded).

- [ ] **Step 5: Update `backend/CLAUDE.md`**

Update the Services table: add `content` (`services/content-service`, cmd `content`, "Owns documents + panoramas anchored to a territory; Postgres-backed, shared `andrey` DB isolated by `content_goose_db_version`. gRPC `:9007`."). Also add the missing `auth` and `twofa` rows if still absent, and change catalog's row to "territories + models + artifacts + placements + admins" (drop documents/panoramas). Fix the "nine containers" count.

- [ ] **Step 6: Commit**

```bash
git add backend/CLAUDE.md
git commit -m "docs(backend): document content-service; refresh services table"
```

---

## Self-Review

**Spec coverage:**
- Approach A (docs + panoramas → one content-service): Tasks 1–6. ✅
- FK option B1-lite (shared DB, tables in place, cascade at DB layer): Task 2 Step 5 (`IF NOT EXISTS`, empty Down) + Task 9 Step 4 (cascade verify). ✅
- Mirror twofa skeleton: Tasks 2–6 copy twofa files explicitly. ✅
- Gateway re-point (already per-concern; scene bundle legs): Task 7. ✅
- Public REST/frontend unchanged: Task 7 leaves `httpapi/*` + OpenAPI untouched; verified in Task 9 Steps 2–3. ✅
- Catalog shrinks (55→48 RPCs): Task 8. ✅
- Compose/Makefile/go.work: Task 6 + Task 2 Step 2. ✅
- Testing conventions + moved tests: Task 4. ✅
- Stale CLAUDE.md: Task 9 Step 5. ✅

**Placeholder scan:** New files given in full; moved files fully specified by path + substitution + receiver/type changes. Two spots delegate to a `sed`/`grep` reference of an existing catalog file (Task 5 Step 2 panorama handler conversion, Task 3 Step 2 scan helpers) rather than re-pasting — deliberate, because that code exists verbatim in the repo and must be copied, not re-authored.

**Type consistency:** `service.Content` (content) vs `service.Catalog` (catalog) vs gateway `service.Content` interface — all seven method signatures match across storage `PG`, content `Repository`, content `grpcapi.Service`, and gateway `Content` (verified against the catalog `Repository` block in the design). `New` constructor arity change (gateway `New` gains `content` in 2nd position) is applied in Task 7 Step 2 and consumed in Step 4 wiring + Step 5 tests.

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks. Tasks 3–5 must run in order (they build the module incrementally); Tasks 7 and 8 both depend on Tasks 1–6 but are independent of each other.
2. **Inline Execution** — execute in this session with checkpoints.
