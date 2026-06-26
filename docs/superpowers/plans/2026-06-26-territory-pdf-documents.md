# Territory PDF Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach multiple PDF documents to a territory — upload (reusing chunked upload), list/open/delete in the viewer's overlays panel, view in an in-app `<iframe>` overlay. PDFs are stored as-is and served via `/api/assets/{hash}`.

**Architecture:** New lean `document` entity mirroring `panorama` but without slug/position/yaw/update. Spans catalog-service (storage+proto), gateway-service (REST+scene-bundle+perms), auth-service (new permissions), upload-service (server-side PDF magic-byte validation), and a new frontend `document/` bounded context.

**Tech Stack:** Go 1.26 (pgx, gRPC, goose, oapi-codegen, testify/suite + gotest.tools/v3/assert + minimock), Next.js 16 + React 19 + TS, Tailwind v4.

## Global Constraints

- **Go 1.26 idioms:** `errors.AsType[T]`, `t.Context()` in tests, `for i := range n`, `min`/`max`, `slices`/`maps`, `omitzero` not `omitempty`, `new(val)` for pointer-to-literal. (backend/CLAUDE.md)
- **200-line file cap**, backend and frontend. One concern per file; one method per file in storage/service/transport.
- **Backend tests:** `testify/suite` grouping + `gotest.tools/v3/assert` assertions (`assert.X(s.T(), …)`, never `s.Equal()`) + `minimock` mocks built in `SetupTest` via `minimock.NewController(s.T())` (auto-verify), `minimock.AnyContext` for errgroup ctx.
- **Brand:** displayed text uses "Andrey"; never "Rosneft"/"Роснефть". Lowercase `rosneft` module paths are structural — keep.
- **No slug, no update/rename, no position** on a document (deliberate). Delete removes only the DB row, not the blob.
- **Module path prefix:** `github.com/vbncursed/rosneft/backend/...`.
- **Regen, never hand-edit generated files:** `openapi_gen.go`, `dto.ts`, proto `gen/go/...`.

---

## Phase 1 — catalog-service: proto + storage + service + transport

### Task 1: Proto — Document messages and RPCs

**Files:**
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto`

**Interfaces:**
- Produces: `catalogv1.Document{Id,TerritorySlug,Title,SourceBlobHash,CreatedAt}`, RPCs `ListDocuments`/`CreateDocument`/`DeleteDocument` with `{List,Create,Delete}Document{Request,Response}`.

- [ ] **Step 1: Add the three RPCs** to the `CatalogService` block, right after the panorama RPCs (after line `rpc DeletePanorama(...) returns (DeletePanoramaResponse);`):

```proto
  rpc ListDocuments(ListDocumentsRequest) returns (ListDocumentsResponse);
  rpc CreateDocument(CreateDocumentRequest) returns (CreateDocumentResponse);
  rpc DeleteDocument(DeleteDocumentRequest) returns (DeleteDocumentResponse);
```

- [ ] **Step 2: Add the messages** at the end of the file (after `DeletePanoramaResponse {}`):

```proto
// ─── Document RPCs ───────────────────────────────────────────────────────────

// Document is a PDF attached to a territory. Unlike panoramas it has no
// position in the scene and no slug — it is identified by id and its bytes
// are served from BlobStore via the asset service at /api/assets/{hash}.
message Document {
  int64 id = 1;
  string territory_slug = 2;
  string title = 3;
  string source_blob_hash = 4;
  google.protobuf.Timestamp created_at = 5;
}

message ListDocumentsRequest {
  string territory_slug = 1;
}
message ListDocumentsResponse {
  repeated Document documents = 1;
}

message CreateDocumentRequest {
  string territory_slug = 1;
  string title = 2;
  string source_blob_hash = 3;
}
message CreateDocumentResponse {
  Document document = 1;
}

message DeleteDocumentRequest {
  int64 id = 1;
}
message DeleteDocumentResponse {}
```

- [ ] **Step 3: Regenerate Go** from `backend/`:

Run: `make proto-gen`
Expected: success; `backend/proto/gen/go/rosneft/catalog/v1/` now contains `Document`, `ListDocumentsRequest`, etc. and the `CatalogServiceClient`/`Server` interfaces gain the three methods.

- [ ] **Step 4: Verify it compiles** (server/client interfaces changed but nothing implements them yet — only the proto package must build):

Run: `cd backend/proto && go build ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/proto
git commit -m "feat(proto): add catalog Document messages and RPCs"
```

---

### Task 2: catalog migration + domain + storage

**Files:**
- Create: `backend/services/catalog-service/internal/migrate/migrations/00010_territory_documents.sql`
- Create: `backend/services/catalog-service/internal/domain/document.go`
- Modify: `backend/services/catalog-service/internal/domain/errors.go`
- Create: `backend/services/catalog-service/internal/storage/create_document.go`
- Create: `backend/services/catalog-service/internal/storage/list_documents.go`
- Create: `backend/services/catalog-service/internal/storage/delete_document.go`
- Modify: `backend/services/catalog-service/internal/storage/queries.go`

**Interfaces:**
- Produces: `domain.Document{ID int64, TerritorySlug, Title, SourceBlobHash string, CreatedAt time.Time}`; `domain.ErrDocumentNotFound`; repo methods `(*PG).CreateDocument(ctx, domain.Document) (domain.Document, error)`, `(*PG).ListDocuments(ctx, territorySlug string) ([]domain.Document, error)`, `(*PG).DeleteDocument(ctx, id int64) error`.

- [ ] **Step 1: Migration** (numbering follows `00009`):

```sql
-- backend/services/catalog-service/internal/migrate/migrations/00010_territory_documents.sql
-- +goose Up
-- +goose StatementBegin
CREATE TABLE territory_documents (
    id               BIGSERIAL PRIMARY KEY,
    territory_id     BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    source_blob_hash TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_territory_documents_territory ON territory_documents(territory_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE territory_documents;
-- +goose StatementEnd
```

- [ ] **Step 2: Domain type** `internal/domain/document.go`:

```go
package domain

import "time"

// Document is a PDF attached to a territory. It has no scene position and no
// slug — it is identified by ID and its bytes are served from BlobStore via
// the asset service at /api/assets/{SourceBlobHash}.
type Document struct {
	ID             int64
	TerritorySlug  string
	Title          string
	SourceBlobHash string
	CreatedAt      time.Time
}
```

- [ ] **Step 3: Sentinel error** — add to the `var (...)` block in `internal/domain/errors.go`, after `ErrPanoramaNotFound`:

```go
	ErrDocumentNotFound  = errors.New("document not found")
```

- [ ] **Step 4: Query helpers** — append to `internal/storage/queries.go`:

```go
// documentSelectCols joins to territories once to resolve the slug in a single
// round-trip rather than firing an extra lookup per row.
const documentSelectCols = `d.id, t.slug AS territory_slug, d.title,
	d.source_blob_hash, d.created_at`

// documentJoin is the FROM clause used together with documentSelectCols.
const documentJoin = `territory_documents d
	JOIN territories t ON t.id = d.territory_id`

func scanDocument(r rowScanner) (domain.Document, error) {
	var d domain.Document
	err := r.Scan(&d.ID, &d.TerritorySlug, &d.Title, &d.SourceBlobHash, &d.CreatedAt)
	return d, err
}
```

- [ ] **Step 5: create_document.go**:

```go
package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateDocument inserts a new document. A missing territory slug yields
// ErrTerritoryNotFound.
func (r *PG) CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error) {
	const q = `
		WITH inserted AS (
			INSERT INTO territory_documents (territory_id, title, source_blob_hash)
			SELECT t.id, $2, $3
			FROM territories t
			WHERE t.slug = $1
			RETURNING id, territory_id, title, source_blob_hash, created_at
		)
		SELECT i.id, t.slug, i.title, i.source_blob_hash, i.created_at
		FROM inserted i
		JOIN territories t ON t.id = i.territory_id`

	row := r.pool.QueryRow(ctx, q, d.TerritorySlug, d.Title, d.SourceBlobHash)
	out, err := scanDocument(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Document{}, domain.ErrTerritoryNotFound
		}
		return domain.Document{}, fmt.Errorf("storage.CreateDocument: %w", err)
	}
	return out, nil
}
```

- [ ] **Step 6: list_documents.go**:

```go
package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListDocuments returns every document attached to a territory, ordered by
// creation time. An unknown territory yields ErrTerritoryNotFound rather than
// an empty list so callers distinguish "no documents yet" from "no such
// territory".
func (r *PG) ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error) {
	if _, err := r.GetTerritory(ctx, territorySlug); err != nil {
		return nil, err
	}

	const q = `SELECT ` + documentSelectCols + `
		FROM ` + documentJoin + `
		WHERE t.slug = $1
		ORDER BY d.created_at`

	rows, err := r.pool.Query(ctx, q, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListDocuments: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Document, 0, 4)
	for rows.Next() {
		d, err := scanDocument(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListDocuments: scan: %w", err)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListDocuments: iter: %w", err)
	}
	return out, nil
}
```

- [ ] **Step 7: delete_document.go**:

```go
package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteDocument removes a document by ID. An unknown ID returns
// ErrDocumentNotFound so the service layer can surface it as 404. The blob is
// left in BlobStore (content-addressed, possibly shared).
func (r *PG) DeleteDocument(ctx context.Context, id int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM territory_documents WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage.DeleteDocument: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrDocumentNotFound
	}
	return nil
}
```

- [ ] **Step 8: Verify it compiles**

Run: `cd backend/services/catalog-service && go build ./...`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/services/catalog-service/internal/migrate backend/services/catalog-service/internal/domain backend/services/catalog-service/internal/storage
git commit -m "feat(catalog): territory_documents table, domain, and storage CRUD"
```

---

### Task 3: catalog service layer + Repository interface + tests

**Files:**
- Create: `backend/services/catalog-service/internal/service/create_document.go`
- Create: `backend/services/catalog-service/internal/service/list_documents.go`
- Create: `backend/services/catalog-service/internal/service/delete_document.go`
- Modify: `backend/services/catalog-service/internal/service/catalog.go` (Repository interface)
- Create: `backend/services/catalog-service/internal/service/documents_test.go`
- Regenerate: `backend/services/catalog-service/internal/service/mocks/` (minimock)

**Interfaces:**
- Consumes: `Repository.CreateDocument/ListDocuments/DeleteDocument` (Task 2).
- Produces: `(*Catalog).CreateDocument(ctx, domain.Document) (domain.Document, error)`, `ListDocuments(ctx, territorySlug) ([]domain.Document, error)`, `DeleteDocument(ctx, id int64) error`.

- [ ] **Step 1: Add to the `Repository` interface** in `service/catalog.go`, after the panorama block (before the closing `}`):

```go

	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, id int64) error
```

- [ ] **Step 2: Regenerate the repo mock** (the `//go:generate` directive is on `catalog.go`):

Run: `cd backend/services/catalog-service && go generate ./internal/service/...`
Expected: `internal/service/mocks/repository_mock.go` regenerated with the three new methods.

- [ ] **Step 3: create_document.go** (no slug resolution — documents have no slug):

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateDocument validates the input and persists the document. source_blob_hash
// is immutable; there is no slug and no update path.
func (c *Catalog) CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error) {
	if d.TerritorySlug == "" {
		return domain.Document{}, fmt.Errorf("service.CreateDocument: %w: territory_slug is required", domain.ErrInvalidInput)
	}
	if d.Title == "" {
		return domain.Document{}, fmt.Errorf("service.CreateDocument: %w: title is required", domain.ErrInvalidInput)
	}
	if d.SourceBlobHash == "" {
		return domain.Document{}, fmt.Errorf("service.CreateDocument: %w: source_blob_hash is required", domain.ErrInvalidInput)
	}
	return c.repo.CreateDocument(ctx, d)
}
```

- [ ] **Step 4: list_documents.go**:

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListDocuments returns the documents attached to a territory.
func (c *Catalog) ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("service.ListDocuments: %w: territory_slug is required", domain.ErrInvalidInput)
	}
	return c.repo.ListDocuments(ctx, territorySlug)
}
```

- [ ] **Step 5: delete_document.go**:

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteDocument removes a document by ID.
func (c *Catalog) DeleteDocument(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("service.DeleteDocument: %w: id is required", domain.ErrInvalidInput)
	}
	return c.repo.DeleteDocument(ctx, id)
}
```

- [ ] **Step 6: Write the failing test** `service/documents_test.go` (mirrors the suite/minimock/gotest.tools convention):

```go
package service_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

type DocumentsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
}

func (s *DocumentsSuite) SetupTest() {
	ctrl := minimock.NewController(s.T())
	s.repo = mocks.NewRepositoryMock(ctrl)
	s.svc = service.New(s.repo)
}

func (s *DocumentsSuite) TestCreate_RequiresTitle() {
	_, err := s.svc.CreateDocument(s.T().Context(), domain.Document{
		TerritorySlug: "site-a", SourceBlobHash: "abc",
	})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *DocumentsSuite) TestCreate_RequiresBlobHash() {
	_, err := s.svc.CreateDocument(s.T().Context(), domain.Document{
		TerritorySlug: "site-a", Title: "Spec",
	})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *DocumentsSuite) TestCreate_PersistsValid() {
	in := domain.Document{TerritorySlug: "site-a", Title: "Spec", SourceBlobHash: "abc"}
	want := domain.Document{ID: 7, TerritorySlug: "site-a", Title: "Spec", SourceBlobHash: "abc"}
	s.repo.CreateDocumentMock.Expect(minimock.AnyContext, in).Return(want, nil)

	got, err := s.svc.CreateDocument(s.T().Context(), in)
	assert.NilError(s.T(), err)
	assert.Check(s.T(), cmp.Equal(want, got))
}

func (s *DocumentsSuite) TestList_RequiresSlug() {
	_, err := s.svc.ListDocuments(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *DocumentsSuite) TestList_Delegates() {
	want := []domain.Document{{ID: 1, TerritorySlug: "site-a", Title: "Spec"}}
	s.repo.ListDocumentsMock.Expect(minimock.AnyContext, "site-a").Return(want, nil)

	got, err := s.svc.ListDocuments(s.T().Context(), "site-a")
	assert.NilError(s.T(), err)
	assert.Check(s.T(), cmp.DeepEqual(want, got))
}

func (s *DocumentsSuite) TestDelete_RequiresPositiveID() {
	err := s.svc.DeleteDocument(s.T().Context(), 0)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *DocumentsSuite) TestDelete_Delegates() {
	s.repo.DeleteDocumentMock.Expect(minimock.AnyContext, int64(7)).Return(nil)
	err := s.svc.DeleteDocument(s.T().Context(), 7)
	assert.NilError(s.T(), err)
}

func TestDocumentsSuite(t *testing.T) {
	suite.Run(t, new(DocumentsSuite))
}
```

- [ ] **Step 7: Run the test, verify it passes** (after the service methods from Steps 3–5 exist):

Run: `cd backend/services/catalog-service && go test ./internal/service/ -run TestDocumentsSuite -v`
Expected: PASS (7 subtests)

- [ ] **Step 8: Commit**

```bash
git add backend/services/catalog-service/internal/service
git commit -m "feat(catalog): document service CRUD with validation + tests"
```

---

### Task 4: catalog gRPC transport

**Files:**
- Create: `backend/services/catalog-service/internal/transport/grpcapi/create_document.go`
- Create: `backend/services/catalog-service/internal/transport/grpcapi/list_documents.go`
- Create: `backend/services/catalog-service/internal/transport/grpcapi/delete_document.go`
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/converters.go` (add `documentToProto`)
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/server.go` (Service interface + error map)

**Interfaces:**
- Consumes: `Service.{Create,List,Delete}Document` (Task 3); `catalogv1.*Document*` (Task 1).
- Produces: gRPC handlers wired into `CatalogServiceServer`.

- [ ] **Step 1: Add `documentToProto`** to `converters.go` (after `panoramaToProto`):

```go
func documentToProto(d domain.Document) *catalogv1.Document {
	return &catalogv1.Document{
		Id:             d.ID,
		TerritorySlug:  d.TerritorySlug,
		Title:          d.Title,
		SourceBlobHash: d.SourceBlobHash,
		CreatedAt:      timestamppb.New(d.CreatedAt),
	}
}
```

- [ ] **Step 2: Extend the `Service` interface** in `server.go`, after the panorama methods:

```go

	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, id int64) error
```

- [ ] **Step 3: Add `ErrDocumentNotFound`** to `statusByCode[codes.NotFound]` in `server.go`:

```go
			domain.ErrDocumentNotFound,
```

- [ ] **Step 4: create_document.go**:

```go
package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) CreateDocument(ctx context.Context, req *catalogv1.CreateDocumentRequest) (*catalogv1.CreateDocumentResponse, error) {
	out, err := s.svc.CreateDocument(ctx, domain.Document{
		TerritorySlug:  req.GetTerritorySlug(),
		Title:          req.GetTitle(),
		SourceBlobHash: req.GetSourceBlobHash(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.CreateDocumentResponse{Document: documentToProto(out)}, nil
}
```

- [ ] **Step 5: list_documents.go**:

```go
package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListDocuments(ctx context.Context, req *catalogv1.ListDocumentsRequest) (*catalogv1.ListDocumentsResponse, error) {
	items, err := s.svc.ListDocuments(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.Document, len(items))
	for i, d := range items {
		out[i] = documentToProto(d)
	}
	return &catalogv1.ListDocumentsResponse{Documents: out}, nil
}
```

- [ ] **Step 6: delete_document.go**:

```go
package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) DeleteDocument(ctx context.Context, req *catalogv1.DeleteDocumentRequest) (*catalogv1.DeleteDocumentResponse, error) {
	if err := s.svc.DeleteDocument(ctx, req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeleteDocumentResponse{}, nil
}
```

- [ ] **Step 7: Verify the whole module builds + tests** (the `Server` now satisfies the regenerated `CatalogServiceServer`):

Run: `cd backend/services/catalog-service && go build ./... && go test ./...`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/services/catalog-service/internal/transport
git commit -m "feat(catalog): gRPC handlers for document CRUD"
```

---

## Phase 2 — gateway-service: client + service + REST + scene bundle + perms + swagger

### Task 5: gateway catalog client + domain + SceneBundle field

**Files:**
- Create: `backend/services/gateway-service/internal/domain/document.go`
- Modify: `backend/services/gateway-service/internal/domain/types.go` (SceneBundle.Documents)
- Modify: `backend/services/gateway-service/internal/domain/errors.go` (ErrDocumentNotFound)
- Create: `backend/services/gateway-service/internal/clients/catalog/documents.go`
- Modify: `backend/services/gateway-service/internal/clients/catalog/converters.go` (documentFromProto)

**Interfaces:**
- Produces: `domain.Document` (gateway), `(*Client).ListDocuments/CreateDocument/DeleteDocument`.

- [ ] **Step 1: gateway `domain/document.go`**:

```go
package domain

import "time"

// Document is a PDF attached to a territory. No scene position, no slug; its
// bytes are served from BlobStore via /api/assets/{SourceBlobHash}.
type Document struct {
	ID             int64
	TerritorySlug  string
	Title          string
	SourceBlobHash string
	CreatedAt      time.Time
}
```

- [ ] **Step 2: SceneBundle field** — add to the `SceneBundle` struct in `domain/types.go`, after `Panoramas`:

```go
	Documents    []Document
```

- [ ] **Step 3: ErrDocumentNotFound** — add to the gateway `domain/errors.go` `var (...)` block (mirror where `ErrPanoramaNotFound` is declared):

```go
	ErrDocumentNotFound  = errors.New("document not found")
```

- [ ] **Step 4: `documentFromProto`** — add to `clients/catalog/converters.go` (mirror `panoramaFromProto`):

```go
func documentFromProto(d *catalogv1.Document) domain.Document {
	if d == nil {
		return domain.Document{}
	}
	return domain.Document{
		ID:             d.GetId(),
		TerritorySlug:  d.GetTerritorySlug(),
		Title:          d.GetTitle(),
		SourceBlobHash: d.GetSourceBlobHash(),
		CreatedAt:      d.GetCreatedAt().AsTime(),
	}
}
```

- [ ] **Step 5: `clients/catalog/documents.go`**:

```go
package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListDocuments returns every document attached to the given territory.
func (c *Client) ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error) {
	resp, err := c.cc.ListDocuments(ctx, &catalogv1.ListDocumentsRequest{TerritorySlug: territorySlug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListDocuments: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.Document, len(resp.GetDocuments()))
	for i, d := range resp.GetDocuments() {
		out[i] = documentFromProto(d)
	}
	return out, nil
}

// CreateDocument attaches a new document to the territory.
func (c *Client) CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error) {
	resp, err := c.cc.CreateDocument(ctx, &catalogv1.CreateDocumentRequest{
		TerritorySlug:  d.TerritorySlug,
		Title:          d.Title,
		SourceBlobHash: d.SourceBlobHash,
	})
	if err != nil {
		return domain.Document{}, fmt.Errorf("catalog.CreateDocument: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return documentFromProto(resp.GetDocument()), nil
}

// DeleteDocument removes a document by ID.
func (c *Client) DeleteDocument(ctx context.Context, id int64) error {
	_, err := c.cc.DeleteDocument(ctx, &catalogv1.DeleteDocumentRequest{Id: id})
	if err != nil {
		return fmt.Errorf("catalog.DeleteDocument: %w", grpcerr.MapStatus(err, domain.ErrDocumentNotFound))
	}
	return nil
}
```

- [ ] **Step 6: Verify**

Run: `cd backend/services/gateway-service && go build ./internal/clients/... ./internal/domain/...`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/services/gateway-service/internal/domain backend/services/gateway-service/internal/clients
git commit -m "feat(gateway): document domain + catalog client methods"
```

---

### Task 6: gateway service layer + scene bundle wiring

**Files:**
- Create: `backend/services/gateway-service/internal/service/documents.go`
- Modify: `backend/services/gateway-service/internal/service/gateway.go` (Catalog interface)
- Modify: `backend/services/gateway-service/internal/service/scene_bundle.go` (fan-out + nilToEmpty)
- Regenerate: `backend/services/gateway-service/internal/service/mocks/` (minimock for Catalog)

**Interfaces:**
- Consumes: `Catalog.ListDocuments/CreateDocument/DeleteDocument` (Task 5).
- Produces: `(*Gateway).ListDocuments/CreateDocument/DeleteDocument`; `SceneBundle.Documents` populated.

- [ ] **Step 1: Add to the `Catalog` interface** in `service/gateway.go`, after the panorama methods:

```go

	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, id int64) error
```

- [ ] **Step 2: Regenerate the Catalog mock**:

Run: `cd backend/services/gateway-service && go generate ./internal/service/...`
Expected: `internal/service/mocks/catalog_mock.go` regenerated with the three methods.

- [ ] **Step 3: `service/documents.go`**:

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListDocuments returns the documents attached to a territory.
func (g *Gateway) ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	return g.catalog.ListDocuments(ctx, territorySlug)
}

// CreateDocument validates input and persists the document.
func (g *Gateway) CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error) {
	if d.TerritorySlug == "" {
		return domain.Document{}, fmt.Errorf("%w: territory slug is required", domain.ErrInvalidInput)
	}
	if d.Title == "" {
		return domain.Document{}, fmt.Errorf("%w: title is required", domain.ErrInvalidInput)
	}
	if d.SourceBlobHash == "" {
		return domain.Document{}, fmt.Errorf("%w: source_blob_hash is required", domain.ErrInvalidInput)
	}
	return g.catalog.CreateDocument(ctx, d)
}

// DeleteDocument removes a document by ID.
func (g *Gateway) DeleteDocument(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return g.catalog.DeleteDocument(ctx, id)
}
```

- [ ] **Step 4: Wire documents into `scene_bundle.go`.** Add `documents []domain.Document` to the `var (...)` block; add a fan-out goroutine after the panoramas one:

```go
	gr.Go(func() error {
		d, err := g.catalog.ListDocuments(gctx, slug)
		if err != nil && !errors.Is(err, domain.ErrTerritoryNotFound) {
			return err
		}
		documents = d
		return nil
	})
```

After `bundle.Panoramas = nilToEmptyPanoramas(panoramas)` add:

```go
	bundle.Documents = nilToEmptyDocuments(documents)
```

And append the helper at the end of the file:

```go
func nilToEmptyDocuments(in []domain.Document) []domain.Document {
	if in == nil {
		return []domain.Document{}
	}
	return in
}
```

- [ ] **Step 5: Verify build + existing scene-bundle tests still pass** (the new fan-out call means the Catalog mock used in `scene_bundle_test.go` must expect `ListDocuments`; the regenerated mock provides it — set an expectation if those tests assert exact calls):

Run: `cd backend/services/gateway-service && go build ./internal/service/... && go test ./internal/service/ -run SceneBundle -v`
Expected: PASS. If a scene-bundle test fails because the new `ListDocuments` call is unmet, add `catalog.ListDocumentsMock.Return(nil, nil)` (or `.Expect(minimock.AnyContext, slug).Return(...)`) to that test's setup, mirroring how `ListPanoramas` is stubbed there.

- [ ] **Step 6: Commit**

```bash
git add backend/services/gateway-service/internal/service
git commit -m "feat(gateway): document service + scene-bundle aggregation"
```

---

### Task 7: gateway OpenAPI (swagger) + REST handlers + route permissions

**Files:**
- Modify: `backend/services/gateway-service/api/openapi.yaml`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/route_permissions.go`
- Create: `backend/services/gateway-service/internal/transport/httpapi/documents.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/converters.go` (documentToAPI + scene-bundle mapping)
- Modify: `backend/services/gateway-service/internal/transport/httpapi/server.go` (Service interface)
- Regenerate: `backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go` + embedded spec

**Interfaces:**
- Consumes: `(*Gateway).ListDocuments/CreateDocument/DeleteDocument` (Task 6).
- Produces: REST routes `GET`/`POST /api/territories/{slug}/documents`, `DELETE /api/territories/{slug}/documents/{id}`; `documents[]` in the scene response; Scalar UI entries.

- [ ] **Step 1: OpenAPI schemas** — add `Document` and `DocumentCreate` to `components.schemas` (place near `Panorama`):

```yaml
    Document:
      type: object
      required: [id, territorySlug, title, sourceBlobHash]
      description: |
        A PDF attached to a territory. Served as-is from BlobStore via
        /api/assets/{sourceBlobHash}; not converted, not anchored in the scene.
      properties:
        id: { type: integer, format: int64 }
        territorySlug: { type: string }
        title: { type: string }
        sourceBlobHash:
          type: string
          description: BlobStore hash for the PDF; served via /api/assets/{hash}.
        createdAt: { type: string, format: date-time }

    DocumentCreate:
      type: object
      required: [title, sourceBlobHash]
      description: Body for POST /api/territories/{slug}/documents.
      properties:
        title: { type: string }
        sourceBlobHash: { type: string }
```

- [ ] **Step 2: OpenAPI paths** — add after the panorama paths:

```yaml
  /api/territories/{slug}/documents:
    parameters:
      - name: slug
        in: path
        required: true
        schema: { type: string }
    get:
      operationId: listDocuments
      summary: List PDF documents attached to a territory
      tags: [documents]
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Document' }
    post:
      operationId: createDocument
      summary: Attach a PDF document to the territory
      tags: [documents]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/DocumentCreate' }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Document' }

  /api/territories/{slug}/documents/{id}:
    parameters:
      - name: slug
        in: path
        required: true
        schema: { type: string }
      - name: id
        in: path
        required: true
        schema: { type: integer, format: int64 }
    delete:
      operationId: deleteDocument
      summary: Remove a document
      tags: [documents]
      responses:
        '204': { description: Deleted }
```

- [ ] **Step 3: SceneBundle schema** — add `documents` to the `SceneBundle` schema properties (after `panoramas`):

```yaml
        documents:
          type: array
          description: PDF documents attached to this territory.
          items: { $ref: '#/components/schemas/Document' }
```

- [ ] **Step 4: Route permissions** — add to the `routePerms` map in `route_permissions.go` (after the panorama entries):

```go
	"POST /api/territories/{slug}/documents":        "document:write",
	"DELETE /api/territories/{slug}/documents/{id}": "document:delete",
```

- [ ] **Step 5: Regenerate** the server stubs + embedded spec (this is the "update swagger" step — Scalar UI now lists the document endpoints):

Run: `cd backend && make openapi-gen`
Expected: `gateway-service/internal/transport/httpapi/openapi_gen.go` now contains `Document`, `DocumentCreate`, `ListDocumentsRequestObject`, `CreateDocument201JSONResponse`, `DeleteDocument204Response`, and the generated `StrictServerInterface` requires `ListDocuments`/`CreateDocument`/`DeleteDocument`. The generated `SceneBundle` struct gains `Documents *[]Document`.

- [ ] **Step 6: Add `documentToAPI`** to `httpapi/converters.go` (after `panoramaToAPI`):

```go
func documentToAPI(d domain.Document) Document {
	out := Document{
		Id:             d.ID,
		TerritorySlug:  d.TerritorySlug,
		Title:          d.Title,
		SourceBlobHash: d.SourceBlobHash,
	}
	if !d.CreatedAt.IsZero() {
		out.CreatedAt = &d.CreatedAt
	}
	return out
}
```

- [ ] **Step 7: Map documents into the scene-bundle response.** In `httpapi/converters.go`, find where the scene bundle builds `pans` from `bundle.Panoramas` (the `panoramaToAPI` loop around line 179) and add a parallel `docs` slice assigned to the response's `Documents` field. Mirror the exact pattern used for `pans`:

```go
	docs := make([]Document, len(b.Documents))
	for i, d := range b.Documents {
		docs[i] = documentToAPI(d)
	}
	// ...assign &docs (or docs) to the SceneBundle response's Documents field,
	// matching how Panoramas is assigned just above.
```

- [ ] **Step 8: Extend the hand-written `Service` interface** in `httpapi/server.go`, after the panorama methods:

```go

	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, id int64) error
```

- [ ] **Step 9: `httpapi/documents.go`** (mirrors `panoramas.go`; no Update, no Position):

```go
package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) ListDocuments(ctx context.Context, req ListDocumentsRequestObject) (ListDocumentsResponseObject, error) {
	out, err := s.svc.ListDocuments(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return ListDocuments404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return ListDocuments500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(ListDocuments200JSONResponse, len(out))
	for i, d := range out {
		resp[i] = documentToAPI(d)
	}
	return resp, nil
}

func (s *Server) CreateDocument(ctx context.Context, req CreateDocumentRequestObject) (CreateDocumentResponseObject, error) {
	if req.Body == nil {
		return CreateDocument400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}}, nil
	}
	body := *req.Body
	d, err := s.svc.CreateDocument(ctx, domain.Document{
		TerritorySlug:  req.Slug,
		Title:          body.Title,
		SourceBlobHash: body.SourceBlobHash,
	})
	switch {
	case isInvalid(err):
		return CreateDocument400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return CreateDocument404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return CreateDocument500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return CreateDocument201JSONResponse(documentToAPI(d)), nil
}

func (s *Server) DeleteDocument(ctx context.Context, req DeleteDocumentRequestObject) (DeleteDocumentResponseObject, error) {
	err := s.svc.DeleteDocument(ctx, req.Id)
	switch {
	case isNotFound(err):
		return DeleteDocument404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeleteDocument500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return DeleteDocument204Response{}, nil
}
```

> Note: the exact generated response-type names (e.g. `ListDocuments200JSONResponse`) come from the operationIds in Step 1–2. If `make openapi-gen` produced different casing, match the names in `openapi_gen.go`.

- [ ] **Step 10: Verify the gateway builds + tests**

Run: `cd backend/services/gateway-service && go build ./... && go test ./...`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add backend/services/gateway-service
git commit -m "feat(gateway): document REST endpoints, scene-bundle field, swagger, perms"
```

---

## Phase 3 — auth-service: new permissions

### Task 8: document permissions migration

**Files:**
- Create: `backend/services/auth-service/internal/migrate/migrations/00006_document_permissions.sql`

- [ ] **Step 1: Migration** (numbering follows `00005`; grants to admin+editor explicitly because admin's perms were a one-time snapshot in `00002`):

```sql
-- backend/services/auth-service/internal/migrate/migrations/00006_document_permissions.sql
-- +goose Up
-- +goose StatementBegin
INSERT INTO permissions (slug, description) VALUES
    ('document:read','read documents'),
    ('document:write','create/update documents'),
    ('document:delete','delete documents');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
    ON p.slug IN ('document:read','document:write','document:delete')
WHERE r.slug IN ('admin','editor');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
    ON p.slug = 'document:read'
WHERE r.slug IN ('owner','viewer');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions WHERE permission_id IN
    (SELECT id FROM permissions WHERE slug LIKE 'document:%');
DELETE FROM permissions WHERE slug LIKE 'document:%';
-- +goose StatementEnd
```

- [ ] **Step 2: Verify auth-service builds** (migrations are embedded via `//go:embed`):

Run: `cd backend/services/auth-service && go build ./...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/services/auth-service/internal/migrate
git commit -m "feat(auth): document:read/write/delete permissions"
```

---

## Phase 4 — upload-service: server-side PDF validation

### Task 9: fileheader.IsPDF helper + test

**Files:**
- Create: `backend/pkg/fileheader/fileheader.go`
- Create: `backend/pkg/fileheader/fileheader_test.go`

**Interfaces:**
- Produces: `fileheader.IsPDF([]byte) bool`.

- [ ] **Step 1: Write the failing test** `backend/pkg/fileheader/fileheader_test.go`:

```go
package fileheader_test

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/fileheader"
)

func TestIsPDF(t *testing.T) {
	cases := []struct {
		name   string
		header []byte
		want   bool
	}{
		{"valid", []byte("%PDF-1.7\n..."), true},
		{"exact5", []byte("%PDF-"), true},
		{"tooShort", []byte("%PDF"), false},
		{"wrongMagic", []byte("PK\x03\x04zip"), false},
		{"empty", []byte{}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.want, fileheader.IsPDF(c.header))
		})
	}
}
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend/pkg/fileheader && go test ./...`
Expected: FAIL — package `fileheader` does not exist.

- [ ] **Step 3: Implement** `backend/pkg/fileheader/fileheader.go`:

```go
// Package fileheader sniffs file magic numbers. Used to reject blobs whose
// bytes don't match their declared content type before they reach BlobStore.
package fileheader

import "bytes"

// pdfMagic is the 5-byte signature every PDF starts with ("%PDF-").
var pdfMagic = []byte("%PDF-")

// IsPDF reports whether header begins with the PDF magic number. Pass at least
// the first 5 bytes of the file.
func IsPDF(header []byte) bool {
	return len(header) >= len(pdfMagic) && bytes.Equal(header[:len(pdfMagic)], pdfMagic)
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd backend/pkg/fileheader && go test ./...`
Expected: PASS (5 subtests)

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/fileheader
git commit -m "feat(pkg): fileheader.IsPDF magic-byte check"
```

---

### Task 10: enforce PDF magic bytes at finalize

**Files:**
- Modify: `backend/services/upload-service/internal/service/finalize.go`

**Interfaces:**
- Consumes: `fileheader.IsPDF` (Task 9); `domain.ErrInvalidInput` (existing upload-service domain error).

- [ ] **Step 1: Add the guard inside the putBlob callback.** Replace the `Finalize` body's `u.store.Finalize(...)` call so the callback peeks the header when the session declared a PDF. New imports: `bufio` and the `fileheader` package. Updated file:

```go
package service

import (
	"bufio"
	"context"
	"fmt"
	"io"

	"github.com/vbncursed/rosneft/backend/pkg/fileheader"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Finalize closes a session, hashes the bytes, and moves them into BlobStore.
// Refuses to finalize a session whose Offset != Size. When the session declared
// application/pdf, the blob's leading bytes must be the PDF magic number — this
// is the only content-type we hard-validate, so ZIP/image uploads are
// unaffected.
func (u *Upload) Finalize(ctx context.Context, id string) (domain.FinalizedBlob, error) {
	if id == "" {
		return domain.FinalizedBlob{}, domain.ErrSessionNotFound
	}
	s, err := u.store.GetStatus(ctx, id)
	if err != nil {
		return domain.FinalizedBlob{}, err
	}
	if s.Offset != s.Size {
		return domain.FinalizedBlob{}, fmt.Errorf("%w: offset=%d, size=%d", domain.ErrInvalidInput, s.Offset, s.Size)
	}
	hash, size, err := u.store.Finalize(ctx, id, func(ctx context.Context, hash string, r io.Reader) error {
		if s.ContentType == "application/pdf" {
			br := bufio.NewReader(r)
			head, _ := br.Peek(5) // Peek never consumes; short reads return what's available.
			if !fileheader.IsPDF(head) {
				return fmt.Errorf("%w: not a PDF", domain.ErrInvalidInput)
			}
			r = br
		}
		_, err := u.blobs.Put(ctx, hash, s.ContentType, r)
		return err
	})
	if err != nil {
		return domain.FinalizedBlob{}, err
	}
	return domain.FinalizedBlob{Hash: hash, Size: size}, nil
}
```

- [ ] **Step 2: Verify** the upload-service module builds and its tests pass (and that `fileheader` is reachable across the workspace — both are workspace modules):

Run: `cd backend/services/upload-service && go build ./... && go test ./...`
Expected: PASS. If `go build` can't resolve `backend/pkg/fileheader`, run `cd backend && make tidy` (adds it to upload-service's go.mod via the workspace).

- [ ] **Step 3: Commit**

```bash
git add backend/services/upload-service
git commit -m "feat(upload): reject non-PDF blobs when contentType is application/pdf"
```

---

## Phase 5 — frontend: document bounded context

### Task 11: regenerate DTOs + document domain + pdf signature

**Files:**
- Regenerate: `frontend/src/shared/infrastructure/api/dto.ts`
- Create: `frontend/src/document/domain/document.ts`
- Create: `frontend/src/document/domain/pdf-signature.ts`

**Interfaces:**
- Produces: `Document`, `DocumentCreate` TS types; `isPdfSignature(bytes: Uint8Array): boolean`.

- [ ] **Step 1: Regenerate the frontend DTOs** from the updated spec:

Run: `cd frontend && npx openapi-typescript ../backend/services/gateway-service/api/openapi.yaml -o src/shared/infrastructure/api/dto.ts`
Expected: `components["schemas"]["Document"]` and `["DocumentCreate"]` now exist; `SceneBundle` schema gains `documents`.

- [ ] **Step 2: `document/domain/document.ts`**:

```ts
// Document is a PDF attached to a territory. No scene position, no slug —
// identified by id, its bytes served via /api/assets/{sourceBlobHash}.
export interface Document {
  id: number;
  territorySlug: string;
  title: string;
  sourceBlobHash: string;
  createdAt: string;
}

// DocumentCreate is the POST body. The id and createdAt are server-assigned.
export interface DocumentCreate {
  title: string;
  sourceBlobHash: string;
}
```

- [ ] **Step 3: `document/domain/pdf-signature.ts`** (mirrors image-signature.ts):

```ts
// A document source must be a real PDF. The browser derives File.type from the
// extension, which a renamed archive would defeat, so we sniff the leading
// bytes. Every PDF starts with the 5-byte magic "%PDF-" (0x25 50 44 46 2D).
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function isPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PDF_SIGNATURE.length &&
    PDF_SIGNATURE.every((byte, i) => bytes[i] === byte)
  );
}
```

- [ ] **Step 4: Verify type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors (the pre-existing `projects/[slug]` generated-validator error, if present, is unrelated).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/infrastructure/api/dto.ts frontend/src/document/domain
git commit -m "feat(frontend): document DTOs, domain type, PDF signature check"
```

---

### Task 12: document gateway + use-documents hook

**Files:**
- Create: `frontend/src/document/infrastructure/document-gateway.ts`
- Create: `frontend/src/document/application/use-documents.ts`

**Interfaces:**
- Consumes: `Document`, `DocumentCreate` (Task 11); `httpGet/httpPost/httpDelete`.
- Produces: `listDocuments`, `createDocument`, `deleteDocument`; `useDocuments(territorySlug, initial) => { documents, add, remove }`.

- [ ] **Step 1: `document/infrastructure/document-gateway.ts`** (mirrors panorama-gateway.ts):

```ts
import {
  httpDelete,
  httpGet,
  httpPost,
} from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { Document, DocumentCreate } from "@/document/domain/document";

type DocumentDto = components["schemas"]["Document"];

function mapDocument(d: DocumentDto): Document {
  return {
    id: d.id,
    territorySlug: d.territorySlug,
    title: d.title,
    sourceBlobHash: d.sourceBlobHash,
    createdAt: d.createdAt ?? "",
  };
}

const base = (slug: string) =>
  `/api/territories/${encodeURIComponent(slug)}/documents`;

export async function listDocuments(territorySlug: string): Promise<Document[]> {
  const data = await httpGet<DocumentDto[]>(base(territorySlug));
  return data.map(mapDocument);
}

export async function createDocument(
  territorySlug: string,
  body: DocumentCreate,
): Promise<Document> {
  const data = await httpPost<DocumentDto>(base(territorySlug), body);
  return mapDocument(data);
}

export async function deleteDocument(
  territorySlug: string,
  id: number,
): Promise<void> {
  return httpDelete(`${base(territorySlug)}/${id}`);
}
```

- [ ] **Step 2: `document/application/use-documents.ts`** (optimistic add/remove; simpler than usePanoramas — no update):

```ts
import { useCallback, useState } from "react";
import {
  createDocument,
  deleteDocument,
} from "@/document/infrastructure/document-gateway";
import type { Document } from "@/document/domain/document";
import { formatError } from "@/shared/infrastructure/http/format-error";
import { notify } from "@/shared/presentation/toast/use-toast";

// useDocuments wraps the document list with optimistic add/remove. The initial
// array comes from the server-side scene bundle.
export function useDocuments(territorySlug: string, initial: Document[]) {
  const [documents, setDocuments] = useState<Document[]>(initial);

  const add = useCallback(
    async (title: string, sourceBlobHash: string) => {
      try {
        const created = await createDocument(territorySlug, { title, sourceBlobHash });
        setDocuments((prev) => [...prev, created]);
        notify.success("Document added");
        return created;
      } catch (err) {
        notify.error(`Failed to add document: ${formatError(err)}`);
        return null;
      }
    },
    [territorySlug],
  );

  const remove = useCallback(
    async (id: number) => {
      const prev = documents;
      setDocuments((d) => d.filter((x) => x.id !== id));
      try {
        await deleteDocument(territorySlug, id);
        notify.success("Document deleted");
      } catch (err) {
        setDocuments(prev);
        notify.error(`Failed to delete document: ${formatError(err)}`);
      }
    },
    [territorySlug, documents],
  );

  return { documents, add, remove };
}
```

- [ ] **Step 3: Verify type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/document/infrastructure frontend/src/document/application
git commit -m "feat(frontend): document gateway + useDocuments hook"
```

---

### Task 13: thread documents through the scene bundle

**Files:**
- Modify: `frontend/src/territory/domain/scene-bundle.ts`
- Modify: `frontend/src/territory/infrastructure/territory-gateway.ts`

**Interfaces:**
- Produces: `SceneBundle.documents: Document[]`.

- [ ] **Step 1: Add `documents` to the `SceneBundle` interface** in `scene-bundle.ts`:

```ts
import type { Document } from "@/document/domain/document";
```
and add the field after `panoramas`:
```ts
  documents: Document[];
```

- [ ] **Step 2: Map documents in `territory-gateway.ts`.** Open the file and find where `getSceneBundle` maps the DTO's `panoramas` into domain `Panorama[]` (a `mapPanorama`/`.map(...)` call assigned into the returned bundle). Mirror it for documents:
  - import: `import { mapDocument } from ...` — but `mapDocument` is unexported in `document-gateway.ts`; instead import `listDocuments`'s mapper by adding a small inline map. Simplest: map inline from the DTO, matching the panorama approach used in this file. Add a `documents` mapping that produces `Document[]` from `dto.documents ?? []` using the same field shape as `mapDocument` in Task 12 (id, territorySlug, title, sourceBlobHash, createdAt: d.createdAt ?? "").
  - Add `documents` to the returned `SceneBundle` object.

> Implementation note for the executor: read `territory-gateway.ts` first; replicate the exact mapping style it already uses for `panoramas` (whether it calls an imported mapper or maps inline). Keep `documents` empty-array-safe (`?? []`).

- [ ] **Step 3: Verify type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors. A type error here means the bundle's `documents` field isn't populated — fix the mapping until `SceneBundle.documents` is a `Document[]`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/territory
git commit -m "feat(frontend): carry documents in the scene bundle"
```

---

### Task 14: documents UI — section, row, overlay, upload page

**Files:**
- Create: `frontend/src/document/presentation/components/documents-section.tsx`
- Create: `frontend/src/document/presentation/components/document-row.tsx`
- Create: `frontend/src/document/presentation/components/document-overlay.tsx`
- Create: `frontend/src/document/presentation/components/document-upload-form.tsx`
- Create: `frontend/src/app/territories/[slug]/documents/new/page.tsx`

**Interfaces:**
- Consumes: `useDocuments` (Task 12), `Document` (Task 11), `assetUrl`, `useCan`, `useChunkedUpload`, `isPdfSignature`, `createDocument`.
- Produces: `<DocumentsSection territorySlug documents onOpen />`, `<DocumentOverlay document onClose />`.

- [ ] **Step 1: `document-overlay.tsx`** — fullscreen iframe viewer:

```tsx
"use client";

import { useEffect } from "react";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import type { Document } from "@/document/domain/document";

interface DocumentOverlayProps {
  document: Document;
  onClose: () => void;
}

// DocumentOverlay renders a PDF over the scene using the browser's built-in
// viewer via <iframe>. Esc or the ✕ button closes it; Download links straight
// to the blob.
export default function DocumentOverlay({ document, onClose }: DocumentOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const url = assetUrl(document.sourceBlobHash);

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-black/80 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-neutral-100">
        <span className="min-w-0 flex-1 truncate font-medium">{document.title}</span>
        <a
          href={url}
          download
          className="shrink-0 cursor-pointer rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-white/15"
        >
          Download
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close document"
          className="shrink-0 cursor-pointer rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-white/15"
        >
          ✕
        </button>
      </div>
      <iframe
        title={document.title}
        src={url}
        className="min-h-0 flex-1 border-0 bg-neutral-900"
      />
    </div>
  );
}
```

- [ ] **Step 2: `document-row.tsx`**:

```tsx
"use client";

import type { Document } from "@/document/domain/document";
import DeleteButton from "@/shared/presentation/components/delete-button";

interface DocumentRowProps {
  document: Document;
  canDelete: boolean;
  onOpen: (document: Document) => void;
  onDelete: (id: number) => void;
}

// DocumentRow is one entry in the Documents section: title opens the overlay,
// delete is gated by permission.
export default function DocumentRow({ document, canDelete, onOpen, onDelete }: DocumentRowProps) {
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onOpen(document)}
        className="min-w-0 flex-1 cursor-pointer truncate rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-xs text-neutral-100 transition-colors hover:bg-white/10"
      >
        {document.title}
      </button>
      {canDelete ? (
        <DeleteButton
          label={document.title}
          onDelete={() => onDelete(document.id)}
          className="shrink-0"
        >
          ✕
        </DeleteButton>
      ) : null}
    </li>
  );
}
```

> The executor must confirm `@/shared/presentation/components/delete-button`'s exact path/props (the panorama edit panel imports a `DeleteButton`). If the shared component's props differ, match them; otherwise use a plain `<button onClick={() => onDelete(document.id)}>`.

- [ ] **Step 3: `documents-section.tsx`** (mirrors panorama-section's permission + "+ link" pattern):

```tsx
"use client";

import Link from "next/link";
import { useDocuments } from "@/document/application/use-documents";
import type { Document } from "@/document/domain/document";
import DocumentRow from "@/document/presentation/components/document-row";
import { useCan } from "@/auth/presentation/use-can";

interface DocumentsSectionProps {
  territorySlug: string;
  initial: Document[];
  onOpen: (document: Document) => void;
}

// DocumentsSection lists a territory's PDFs in the overlays panel, next to the
// panorama picker. Each row opens the document in an overlay; add/delete are
// permission-gated by document:write / document:delete.
export default function DocumentsSection({ territorySlug, initial, onOpen }: DocumentsSectionProps) {
  const { documents, remove } = useDocuments(territorySlug, initial);
  const can = useCan();
  const canWrite = can("document:write");
  const canDelete = can("document:delete");

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Documents</h3>
        {canWrite ? (
          <Link
            href={`/territories/${encodeURIComponent(territorySlug)}/documents/new`}
            className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-300 transition-colors hover:bg-white/10"
          >
            + Document
          </Link>
        ) : null}
      </div>
      {documents.length === 0 ? (
        <p className="text-xs text-neutral-500">No documents yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((d) => (
            <DocumentRow
              key={d.id}
              document={d}
              canDelete={canDelete}
              onOpen={onOpen}
              onDelete={remove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
```

> The executor must confirm the `useCan` import path (panorama-section uses `const can = useCan();`). Match it exactly.

- [ ] **Step 4: `document-upload-form.tsx`** (mirrors panorama-upload-form, minus EXIF/position; sniffs `%PDF-`; `file.type` becomes `application/pdf` for the server gate):

```tsx
"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChunkedUpload } from "@/upload/application/use-chunked-upload";
import Field from "@/upload/presentation/components/field";
import ProgressBar from "@/upload/presentation/components/progress-bar";
import { notify } from "@/shared/presentation/toast/use-toast";
import { isPdfSignature } from "@/document/domain/pdf-signature";
import { createDocument } from "@/document/infrastructure/document-gateway";

interface DocumentUploadFormProps {
  territorySlug: string;
  territoryTitle: string;
}

// DocumentUploadForm uploads a PDF via the chunked-upload pipeline, then
// attaches it to the territory. The server independently re-checks the %PDF
// magic bytes at finalize (contentType is application/pdf for .pdf files).
export default function DocumentUploadForm({ territorySlug, territoryTitle }: DocumentUploadFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { status, progress, upload, cancel } = useChunkedUpload();
  const territoryHref = `/territories/${encodeURIComponent(territorySlug)}`;

  const onCancel = useCallback(() => {
    if (submitting) {
      cancel();
      return;
    }
    router.push(territoryHref);
  }, [cancel, router, submitting, territoryHref]);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const selected = input.files?.[0] ?? null;
      if (!selected) {
        setFile(null);
        return;
      }
      const head = new Uint8Array(await selected.slice(0, 5).arrayBuffer());
      if (!isPdfSignature(head)) {
        notify.error("Please choose a PDF file.");
        input.value = "";
        setFile(null);
        return;
      }
      setFile(selected);
    },
    [],
  );

  const valid = title.trim() !== "" && file !== null;

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!file || submitting) return;
      setSubmitting(true);
      try {
        const blob = await upload(file);
        if (!blob) return;
        await createDocument(territorySlug, {
          title: title.trim(),
          sourceBlobHash: blob.hash,
        });
        notify.success("Document uploaded");
        router.push(territoryHref);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setSubmitting(false);
      }
    },
    [file, router, submitting, territoryHref, territorySlug, title, upload],
  );

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur"
    >
      <Link
        href={territoryHref}
        className="-mb-2 inline-flex w-fit items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-neutral-400 transition-colors hover:text-cyan-200"
      >
        <span aria-hidden="true">←</span>
        <span>Back to {territoryTitle}</span>
      </Link>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Document</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Attach a PDF to {territoryTitle}
        </h1>
        <p className="text-sm text-neutral-400">
          The document opens in an overlay over the scene and can be downloaded.
        </p>
      </div>

      <Field
        label="Title"
        value={title}
        onChange={setTitle}
        required
      />

      <div>
        <label className="block text-xs uppercase tracking-[0.2em] text-neutral-400">PDF *</label>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={onFileChange}
          required
          className="mt-2 block w-full text-sm text-neutral-300 file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-neutral-900 hover:file:bg-cyan-200"
        />
      </div>

      <ProgressBar status={status} progress={progress} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!valid || submitting}
          className="cursor-pointer rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Uploading…" : "Upload document"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-full border border-white/20 bg-transparent px-5 py-3 text-sm text-neutral-200 transition-colors hover:bg-white/[0.06]"
        >
          {submitting ? "Cancel upload" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Upload page** `app/territories/[slug]/documents/new/page.tsx` (RSC; mirror `app/territories/[slug]/panoramas/new/page.tsx`). Read that file and copy its territory-fetch + `notFoundOnHttp404` pattern, rendering `DocumentUploadForm` instead. Skeleton:

```tsx
import { notFound } from "next/navigation";
import { getTerritory } from "@/territory/infrastructure/territory-gateway";
import { notFoundOnHttp404 } from "@/shared/infrastructure/http/not-found-on-404";
import DocumentUploadForm from "@/document/presentation/components/document-upload-form";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const territory = await getTerritory(slug).catch(notFoundOnHttp404(null));
  if (!territory) notFound();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] px-6 py-16 text-white">
      <DocumentUploadForm territorySlug={territory.slug} territoryTitle={territory.title} />
    </main>
  );
}
```

> The executor must match the exact territory fetch helper used by `panoramas/new/page.tsx` (it may be `getTerritory`, `getSceneBundle`, or similar) and its `params` signature for Next 16.

- [ ] **Step 6: Verify lint + type-check**

Run: `cd frontend && yarn lint && npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/document/presentation frontend/src/app/territories/[slug]/documents
git commit -m "feat(frontend): documents section, row, overlay, upload page"
```

---

### Task 15: mount documents in the viewer

**Files:**
- Modify: `frontend/src/viewer/presentation/components/model-viewer.tsx` (or wherever `PanoramaSection` is rendered and the scene bundle's `panoramas` is consumed)

**Interfaces:**
- Consumes: `SceneBundle.documents` (Task 13), `<DocumentsSection>`, `<DocumentOverlay>` (Task 14).

- [ ] **Step 1: Locate the integration point.** Find where `ModelViewer` (or the overlays panel it renders) receives `panoramas` from the scene bundle and renders `PanoramaSection`. The bundle is threaded from the `/territories/[slug]` RSC into `ModelViewer`. Confirm `documents` is passed down the same prop chain (RSC → `ViewerEntry`/`ModelViewer`). Add a `documents: Document[]` prop alongside `panoramas` wherever `panoramas` is declared as a prop.

- [ ] **Step 2: Lift overlay state and render the section + overlay.** In the component that renders `PanoramaSection`, add:

```tsx
import { useState } from "react";
import DocumentsSection from "@/document/presentation/components/documents-section";
import DocumentOverlay from "@/document/presentation/components/document-overlay";
import type { Document } from "@/document/domain/document";

// ...inside the component:
const [openDocument, setOpenDocument] = useState<Document | null>(null);
```

Render `<DocumentsSection territorySlug={territory.slug} initial={documents} onOpen={setOpenDocument} />` next to `<PanoramaSection .../>` in the overlays panel, and render the overlay at the component root:

```tsx
{openDocument ? (
  <DocumentOverlay document={openDocument} onClose={() => setOpenDocument(null)} />
) : null}
```

- [ ] **Step 3: Thread `documents` from the RSC.** In `app/territories/[slug]/page.tsx`, the scene bundle already carries `documents` after Task 13. Pass `bundle.documents` into the viewer the same way `bundle.panoramas` is passed. (Follow the exact prop name the viewer expects.)

- [ ] **Step 4: Verify lint + build**

Run: `cd frontend && yarn lint && yarn build`
Expected: PASS. (`yarn build` exercises the full type graph including the page → viewer prop chain.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/viewer frontend/src/app/territories
git commit -m "feat(frontend): render Documents section + PDF overlay in the viewer"
```

---

## Phase 6 — full build, test, deploy

### Task 16: end-to-end verification and deploy

- [ ] **Step 1: Backend — build, lint, test (race) across all modules**

Run: `cd backend && make build && make lint && make test`
Expected: PASS (includes the new `documents_test.go` and `fileheader_test.go`).

- [ ] **Step 2: Frontend — lint + production build**

Run: `cd frontend && yarn lint && yarn build`
Expected: PASS.

- [ ] **Step 3: Commit any regen/tidy drift** (e.g. `go.mod`/`go.sum` from `make tidy`, formatting from `make fmt`):

```bash
cd backend && make fmt && make tidy
git add -A && git commit -m "chore: tidy + fmt after document feature" || echo "nothing to commit"
```

- [ ] **Step 4: Push to main**

```bash
git push origin main
```

- [ ] **Step 5: Deploy** (prod is `/opt/rosneft`, compose project `andrey`; catalog `00010` + auth `00006` migrations auto-apply on boot):

```bash
ssh root@85.192.26.113 'cd /opt/rosneft && git pull --ff-only && docker compose -p andrey up -d --build catalog gateway auth upload frontend'
```

- [ ] **Step 6: Verify in prod**
  - `docker compose -p andrey ps` — all services Up; catalog/auth started cleanly (migrations applied).
  - As an `editor`/`admin` user: open a territory, see the **Documents** section, upload a PDF, confirm it lists, opens in the overlay, downloads, and deletes.
  - Negative: rename a `.zip` to `.pdf` and try to upload — client rejects on `%PDF-` sniff; if bypassed, finalize returns 400 and no blob is stored.
  - As a `viewer` user: documents are visible and openable, but "+ Document" and delete are hidden, and a direct `POST`/`DELETE` returns 403.
  - Confirm the Scalar UI at `/openapi.json` (or the docs page) lists the three `documents` endpoints.

---

## Self-Review

**Spec coverage:**
- Multiple PDFs per territory → `territory_documents` table + list/create/delete (Tasks 2–4, 6–7). ✓
- Upload reuses chunked pipeline → `document-upload-form` uses `useChunkedUpload` (Task 14). ✓
- In-app overlay viewer next to panoramas → `DocumentsSection` + `DocumentOverlay` (Tasks 14–15). ✓
- New `document:read/write/delete` perms, admin+editor write/delete, owner+viewer read → Task 8; route gating Task 7. ✓
- Full validation: client `%PDF-` sniff (Task 14) + server magic-byte gate at finalize, scoped to `application/pdf` (Tasks 9–10). ✓
- Swagger/OpenAPI updated → Task 7 (`make openapi-gen` regenerates embedded Scalar spec). ✓
- Not converted, served via `/api/assets/{hash}` → overlay/download use `assetUrl` (Task 14). ✓
- Deliberate simplifications (no slug/update, delete keeps blob) → reflected throughout. ✓
- Don't break existing uploads → server check gated on `contentType == "application/pdf"` (Task 10). ✓

**Type consistency:** `Document` fields `{id, territorySlug, title, sourceBlobHash, createdAt}` are identical across proto (Task 1), catalog domain (Task 2), gateway domain (Task 5), OpenAPI/DTO (Tasks 7, 11), and frontend domain (Task 11). Method names `ListDocuments`/`CreateDocument`/`DeleteDocument` are consistent across all five interfaces (catalog Repository, catalog gRPC Service, gateway Catalog, gateway httpapi Service, clients). ✓

**Executor must read-before-mirror** (noted inline): `territory-gateway.ts` panorama mapping (Task 13), `delete-button` props + `useCan` path (Task 14), `panoramas/new/page.tsx` fetch helper (Task 14), and the viewer prop chain for `panoramas` (Task 15). These follow existing patterns rather than inventing new ones.
