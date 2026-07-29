# Скоуп ассетов, CSRF-токен и сужение CORS — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть доступ к байтам чужого тенанта по известному хешу, поставить
вторую линию обороны против CSRF и убрать `*` из разрешённых origin.

**Architecture:** Владение блобом резолвится запросом к каталогу, а не новой
таблицей — каждый хеш уже лежит в строке, из которой есть путь до территории
или до модели (модели общие по решению заказчика). CSRF-токен выводится как
`HMAC(secret, sessionToken)`, поэтому не хранится нигде и умирает вместе с
сессией; проверяется только для куки-сессий, из-за чего не-браузерные клиенты
не меняются.

**Tech Stack:** Go 1.26.5, chi v5, pgx/v5, buf + protoc-gen-go, testify/suite +
gotest.tools/v3/assert + minimock, testcontainers-go (только интеграционные
тесты каталога); фронт — Vite 8, React 19, vitest.

**Спека:** [`docs/superpowers/specs/2026-07-29-asset-scoping-csrf-design.md`](../specs/2026-07-29-asset-scoping-csrf-design.md)

## Отличие от спеки

Спека предлагала проверить резолвер владения юнит-тестом на сервисном слое с
minimock. Этого недостаточно: **вся логика — в SQL**, шесть веток `UNION ALL` со
скоуп-фильтром в каждой, и minimock проверил бы только проброс аргументов. Забыть
фильтр в одной ветке — тихая утечка ровно того типа, ради которого всё делается.

Поэтому Задача 1 добавляет интеграционный тест каталога на testcontainers по
образцу `audit-service/internal/migrate/*_integration_test.go`, где та же
ситуация («логика в SQL, ничто другое её не проверит») уже решена так же. Цена —
зависимость `testcontainers-go` в `catalog-service`; тесты за тегом
`integration`, поэтому `make test` остаётся без Docker.

## Global Constraints

- Go **1.26.5** во всех модулях; **200 строк на файл**; один метод — один файл в `storage/`, `service/`, `transport/`.
- Тесты: `testify/suite` + `gotest.tools/v3/assert` + `minimock`. Ассерты — `assert.X(s.T(), …)`, не `s.Equal()`. Контроллер строится в `SetupTest` через `minimock.NewController(s.T())`.
- **Перед каждым коммитом Go:** `make -C backend check` (~80 с). Хук `.githooks/pre-commit` запускает его сам.
- Фронт перед коммитом: `yarn lint && yarn test && yarn test:spa` из `frontend/`.
- **`proto/` меняется** (в отличие от прошлой спеки). После правки — `make -C backend proto-gen`.
- **`openapi.yaml` меняется**: `/api/auth/me` и ответы входа получают поле `csrfToken`. После правки — `make -C backend openapi-gen`, затем `yarn openapi:generate` из `frontend/`.
- Комментарии — на языке файла: в Go-сервисах английский.
- Ветка — `dev`, коммиты атомарные, по задаче.
- **Порядок 1 → 2 → 3 обязателен.** Задача 3 монтирует гейт; без задач 1–2 ей нечего вызывать. Задачи 4–7 независимы от 1–3 и друг от друга, кроме 5 → 6.
- **Ловушка окружения:** `docker compose up -d --build <svc>` умеет молча оставить старый образ и написать «Started». Сверяйте `docker image inspect andrey-<svc> --format '{{.Created}}'`; при расхождении — `docker compose build --no-cache <svc>`. На этом уже потерян один неверный вывод.
- **Стенд для живых проверок** уже есть в локальной базе: `cotest` и `cotest2` (оба Company Owner, пароль `Passw0rd!2026`), территории `tenant-a-scene` и `tenant-b-scene`, назначенные им соответственно; Root — `admin` / `change-me-now`; территория `dji-wp-46-cut` принадлежит Root и имеет настоящие артефакты. Назначение админов делается полем `userIds`, **не** `adminIds` — на неизвестное поле endpoint отвечает 204, никого не назначив.

---

### Task 1: Резолвер владения блобом в каталоге

**Files:**
- Create: `backend/services/catalog-service/internal/migrate/migrations/00014_blob_hash_indexes.sql`
- Create: `backend/services/catalog-service/internal/storage/resolve_blob_access.go`
- Create: `backend/services/catalog-service/internal/storage/resolve_blob_access_integration_test.go`
- Modify: `backend/services/catalog-service/go.mod` (+ `testcontainers-go`)

**Interfaces:**
- Consumes: ничего.
- Produces: `(*PG).ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error)` — Задача 2 поднимает её через сервисный слой в gRPC.

- [x] **Step 1: Написать миграцию с недостающими индексами**

Create `backend/services/catalog-service/internal/migrate/migrations/00014_blob_hash_indexes.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
-- ResolveBlobAccess looks a content hash up across six tables. Three already
-- had an index on the hash column (territory_artifacts, model_artifacts,
-- panoramas); without these four the remaining branches are sequential scans on
-- every single asset request, and a scene issues one per placement.
CREATE INDEX idx_territories_source_blob      ON territories(source_blob_hash);
CREATE INDEX idx_models_source_blob           ON models(source_blob_hash);
CREATE INDEX idx_models_thumbnail_blob        ON models(thumbnail_blob_hash);
CREATE INDEX idx_territory_documents_blob     ON territory_documents(source_blob_hash);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_territories_source_blob;
DROP INDEX IF EXISTS idx_models_source_blob;
DROP INDEX IF EXISTS idx_models_thumbnail_blob;
DROP INDEX IF EXISTS idx_territory_documents_blob;
-- +goose StatementEnd
```

- [x] **Step 2: Добавить testcontainers в модуль каталога**

Run:
```bash
cd backend/services/catalog-service
GOWORK=off go get github.com/testcontainers/testcontainers-go@latest
GOWORK=off go get github.com/testcontainers/testcontainers-go/modules/postgres@latest
GOWORK=off go mod tidy
```

Затем сбросить псевдоверсии сиблингов обратно на плейсхолдер, иначе Docker-сборка
подхватит опубликованный коммит вместо локального:

```bash
cd /Users/vbncursed/programming/rosneft/backend
sed -i '' -E 's|(backend/(pkg\|proto)) v0\.0\.0-[0-9a-z-]+|\1 v0.0.0|' services/catalog-service/go.mod
```

- [x] **Step 3: Написать падающий интеграционный тест**

Create `backend/services/catalog-service/internal/storage/resolve_blob_access_integration_test.go`:

```go
//go:build integration

package storage_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// BlobAccessSuite exercises ResolveBlobAccess against a real Postgres.
//
// The whole decision is one SQL statement with six UNION ALL branches, four of
// which carry a scope filter. A mock of the storage layer would assert nothing
// about it, and dropping the filter from a single branch leaks exactly one
// class of asset — silently. This suite is the only thing that would notice.
type BlobAccessSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG

	adminA, adminB string // two tenants
	terrA, terrB   int64
}

func TestBlobAccessSuite(t *testing.T) { suite.Run(t, new(BlobAccessSuite)) }

func (s *BlobAccessSuite) SetupSuite() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:17-alpine",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, dsn))

	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.pg = storage.New(s.pool)

	s.adminA = "11111111-1111-1111-1111-111111111111"
	s.adminB = "22222222-2222-2222-2222-222222222222"
	s.terrA = s.seedTerritory(ctx, "a", "hash-terr-a-src", s.adminA)
	s.terrB = s.seedTerritory(ctx, "b", "hash-terr-b-src", s.adminB)
	s.seedModel(ctx, "shared-pump", "hash-model-src", "hash-model-thumb", "hash-model-glb")
}

func (s *BlobAccessSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// seedTerritory creates a territory assigned to one admin, plus one artifact,
// one panorama and one document, so every scoped branch of the query has a row.
func (s *BlobAccessSuite) seedTerritory(ctx context.Context, name, srcHash, admin string) int64 {
	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1,$1,$2) RETURNING id`,
		name, srcHash).Scan(&id)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO territory_assignments (territory_id, admin_user_id) VALUES ($1, $2::uuid)`,
		id, admin)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO territory_artifacts
		 (territory_id, lod, hash, content_type, size_bytes, vertices, faces,
		  bbox_min_x,bbox_min_y,bbox_min_z,bbox_max_x,bbox_max_y,bbox_max_z)
		 VALUES ($1,0,$2,'model/gltf-binary',1,1,1,0,0,0,1,1,1)`,
		id, "hash-artifact-"+name)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO panoramas (territory_id, slug, title, source_blob_hash)
		 VALUES ($1,'p','p',$2)`, id, "hash-pano-"+name)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		 VALUES ($1,'d',$2)`, id, "hash-doc-"+name)
	assert.NilError(s.T(), err)
	return id
}

func (s *BlobAccessSuite) seedModel(ctx context.Context, slug, src, thumb, glb string) {
	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO models (slug, title, source_blob_hash, thumbnail_blob_hash)
		 VALUES ($1,$1,$2,$3) RETURNING id`, slug, src, thumb).Scan(&id)
	assert.NilError(s.T(), err)
	_, err = s.pool.Exec(ctx,
		`INSERT INTO model_artifacts
		 (model_id, lod, hash, content_type, size_bytes, vertices, faces,
		  bbox_min_x,bbox_min_y,bbox_min_z,bbox_max_x,bbox_max_y,bbox_max_z)
		 VALUES ($1,0,$2,'model/gltf-binary',1,1,1,0,0,0,1,1,1)`, id, glb)
	assert.NilError(s.T(), err)
}

func (s *BlobAccessSuite) allowed(hash, scope string) bool {
	ok, err := s.pg.ResolveBlobAccess(s.T().Context(), hash, scope)
	assert.NilError(s.T(), err)
	return ok
}

// Every scoped branch, one case each. A filter dropped from any single branch
// shows up here and nowhere else.
func (s *BlobAccessSuite) TestEachTerritoryBranchIsScoped() {
	for _, h := range []string{
		"hash-terr-a-src",  // territories.source_blob_hash
		"hash-artifact-a",  // territory_artifacts.hash
		"hash-pano-a",      // panoramas.source_blob_hash
		"hash-doc-a",       // territory_documents.source_blob_hash
	} {
		assert.Assert(s.T(), s.allowed(h, s.adminA), "owner must reach %s", h)
		assert.Assert(s.T(), !s.allowed(h, s.adminB), "another tenant must NOT reach %s", h)
	}
}

// Models are a shared library by decision, so their bytes are readable by any
// scope. If this ever starts failing, the product decision changed, not the SQL.
func (s *BlobAccessSuite) TestModelBlobsAreReadableByEveryTenant() {
	for _, h := range []string{"hash-model-src", "hash-model-thumb", "hash-model-glb"} {
		assert.Assert(s.T(), s.allowed(h, s.adminA), "%s", h)
		assert.Assert(s.T(), s.allowed(h, s.adminB), "%s", h)
	}
}

// An empty scope is Root: the catalog's convention throughout is that an empty
// scope disables the filter. The gateway must never pass "" for a non-Root
// caller, and its own middleware enforces that — see Task 3.
func (s *BlobAccessSuite) TestEmptyScopeSeesEverything() {
	assert.Assert(s.T(), s.allowed("hash-terr-a-src", ""))
	assert.Assert(s.T(), s.allowed("hash-doc-b", ""))
}

func (s *BlobAccessSuite) TestUnknownHashIsRefused() {
	assert.Assert(s.T(), !s.allowed("hash-that-belongs-to-nothing", s.adminA))
	assert.Assert(s.T(), !s.allowed("hash-that-belongs-to-nothing", ""))
}

// Dedup must resolve in the user's favour: the same bytes reachable through a
// territory they can see stay reachable even if another tenant also holds them.
func (s *BlobAccessSuite) TestASharedHashIsAllowedIfAnyReachableRowHasIt() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		 VALUES ($1,'shared','hash-shared-doc')`, s.terrA)
	assert.NilError(s.T(), err)
	_, err = s.pool.Exec(ctx,
		`INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		 VALUES ($1,'shared','hash-shared-doc')`, s.terrB)
	assert.NilError(s.T(), err)

	assert.Assert(s.T(), s.allowed("hash-shared-doc", s.adminA))
	assert.Assert(s.T(), s.allowed("hash-shared-doc", s.adminB))
}
```

- [x] **Step 4: Запустить тест, убедиться что падает**

Run: `cd backend/services/catalog-service && go test -tags=integration ./internal/storage/ -run TestBlobAccessSuite`
Expected: FAIL — `s.pg.ResolveBlobAccess undefined`.

- [x] **Step 5: Реализовать резолвер**

Create `backend/services/catalog-service/internal/storage/resolve_blob_access.go`:

```go
package storage

import (
	"context"
	"fmt"
)

// ResolveBlobAccess reports whether a caller scoped to scopeAdminID may read the
// bytes behind a content-addressed hash.
//
// A blob has no single owner — the hash addresses content and is deduplicated
// across territories and models — so the question cannot be answered by the
// territory gate. It is answered here instead: the hash is reachable when it
// belongs to a model (a shared library, deliberately readable by everyone) or to
// a territory assigned to the caller.
//
// An empty scopeAdminID disables the filter, matching GetTerritory and every
// other scoped query here. That means "Root", NOT "nobody" — a caller without a
// scope must be refused before reaching this function.
//
// Panoramas and territory_documents are owned by content-service. Reading them
// here mirrors ListPanoramaIDs: same shared database, read-only, and the
// alternative is a second RPC on the hot path of every asset request.
func (r *PG) ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error) {
	// EXISTS over UNION ALL stops at the first matching row, so the six branches
	// are not six scans. Models come first because in a typical scene most asset
	// requests are placement GLBs.
	const q = `
SELECT EXISTS (
    SELECT 1 FROM model_artifacts WHERE hash = $1
    UNION ALL
    SELECT 1 FROM models WHERE source_blob_hash = $1 OR thumbnail_blob_hash = $1
    UNION ALL
    SELECT 1 FROM territory_artifacts ta
      WHERE ta.hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = ta.territory_id AND a.admin_user_id = $2::uuid))
    UNION ALL
    SELECT 1 FROM territories t
      WHERE t.source_blob_hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = t.id AND a.admin_user_id = $2::uuid))
    UNION ALL
    SELECT 1 FROM panoramas p
      WHERE p.source_blob_hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = p.territory_id AND a.admin_user_id = $2::uuid))
    UNION ALL
    SELECT 1 FROM territory_documents d
      WHERE d.source_blob_hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = d.territory_id AND a.admin_user_id = $2::uuid))
)`

	var allowed bool
	if err := r.pool.QueryRow(ctx, q, hash, scopeAdminID).Scan(&allowed); err != nil {
		return false, fmt.Errorf("storage.ResolveBlobAccess: %w", err)
	}
	return allowed, nil
}
```

- [x] **Step 6: Запустить тест, убедиться что проходит**

Run: `cd backend/services/catalog-service && go test -tags=integration ./internal/storage/ -run TestBlobAccessSuite -v`
Expected: PASS, 5 тестов. Нужен запущенный Docker.

- [x] **Step 7: Проверить, что тест ловит снятый фильтр**

Временно убрать `AND ($2 = '' OR EXISTS (...))` из ветки `territory_documents`, прогнать тест снова.
Expected: FAIL на `TestEachTerritoryBranchIsScoped` со словами `another tenant must NOT reach hash-doc-a`. Вернуть фильтр.

Без этого шага неизвестно, проверяет ли тест то, ради чего написан — в прошлом заходе тест свидетельства проходил по совпадению чисел.

- [x] **Step 8: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/catalog-service/
git commit -m "feat(catalog): resolve whether a caller may read a blob by hash"
```

---

### Task 2: RPC ResolveBlobAccess до шлюза

**Files:**
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto`
- Create: `backend/services/catalog-service/internal/transport/grpcapi/resolve_blob_access.go`
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/server.go` (интерфейс `Service`)
- Create: `backend/services/gateway-service/internal/clients/catalog/resolve_blob_access.go`
- Modify: `backend/services/gateway-service/internal/service/gateway.go` (интерфейс `Catalog`), `backend/services/gateway-service/internal/transport/httpapi/server.go` (интерфейс `Service`)
- Create: `backend/services/gateway-service/internal/service/resolve_blob_access.go`

**Interfaces:**
- Consumes: `(*PG).ResolveBlobAccess(ctx, hash, scopeAdminID) (bool, error)` из Задачи 1.
- Produces: `Service.ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error)` на интерфейсе `httpapi.Service` — Задача 3 зовёт её из middleware.

- [x] **Step 1: Добавить RPC в контракт**

Modify `backend/proto/rosneft/catalog/v1/catalog.proto` — в `service CatalogService`, рядом с прочими `Resolve*`:

```proto
  // ResolveBlobAccess answers whether a caller scoped to scope_admin_id may read
  // the bytes behind a content-addressed hash. A blob is reachable when it
  // belongs to a model (models are a shared library) or to a territory assigned
  // to that caller. An empty scope_admin_id means Root and disables the filter.
  rpc ResolveBlobAccess(ResolveBlobAccessRequest) returns (ResolveBlobAccessResponse);
```

и сообщения рядом с остальными:

```proto
message ResolveBlobAccessRequest {
  string hash = 1;
  string scope_admin_id = 2;
}

message ResolveBlobAccessResponse {
  bool allowed = 1;
}
```

- [x] **Step 2: Сгенерировать код**

Run: `make -C backend proto-gen`
Expected: изменения в `backend/proto/gen/go/rosneft/catalog/v1/`.

- [x] **Step 3: Расширить интерфейс сервиса каталога**

Modify `backend/services/catalog-service/internal/transport/grpcapi/server.go` — в интерфейс `Service`, рядом с `ResolveLabels`:

```go
	ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error)
```

- [x] **Step 4: Добавить обработчик gRPC**

Create `backend/services/catalog-service/internal/transport/grpcapi/resolve_blob_access.go`:

```go
package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

// ResolveBlobAccess answers the gateway's asset gate. It returns a plain bool
// rather than an error for "refused": the caller turns that into a 404, and a
// gRPC error would be indistinguishable from a real failure, which must fail
// closed rather than quietly open.
func (s *Server) ResolveBlobAccess(
	ctx context.Context, req *catalogv1.ResolveBlobAccessRequest,
) (*catalogv1.ResolveBlobAccessResponse, error) {
	allowed, err := s.svc.ResolveBlobAccess(ctx, req.GetHash(), req.GetScopeAdminId())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.ResolveBlobAccessResponse{Allowed: allowed}, nil
}
```

Сервисный слой каталога пробрасывает вызов в storage. Create
`backend/services/catalog-service/internal/service/resolve_blob_access.go`:

```go
package service

import "context"

// ResolveBlobAccess forwards to storage. The decision is one SQL statement, and
// re-deriving any part of it here would give two places to keep in step.
func (s *Catalog) ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error) {
	return s.storage.ResolveBlobAccess(ctx, hash, scopeAdminID)
}
```

Имя приёмника и поля хранилища взять из соседнего файла сервисного слоя —
в этом пакете они единообразны; добавить метод в интерфейс `Storage` там же.

- [x] **Step 5: Добавить метод клиента в шлюзе**

Create `backend/services/gateway-service/internal/clients/catalog/resolve_blob_access.go`:

```go
package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
)

// ResolveBlobAccess reports whether the caller may read the bytes behind a hash.
// A transport error is returned as an error, never as a false: the gate must
// fail closed on its own terms and say so, not silently look like a refusal.
func (c *Client) ResolveBlobAccess(
	ctx context.Context, hash, scopeAdminID string,
) (bool, error) {
	resp, err := c.cc.ResolveBlobAccess(ctx, &catalogv1.ResolveBlobAccessRequest{
		Hash:         hash,
		ScopeAdminId: scopeAdminID,
	})
	if err != nil {
		return false, fmt.Errorf("catalog.ResolveBlobAccess: %w", grpcerr.MapStatus(err, nil))
	}
	return resp.GetAllowed(), nil
}
```

- [x] **Step 6: Пробросить через сервисный слой шлюза**

Добавить `ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error)`
в интерфейс `Catalog` (`internal/service/gateway.go`) и в интерфейс `Service`
(`internal/transport/httpapi/server.go`).

Create `backend/services/gateway-service/internal/service/resolve_blob_access.go`:

```go
package service

import "context"

// ResolveBlobAccess forwards the asset gate's question to the catalog. No
// business logic here on purpose: the decision is one SQL statement, and
// duplicating any part of it in Go would give two places to keep in step.
func (g *Gateway) ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error) {
	return g.catalog.ResolveBlobAccess(ctx, hash, scopeAdminID)
}
```

- [x] **Step 7: Перегенерировать моки и собрать**

Run:
```bash
cd backend/services/gateway-service && go generate ./... && go build ./... && go test ./...
cd ../catalog-service && go build ./... && go test ./...
```
Expected: PASS. Моки `CatalogMock` получают `ResolveBlobAccessMock`.

- [x] **Step 8: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/proto/ backend/services/catalog-service/ backend/services/gateway-service/
git commit -m "feat(catalog): expose ResolveBlobAccess over gRPC"
```

---

### Task 3: Гейт ассетов в шлюзе

**Files:**
- Create: `backend/services/gateway-service/internal/transport/httpapi/blob_gate.go`
- Create: `backend/services/gateway-service/internal/transport/httpapi/blob_gate_test.go`
- Modify: `backend/services/gateway-service/internal/bootstrap/transport.go`

**Interfaces:**
- Consumes: `Service.ResolveBlobAccess(ctx, hash, scopeAdminID) (bool, error)` из Задачи 2; `authhttp.Scope(ctx) (adminID string, allAccess bool)` и `authhttp.NewTestContext` — существуют.
- Produces: `(*Server).RequireBlobAccess(next http.Handler) http.Handler`.

- [x] **Step 1: Написать падающий тест**

Create `backend/services/gateway-service/internal/transport/httpapi/blob_gate_test.go`:

```go
package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// BlobGateSuite covers the middleware that stops a hash from opening another
// tenant's bytes. It mirrors TerritoryGateSuite's shape on purpose — the two
// gates answer the same way and must not drift apart.
type BlobGateSuite struct {
	suite.Suite
}

func TestBlobGateSuite(t *testing.T) { suite.Run(t, new(BlobGateSuite)) }

type blobCase struct {
	adminID   string
	allAccess bool
}

// router mounts the gate the way InitRouter does: on the asset routes only,
// after Authenticate. chi must have matched the route before the middleware
// runs, or chi.URLParam("hash") comes back empty.
func (s *BlobGateSuite) router(svc Service, c blobCase) http.Handler {
	srv := New(svc)
	r := chi.NewRouter()
	inject := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := req.Context()
			if c.allAccess {
				ctx = authhttp.NewTestContext(ctx, true, "")
			} else {
				ctx = authhttp.NewTestContext(ctx, false, c.adminID)
			}
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	}
	ok := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }
	r.With(inject, srv.RequireBlobAccess).Get("/api/assets/{hash}", ok)
	r.With(inject, srv.RequireBlobAccess).Head("/api/assets/{hash}", ok)
	return r
}

func (s *BlobGateSuite) do(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func (s *BlobGateSuite) TestReachableBlobIsServed() {
	svc := blobServiceStub{resolve: func(_ context.Context, hash, scope string) (bool, error) {
		assert.Equal(s.T(), hash, "abc123")
		assert.Equal(s.T(), scope, "admin-1", "the gate must pass the principal's scope")
		return true, nil
	}}

	assert.Equal(s.T(), s.do(s.router(svc, blobCase{adminID: "admin-1"}),
		http.MethodGet, "/api/assets/abc123").Code, http.StatusOK)
}

// The point of the whole middleware.
func (s *BlobGateSuite) TestUnreachableBlobIsRefusedAsMissing() {
	svc := blobServiceStub{resolve: func(context.Context, string, string) (bool, error) {
		return false, nil
	}}
	h := s.router(svc, blobCase{adminID: "admin-1"})

	for _, m := range []string{http.MethodGet, http.MethodHead} {
		rec := s.do(h, m, "/api/assets/theirs")
		assert.Equal(s.T(), rec.Code, http.StatusNotFound, "%s", m)
		if m == http.MethodGet {
			// 403 would confirm the blob exists. The body must match a hash that
			// belongs to nothing at all.
			assert.Assert(s.T(), strings.Contains(rec.Body.String(), "not_found"), rec.Body.String())
		}
	}
}

func (s *BlobGateSuite) TestRootSkipsTheLookupEntirely() {
	svc := blobServiceStub{resolve: func(context.Context, string, string) (bool, error) {
		s.T().Fatal("Root must not cost a catalog round trip")
		return false, nil
	}}

	assert.Equal(s.T(), s.do(s.router(svc, blobCase{allAccess: true}),
		http.MethodGet, "/api/assets/any").Code, http.StatusOK)
}

// Fail closed: an empty scope on a non-Root principal would disable the
// catalog's filter and open every blob in the system.
func (s *BlobGateSuite) TestPrincipalWithoutACompanyIsRefused() {
	svc := blobServiceStub{resolve: func(context.Context, string, string) (bool, error) {
		s.T().Fatal("an unscoped principal must be refused before the lookup")
		return false, nil
	}}

	assert.Equal(s.T(), s.do(s.router(svc, blobCase{}),
		http.MethodGet, "/api/assets/x").Code, http.StatusNotFound)
}

// A catalog that is down must not read as "allowed". It must also not read as a
// plain 404, which would send the client off to re-fetch a scene that is fine.
func (s *BlobGateSuite) TestCatalogFailureFailsClosedWithoutClaimingTheBlobIsMissing() {
	svc := blobServiceStub{resolve: func(context.Context, string, string) (bool, error) {
		return false, errors.New("catalog unreachable")
	}}

	assert.Equal(s.T(), s.do(s.router(svc, blobCase{adminID: "admin-1"}),
		http.MethodGet, "/api/assets/abc").Code, http.StatusServiceUnavailable)
}

// blobServiceStub implements only what the gate calls. Embedding Service leaves
// every other method nil, so a call to one panics — the desired signal.
type blobServiceStub struct {
	Service
	resolve func(ctx context.Context, hash, scope string) (bool, error)
}

func (b blobServiceStub) ResolveBlobAccess(ctx context.Context, hash, scope string) (bool, error) {
	return b.resolve(ctx, hash, scope)
}
```

- [x] **Step 2: Запустить тест, убедиться что падает**

Run: `cd backend/services/gateway-service && go test ./internal/transport/httpapi/ -run TestBlobGateSuite`
Expected: FAIL — `srv.RequireBlobAccess undefined`.

- [x] **Step 3: Реализовать middleware**

Create `backend/services/gateway-service/internal/transport/httpapi/blob_gate.go`:

```go
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// RequireBlobAccess refuses a caller the bytes behind a hash they cannot reach.
//
// A blob hash addresses content and is deduplicated across territories and
// models, so RequireTerritoryAccess cannot cover it: there is no single
// territory to check against. The catalog answers the question instead, by
// looking for any row holding this hash that the caller can see.
//
// Answers 404 for a refusal, never 403 — a 403 confirms the blob exists — and
// 503 when the catalog itself failed, which is neither "yours" nor "missing"
// and must not be reported as either.
//
// MUST be mounted after Authenticate.
//
// ponytail: one indexed lookup per asset request. Against a 15 MB GLB download
// it is noise; cache per session if it ever shows up in a profile.
func (s *Server) RequireBlobAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		scopeAdminID, allAccess := authhttp.Scope(ctx)
		if allAccess {
			next.ServeHTTP(w, r)
			return
		}
		// An empty scope on a non-Root principal is an upstream bug. Passing ""
		// to the catalog disables the filter and would open every blob.
		if scopeAdminID == "" {
			writeBlobMissing(w)
			return
		}
		allowed, err := s.svc.ResolveBlobAccess(ctx, chi.URLParam(r, "hash"), scopeAdminID)
		if err != nil {
			apperr.Write(w, http.StatusServiceUnavailable, apperr.SlugInternal,
				"cannot verify asset access")
			return
		}
		if !allowed {
			writeBlobMissing(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeBlobMissing(w http.ResponseWriter) {
	apperr.Write(w, http.StatusNotFound, apperr.SlugNotFound, "asset not found")
}
```

- [x] **Step 4: Запустить тест, убедиться что проходит**

Run: `cd backend/services/gateway-service && go test ./internal/transport/httpapi/ -run TestBlobGateSuite -v`
Expected: PASS, 5 тестов.

- [x] **Step 5: Смонтировать на маршруты ассета**

Modify `backend/services/gateway-service/internal/bootstrap/transport.go` — заменить три строки ассетов и SSE:

```go
	// Binary asset proxy — authenticated and now scoped. The hash addresses
	// content and is deduplicated across territories and models, so the
	// territory gate cannot cover it; RequireBlobAccess asks the catalog whether
	// any row the caller can see holds this hash.
	r.With(authH.Authenticate, apiServer.RequireBlobAccess).Get("/api/assets/{hash}", assetProxy.ServeHTTP)
	r.With(authH.Authenticate, apiServer.RequireBlobAccess).Head("/api/assets/{hash}", assetProxy.ServeHTTP)
	// SSE stays authenticated but unscoped: a job id is 128 random bits and the
	// payload names a kind and a slug, not a blob. Scoping the stream is a
	// different question and is deliberately out of scope here.
	r.With(authH.Authenticate).Get("/api/jobs/{id}/events", apiServer.WatchJobEvents)
```

- [x] **Step 6: Прогнать тесты шлюза**

Run: `cd backend/services/gateway-service && go build ./... && go test ./...`
Expected: PASS.

- [x] **Step 7: Проверить вживую на двух тенантах**

```bash
cd /Users/vbncursed/programming/rosneft
docker compose up -d --build gateway catalog
docker image inspect andrey-gateway --format '{{.Created}}'   # сверить со временем сейчас
docker image inspect andrey-catalog --format '{{.Created}}'
```

Войти под `cotest` и `cotest2`, взять хеш артефакта территории `tenant-a-scene`
из её scene-бандла и запросить `/api/assets/<hash>` обоими куками.

Expected: свой тенант `200`, чужой `404`, Root `200`; хеш модели `200` у обоих;
сцена `dji-wp-46-cut` под Root грузится целиком — GLB, панорама, документ.

- [x] **Step 8: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/
git commit -m "fix(gateway): refuse a blob the caller's tenant cannot reach"
```

---

### Task 4: Сужение CORS

**Files:**
- Modify: `backend/services/gateway-service/internal/bootstrap/transport.go`
- Modify: `backend/services/gateway-service/internal/config/config.go`
- Modify: `backend/services/gateway-service/cmd/gateway/main.go`
- Create: `backend/services/gateway-service/internal/bootstrap/cors_test.go`

**Interfaces:**
- Consumes: `config.Config.AllowedOrigins`.
- Produces: ничего для других задач.

- [ ] **Step 1: Написать падающий тест**

Create `backend/services/gateway-service/internal/bootstrap/cors_test.go`:

```go
package bootstrap

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

// CORSSuite pins the one thing that is easy to get backwards here.
//
// go-chi/cors treats an EMPTY AllowedOrigins list as "all origins"
// (cors.go:131 sets allowedOriginsAll when the list is empty and no
// AllowOriginFunc is set). Blanking the config is therefore not a way to turn
// CORS off — it is a way to turn it fully on. The only way to say "none" is to
// not mount the handler.
type CORSSuite struct{ suite.Suite }

func TestCORSSuite(t *testing.T) { suite.Run(t, new(CORSSuite)) }

func (s *CORSSuite) probe(origins []string) *http.Response {
	r := newRouterWithCORS(origins)
	// The route is registered here, not inside newRouterWithCORS: a helper that
	// carried a /probe endpoint would ship it to production.
	r.Get("/probe", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/probe", nil)
	req.Header.Set("Origin", "https://evil.example")
	r.ServeHTTP(rec, req)
	res := rec.Result()
	s.T().Cleanup(func() { _ = res.Body.Close() })
	return res
}

func (s *CORSSuite) TestNoOriginsMeansNoCORSHeadersAtAll() {
	assert.Equal(s.T(), s.probe(nil).Header.Get("Access-Control-Allow-Origin"), "",
		"an empty list must mean no cross-origin access, not a wildcard")
}

func (s *CORSSuite) TestAConfiguredOriginIsStillEchoed() {
	res := s.probe([]string{"https://evil.example"})
	assert.Equal(s.T(), res.Header.Get("Access-Control-Allow-Origin"), "https://evil.example")
}

func (s *CORSSuite) TestAnUnlistedOriginIsNotEchoed() {
	res := s.probe([]string{"https://good.example"})
	assert.Equal(s.T(), res.Header.Get("Access-Control-Allow-Origin"), "")
}
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd backend/services/gateway-service && go test ./internal/bootstrap/ -run TestCORSSuite`
Expected: FAIL — `newRouterWithCORS undefined`.

- [ ] **Step 3: Вынести монтирование CORS в тестируемую функцию**

Modify `backend/services/gateway-service/internal/bootstrap/transport.go` — заменить безусловный `r.Use(cors.Handler(...))` на вызов, и добавить функцию:

```go
// newRouterWithCORS builds a router carrying the CORS handler only when there is
// something to allow.
//
// An empty list must mean "no cross-origin access". go-chi/cors disagrees: an
// empty AllowedOrigins with no AllowOriginFunc sets allowedOriginsAll and echoes
// every origin (cors.go:131). Not mounting the handler is the only way to say
// none — and a same-origin SPA needs no CORS headers at all, in dev or in prod.
//
// The knob stays for a third-party consumer of the API, should one appear.
func newRouterWithCORS(origins []string) chi.Router {
	r := chi.NewRouter()
	if len(origins) > 0 {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   origins,
			AllowedMethods:   []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
			AllowedHeaders:   []string{"Content-Type", "If-None-Match", "Authorization", "Upload-Offset", "X-CSRF-Token"},
			ExposedHeaders:   []string{"ETag", "Content-Length", "Content-Range", "X-Next-Cursor", "Upload-Offset", "Upload-Length"},
			AllowCredentials: true,
			MaxAge:           300,
		}))
	}
	return r
}
```

В `InitRouter` заменить `r := chi.NewRouter()` на
`r := newRouterWithCORS(cfg.AllowedOrigins)` и **удалить `resolveOrigins`**
вместе с прежним блоком `r.Use(cors.Handler(...))` — именно `resolveOrigins`
сегодня превращает пустой список в `{"*"}`, поэтому её нельзя оставить в цепочке.
Остальные маршруты регистрируются на возвращённом роутере как раньше.

- [ ] **Step 4: Сменить дефолт на пустой список**

Modify `internal/config/config.go`: `v.SetDefault("allowed-origins", []string{})`.
Modify `cmd/gateway/main.go`: `flags.StringSlice("allowed-origins", nil, "CORS allowed origins; empty disables CORS entirely (a same-origin SPA needs none)")`.

`docker-compose.yml` **не** трогаем: переменная `GATEWAY_ALLOWED_ORIGINS` там не
задана, и это теперь правильное состояние — дев одно-origin через прокси Vite.

- [ ] **Step 5: Запустить тесты**

Run: `cd backend/services/gateway-service && go build ./... && go test ./...`
Expected: PASS.

- [ ] **Step 6: Проверить вживую, что чанковая загрузка цела**

```bash
cd /Users/vbncursed/programming/rosneft && docker compose up -d --build gateway && sleep 12
docker image inspect andrey-gateway --format '{{.Created}}'
cd frontend && yarn dev
```

Загрузить модель через форму создания на `http://localhost:3000`. Ожидаемо:
загрузка проходит, в Network у `PATCH /api/uploads/{id}` нет preflight-запроса
`OPTIONS` — он одно-origin. Заголовков `Access-Control-*` в ответах нет вовсе.

- [ ] **Step 7: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/
git commit -m "fix(gateway): stop allowing every origin by default"
```

---

### Task 5: CSRF-токен — бэкенд

**Files:**
- Create: `backend/services/gateway-service/internal/transport/authhttp/csrf.go`
- Create: `backend/services/gateway-service/internal/transport/authhttp/csrf_test.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/respond.go` (`sessionTokenFrom`)
- Modify: `backend/services/gateway-service/internal/transport/authhttp/handlers.go`, `passkey.go` (выдача токена)
- Modify: `backend/services/gateway-service/internal/config/config.go`, `cmd/gateway/main.go`, `internal/bootstrap/serve.go`
- Modify: `backend/services/gateway-service/internal/bootstrap/transport.go` (монтирование)
- Modify: `backend/services/gateway-service/api/openapi.yaml`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `CookieOptions`, `sessionCookieName` — существуют.
- Produces: `sessionTokenFrom(r *http.Request) (token string, fromCookie bool)`; `(*Handlers).CSRFToken(sessionToken string) string`; `(*Handlers).RequireCSRF(next http.Handler) http.Handler`.

- [ ] **Step 1: Написать падающий тест**

Create `backend/services/gateway-service/internal/transport/authhttp/csrf_test.go`:

```go
package authhttp

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type CSRFSuite struct{ suite.Suite }

func TestCSRFSuite(t *testing.T) { suite.Run(t, new(CSRFSuite)) }

func (s *CSRFSuite) handlers() *Handlers {
	return &Handlers{csrfSecret: []byte("test-secret")}
}

// The token is derived, not stored: the gateway can recompute it from the
// session it already has, so nothing needs a database or a second cookie.
func (s *CSRFSuite) TestTokenIsDerivedFromTheSession() {
	h := s.handlers()
	assert.Equal(s.T(), h.CSRFToken("sess-1"), h.CSRFToken("sess-1"), "must be deterministic")
	assert.Assert(s.T(), h.CSRFToken("sess-1") != h.CSRFToken("sess-2"),
		"a token must not be transplantable onto another session")
	assert.Assert(s.T(), h.CSRFToken("sess-1") != "sess-1", "must not leak the session token")
}

func (s *CSRFSuite) TestDifferentSecretsYieldDifferentTokens() {
	a := (&Handlers{csrfSecret: []byte("one")}).CSRFToken("sess-1")
	b := (&Handlers{csrfSecret: []byte("two")}).CSRFToken("sess-1")
	assert.Assert(s.T(), a != b, "rotating the secret must invalidate outstanding tokens")
}

// mutate drives RequireCSRF with a session delivered the given way.
func (s *CSRFSuite) mutate(byCookie bool, header string) int {
	h := s.handlers()
	r := httptest.NewRequest(http.MethodPost, "/api/territories", nil)
	if byCookie {
		r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "sess-1"})
	} else {
		r.Header.Set("Authorization", "Bearer sess-1")
	}
	if header != "" {
		r.Header.Set(csrfHeaderName, header)
	}
	rec := httptest.NewRecorder()
	h.RequireCSRF(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rec, r)
	return rec.Code
}

func (s *CSRFSuite) TestCookieSessionNeedsTheToken() {
	assert.Equal(s.T(), s.mutate(true, ""), http.StatusForbidden)
	assert.Equal(s.T(), s.mutate(true, "wrong"), http.StatusForbidden)
	assert.Equal(s.T(), s.mutate(true, s.handlers().CSRFToken("sess-1")), http.StatusOK)
}

// The reason this scheme does not break curl, the tests or any integration: a
// browser cannot attach an Authorization header to a cross-site request, so a
// Bearer caller cannot be CSRF'd and needs no token.
func (s *CSRFSuite) TestBearerSessionIsExemptByConstruction() {
	assert.Equal(s.T(), s.mutate(false, ""), http.StatusOK)
}

func (s *CSRFSuite) TestSafeMethodsPassWithoutAToken() {
	h := s.handlers()
	for _, m := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		r := httptest.NewRequest(m, "/api/territories", nil)
		r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "sess-1"})
		rec := httptest.NewRecorder()
		h.RequireCSRF(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		})).ServeHTTP(rec, r)
		assert.Equal(s.T(), rec.Code, http.StatusOK, "%s must not need a token", m)
	}
}

func (s *CSRFSuite) TestSessionTokenFromReportsItsSource() {
	c := httptest.NewRequest(http.MethodGet, "/", nil)
	c.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "from-cookie"})
	tok, fromCookie := sessionTokenFrom(c)
	assert.Equal(s.T(), tok, "from-cookie")
	assert.Equal(s.T(), fromCookie, true)

	b := httptest.NewRequest(http.MethodGet, "/", nil)
	b.Header.Set("Authorization", "Bearer from-header")
	tok, fromCookie = sessionTokenFrom(b)
	assert.Equal(s.T(), tok, "from-header")
	assert.Equal(s.T(), fromCookie, false)
}
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd backend/services/gateway-service && go test ./internal/transport/authhttp/ -run TestCSRFSuite`
Expected: FAIL — `Handlers.csrfSecret undefined`, `csrfHeaderName undefined`, `sessionTokenFrom undefined`.

- [ ] **Step 3: Реализовать токен и middleware**

Create `backend/services/gateway-service/internal/transport/authhttp/csrf.go`:

```go
package authhttp

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// csrfHeaderName is where the SPA echoes the token back.
const csrfHeaderName = "X-CSRF-Token"

// CSRFToken derives the anti-CSRF token for a session.
//
// Derived, not stored: the gateway holds both inputs at request time, so the
// scheme needs no database, no Redis key and no second cookie. Being a function
// of the session token also binds it — it cannot be transplanted onto another
// session, and it dies exactly when that session does. Rotating
// GATEWAY_CSRF_SECRET invalidates every outstanding token at once.
func (h *Handlers) CSRFToken(sessionToken string) string {
	mac := hmac.New(sha256.New, h.csrfSecret)
	mac.Write([]byte(sessionToken))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// RequireCSRF rejects a state-changing request whose cookie session is not
// accompanied by a matching token.
//
// Only cookie sessions are checked, and that is the whole reason this is
// affordable: a browser will not attach an Authorization header to a cross-site
// request, so a Bearer caller cannot be CSRF'd. curl, the tests and every
// non-browser integration therefore need no change.
//
// SameSite=Lax on the session cookie remains the first line. This is the second,
// and its value is that it survives a state-changing GET being added by
// accident — which is the single assumption the first line rests on.
func (h *Handlers) RequireCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		token, fromCookie := sessionTokenFrom(r)
		if !fromCookie {
			next.ServeHTTP(w, r)
			return
		}
		want := h.CSRFToken(token)
		got := r.Header.Get(csrfHeaderName)
		// Constant time: the token is a MAC, and a byte-at-a-time comparison
		// would leak it to a caller who can time enough attempts.
		if !hmac.Equal([]byte(want), []byte(got)) {
			apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden,
				"missing or invalid CSRF token; re-read /api/auth/me")
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 4: Дать `sessionToken` источник**

Modify `backend/services/gateway-service/internal/transport/authhttp/respond.go` — заменить тело `sessionToken` на обёртку:

```go
// sessionTokenFrom returns the caller's session token and whether it arrived in
// the cookie. The source matters to RequireCSRF and to nothing else: a Bearer
// caller is immune to CSRF by construction.
func sessionTokenFrom(r *http.Request) (string, bool) {
	if c, err := r.Cookie(sessionCookieName); err == nil && c.Value != "" {
		return c.Value, true
	}
	const p = "Bearer "
	h := r.Header.Get("Authorization")
	if len(h) > len(p) && h[:len(p)] == p {
		return h[len(p):], false
	}
	return "", false
}

// sessionToken returns the caller's session token: the cookie first, the
// Authorization header second. Kept as a thin wrapper so the 28 call sites that
// do not care where it came from stay unchanged.
func sessionToken(r *http.Request) string {
	tok, _ := sessionTokenFrom(r)
	return tok
}
```

- [ ] **Step 5: Запустить тест, убедиться что проходит**

Run: `cd backend/services/gateway-service && go test ./internal/transport/authhttp/ -run TestCSRFSuite -v`
Expected: PASS, 6 тестов.

- [ ] **Step 6: Выдавать токен клиенту**

Добавить поле `csrfSecret []byte` в `Handlers` и седьмой параметр в `New`.

В `handlers.go` — в `login` (внутри `if token != ""`), в `login2FA`, в `me`; в
`passkey.go` — в `passkeyLoginFinish`: добавить `"csrfToken": h.CSRFToken(token)`
в тело ответа. Для `me` токен берётся из `sessionToken(r)`.

```go
	writeJSON(w, http.StatusOK, map[string]any{
		"token":             token,
		"twoFactorRequired": twoFA,
		"challengeToken":    challenge,
		"csrfToken":         h.CSRFToken(token),
	})
```

Modify `api/openapi.yaml`: добавить `csrfToken: { type: string }` в схемы ответа
`/api/auth/login`, `/api/auth/login/2fa`, `/api/auth/passkey/login/finish` и
`/api/auth/me`. Затем `make -C backend openapi-gen`.

- [ ] **Step 7: Пробросить конфиг и смонтировать**

Modify `internal/config/config.go`:

```go
	// CSRFSecret keys the HMAC behind the anti-CSRF token. No default: a
	// hardcoded one would be public, and a random per-boot one would log every
	// user out of writing on every restart. Required at startup instead.
	CSRFSecret string `mapstructure:"csrf-secret"`
```

В `Validate()`:

```go
	if c.CSRFSecret == "" {
		return fmt.Errorf("config: csrf-secret is required")
	}
```

Modify `cmd/gateway/main.go`: `flags.String("csrf-secret", "", "HMAC key for the anti-CSRF token (required)")`.

Modify `internal/bootstrap/serve.go`: седьмым аргументом `authhttp.New` передать
`[]byte(cfg.CSRFSecret)`; в `spec_coverage_test.go` — `[]byte("test")`.

Modify `docker-compose.yml`, в `environment` шлюза:

```yaml
      # Local dev only. Production must set its own; the service refuses to boot
      # without one rather than fall back to something guessable.
      GATEWAY_CSRF_SECRET: "local-dev-csrf-secret"
```

Modify `internal/bootstrap/transport.go` — в `/api`-подроутере после
`RequirePermissionForRoute`, и в `authhttp.Mount` для authed-группы:

```go
		api.Use(authH.RequireCSRF)
```

- [ ] **Step 8: Прогнать тесты**

Run: `cd backend/services/gateway-service && go build ./... && go test ./...`
Expected: PASS.

- [ ] **Step 9: Проверить вживую**

```bash
cd /Users/vbncursed/programming/rosneft && docker compose up -d --build gateway && sleep 12
docker image inspect andrey-gateway --format '{{.Created}}'
rm -f /tmp/j && curl -s -c /tmp/j -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' -d '{"identifier":"admin","password":"change-me-now"}'
# Мутация кукой без токена — 403:
curl -s -b /tmp/j -o /dev/null -w 'кука без токена: %{http_code}\n' \
  -X DELETE http://localhost:8080/api/territories/nope
# Bearer без токена — проходит гейт CSRF (404, потому что территории нет):
TOK=$(curl -s -X POST http://localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"change-me-now"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Bearer $TOK" -o /dev/null -w 'bearer без токена: %{http_code}\n' \
  -X DELETE http://localhost:8080/api/territories/nope
```

Expected: `кука без токена: 403`, `bearer без токена: 404`.

- [ ] **Step 10: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/ docker-compose.yml
git commit -m "feat(gateway): require an anti-CSRF token on cookie sessions"
```

---

### Task 6: CSRF-токен — фронтенд

**Files:**
- Create: `frontend/src/auth/infrastructure/csrf-token.ts`
- Create: `frontend/src/auth/infrastructure/csrf-token.spec.ts`
- Modify: `frontend/src/shared/infrastructure/http/client.ts`
- Modify: `frontend/src/auth/infrastructure/auth-login.ts`, `passkey-gateway.ts`
- Modify: `frontend/src/upload/infrastructure/upload-gateway.ts`
- Modify: `frontend/src/shared/infrastructure/http/client.spec.ts`

**Interfaces:**
- Consumes: поле `csrfToken` в ответах входа и `/api/auth/me` (Задача 5).
- Produces: `setCsrfToken(t: string): void`, `getCsrfToken(): string | null`, `clearCsrfToken(): void`.

- [ ] **Step 1: Написать падающий тест**

Create `frontend/src/auth/infrastructure/csrf-token.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { setCsrfToken, getCsrfToken, clearCsrfToken } from "@/auth/infrastructure/csrf-token";

beforeEach(() => {
  clearCsrfToken();
  localStorage.clear();
});

describe("csrf token", () => {
  it("has no token before anyone logs in", () => {
    expect(getCsrfToken()).toBeNull();
  });

  it("remembers the token handed out at login", () => {
    setCsrfToken("tok-1");
    expect(getCsrfToken()).toBe("tok-1");
  });

  it("forgets on logout", () => {
    setCsrfToken("tok-1");
    clearCsrfToken();
    expect(getCsrfToken()).toBeNull();
  });

  // Memory only, deliberately: a token in storage outlives the tab and is one
  // more secret at rest. It is re-read from /api/auth/me on every page load.
  it("never touches persistent storage", () => {
    setCsrfToken("tok-1");
    expect(JSON.stringify(localStorage)).not.toContain("tok-1");
    expect(document.cookie).not.toContain("tok-1");
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd frontend && yarn test:spa src/auth/infrastructure/csrf-token.spec.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать хранилище в памяти**

Create `frontend/src/auth/infrastructure/csrf-token.ts`:

```ts
// The anti-CSRF token lives in memory for the lifetime of the tab and nowhere
// else. It is not in localStorage and not in a cookie: both outlive the tab and
// would be one more secret at rest for no gain. Every page load re-reads it from
// /api/auth/me, which the app already calls before it can render anything.
let token: string | null = null;

export function setCsrfToken(t: string): void {
  token = t;
}

export function getCsrfToken(): string | null {
  return token;
}

export function clearCsrfToken(): void {
  token = null;
}
```

- [ ] **Step 4: Слать заголовок на мутациях**

Modify `frontend/src/shared/infrastructure/http/client.ts`:

```ts
import { clearAuthed } from "@/auth/infrastructure/session-marker";
import { getCsrfToken } from "@/auth/infrastructure/csrf-token";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

async function send<T>(path: string, init: RequestInit, parseJson: boolean): Promise<T> {
  // No Authorization header: the session is an httpOnly cookie, and the SPA is
  // single-origin with the API in both dev and prod, so the browser attaches it
  // to every request here without being asked. The cookie is exactly why the
  // CSRF token is needed — it rides along on a cross-site POST too, and only
  // this header proves the request came from our own page.
  const csrf = getCsrfToken();
  const needsCsrf = !SAFE.has((init.method ?? "GET").toUpperCase()) && csrf;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(needsCsrf ? { "X-CSRF-Token": csrf } : {}),
      ...(init.headers ?? {}),
    },
  });
```

Остальная часть файла без изменений.

- [ ] **Step 5: Запоминать и забывать токен**

`auth-login.ts` — в `login` (когда `!r.twoFactorRequired`) и в `verifyTwoFactor`
вызвать `setCsrfToken(r.csrfToken)`; в `logout` — `clearCsrfToken()`. Типы
`LoginResponse` и ответа 2FA получают `csrfToken: string`.

`passkey-gateway.ts` — в `loginFinish` вызвать `setCsrfToken(r.csrfToken)`.

**Восстановление после перезагрузки страницы** — самое лёгкое место, чтобы
забыть: токен живёт в памяти, значит после F5 его нет, и первая же мутация
получит 403. Подхватывается он из `/api/auth/me`, которую приложение и так
зовёт до отрисовки. В гейтвее, читающем этот ответ (`auth/infrastructure/`,
функция, отдающая профиль), добавить:

```ts
// The token lives in memory only, so a page reload starts without one. This is
// where it comes back: meQuery already runs before anything can be mutated.
if (r.csrfToken) setCsrfToken(r.csrfToken);
```

Проверяется шагом 8: перезагрузить страницу и сразу выполнить мутацию.

`upload-gateway.ts` — `uploadHeaders` добавляет `X-CSRF-Token`, потому что
`PATCH` и `DELETE` идут мимо общего клиента:

```ts
// PATCH/HEAD/DELETE bypass the shared JSON client, so they carry the CSRF token
// themselves. The session cookie rides on these same-origin fetches on its own.
function uploadHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const csrf = getCsrfToken();
  return { ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...extra };
}
```

- [ ] **Step 6: Добавить тест клиента**

Добавить в `frontend/src/shared/infrastructure/http/client.spec.ts`:

```ts
it("sends the CSRF token on mutations and not on reads", async () => {
  setCsrfToken("csrf-1");
  const f = mockFetch(200, {});
  vi.stubGlobal("fetch", f);

  await httpPost("/api/x", {});
  expect(((f.mock.calls[0][1] as RequestInit).headers as Record<string, string>)["X-CSRF-Token"])
    .toBe("csrf-1");

  await httpGet("/api/x");
  expect(((f.mock.calls[1][1] as RequestInit).headers as Record<string, string>)["X-CSRF-Token"])
    .toBeUndefined();
});
```

- [ ] **Step 7: Регенерировать DTO и прогнать проверки**

Run: `cd frontend && yarn openapi:generate && yarn lint && yarn test && yarn test:spa`
Expected: PASS.

- [ ] **Step 8: Проверить вживую**

```bash
cd /Users/vbncursed/programming/rosneft && docker compose up -d && cd frontend && yarn dev
```

Войти на `http://localhost:3000`, создать и удалить плейсмент. Ожидаемо: работает,
в Network у мутаций есть заголовок `X-CSRF-Token`, у чтений его нет. Перезагрузить
страницу и повторить мутацию — токен должен восстановиться из `/api/auth/me`.

- [ ] **Step 9: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/ backend/services/gateway-service/api/openapi.yaml
git commit -m "feat(frontend): send the anti-CSRF token on mutations"
```

---

### Task 7: Тест, запрещающий меняющий состояние GET

**Files:**
- Create: `backend/services/gateway-service/internal/transport/httpapi/safe_get_test.go`

**Interfaces:**
- Consumes: `GetSpec()` — существует.
- Produces: ничего.

- [ ] **Step 1: Написать тест**

Create `backend/services/gateway-service/internal/transport/httpapi/safe_get_test.go`:

```go
package httpapi

import (
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

// SafeGetSuite guards the assumption the whole CSRF defence rests on.
//
// SameSite=Lax withholds the session cookie from a cross-site POST but sends it
// on a cross-site top-level GET. So a GET that changes state would be forgeable
// from any page on the internet, and neither the cookie's SameSite attribute nor
// the CSRF token would stop it — RequireCSRF deliberately lets safe methods
// through. The rule is written in backend/CLAUDE.md; this is what enforces it.
type SafeGetSuite struct{ suite.Suite }

func TestSafeGetSuite(t *testing.T) { suite.Run(t, new(SafeGetSuite)) }

func (s *SafeGetSuite) TestNoDocumentedGetCarriesARequestBody() {
	sw, err := GetSpec()
	assert.NilError(s.T(), err)

	checked := 0
	for path, item := range sw.Paths.Map() {
		op, ok := item.Operations()[http.MethodGet]
		if !ok {
			continue
		}
		checked++
		assert.Assert(s.T(), op.RequestBody == nil,
			"GET %s declares a request body, which means it is doing work a GET must not do", path)
	}
	// Guard the guard: a spec that failed to load would pass the loop silently.
	assert.Assert(s.T(), checked >= 20, "expected at least 20 documented GETs, saw %d", checked)
}

// The verbs that change state are exactly the ones RequireCSRF checks. If a
// route ever needs another, this test is where the decision gets recorded.
func (s *SafeGetSuite) TestOnlyTheExpectedVerbsAppearInTheSpec() {
	sw, err := GetSpec()
	assert.NilError(s.T(), err)

	allowed := map[string]bool{
		http.MethodGet: true, http.MethodHead: true, http.MethodPost: true,
		http.MethodPut: true, http.MethodPatch: true, http.MethodDelete: true,
	}
	for path, item := range sw.Paths.Map() {
		for method := range item.Operations() {
			assert.Assert(s.T(), allowed[method],
				"%s %s uses a verb the CSRF middleware does not classify", method, path)
			assert.Assert(s.T(), !strings.HasPrefix(method, "TRACE"), "%s", path)
		}
	}
}
```

- [ ] **Step 2: Запустить тест**

Run: `cd backend/services/gateway-service && go test ./internal/transport/httpapi/ -run TestSafeGetSuite -v`
Expected: PASS. Если падает — значит меняющий состояние GET уже есть, и это находка: разобраться до продолжения.

- [ ] **Step 3: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/
git commit -m "test(gateway): pin the no-state-changing-GET rule the CSRF defence rests on"
```

---

### Task 8: Документация

**Files:**
- Modify: `CLAUDE.md`
- Modify: `backend/CLAUDE.md`
- Modify: `backend/services/gateway-service/README.md`
- Modify: `frontend/README.md`

**Interfaces:**
- Consumes: всё построенное в задачах 1–7. Кода не меняет.

- [ ] **Step 1: Корневой CLAUDE.md**

В раздел про эндпоинты шлюза, заменить пункт про ассеты:

```markdown
- `GET /api/assets/{hash}` **требует сессии и скоупится по тенанту**: `RequireBlobAccess` спрашивает каталог, есть ли хоть одна видимая этому вызывающему строка с таким хешем. Блобы моделей доступны всем — библиотека общая по решению. Отказ — 404; 503, если каталог недоступен (это не «нет», а «не знаю»).
- Мутации через куку требуют заголовка `X-CSRF-Token`. Bearer-вызовы освобождены: браузер не приложит `Authorization` к межсайтовому запросу, поэтому curl и интеграции не меняются.
- **CORS выключен по умолчанию.** Пустой `GATEWAY_ALLOWED_ORIGINS` означает, что middleware не монтируется вовсе — передать пустой список в go-chi/cors нельзя, для него это «все origin».
```

- [ ] **Step 2: backend/CLAUDE.md**

Дополнить раздел «Tenant isolation»:

```markdown
Блобы скоупятся отдельно от территорий и по другой причине: хеш адресует
содержимое и дедуплицируется, поэтому единственной территории у него нет.
`ResolveBlobAccess` в каталоге отвечает одним `EXISTS` над шестью таблицами;
логика целиком в SQL, поэтому проверяется интеграционным тестом на
testcontainers (`-tags=integration`), а не моком — мок проверил бы только
проброс аргументов, а забытый скоуп-фильтр в одной ветке утёк бы молча.

Добавили таблицу с колонкой-хешем? Добавьте ветку в `ResolveBlobAccess` и
случай в его тест — иначе новый тип ассета либо недоступен никому, либо
доступен всем, и ни компилятор, ни другой тест этого не заметят.
```

Добавить раздел про CSRF с обоснованием «токен выводится, не хранится» и
«проверяется только для куки-сессий».

- [ ] **Step 3: README шлюза и фронта**

В `backend/services/gateway-service/README.md`: `GATEWAY_CSRF_SECRET` в таблицу
переменных (обязательная, без дефолта), изменившийся дефолт
`GATEWAY_ALLOWED_ORIGINS`, `RequireBlobAccess` в цепочку middleware.

В `frontend/README.md`: раздел про аутентификацию дополнить тем, что мутации
несут `X-CSRF-Token`, а токен живёт в памяти и восстанавливается из
`/api/auth/me`.

- [ ] **Step 4: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add CLAUDE.md backend/CLAUDE.md backend/services/gateway-service/README.md frontend/README.md
git commit -m "docs(assets): blob scoping, the CSRF token and CORS off by default"
```

---

## Финальная проверка

- [ ] **Полный прогон**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
cd backend/services/catalog-service && go test -tags=integration ./internal/storage/ && cd ../../..
cd frontend && yarn lint && yarn test && yarn test:spa && cd ..
docker compose up -d --build && sleep 30
docker image inspect andrey-gateway --format '{{.Created}}'
docker image inspect andrey-catalog --format '{{.Created}}'
```

Плюс ручная проверка на двух тенантах: хеш артефакта территории A даёт 404 у
тенанта B и 200 у тенанта A; хеш модели — 200 у обоих; сцена с моделями,
панорамами и PDF грузится целиком; мутация кукой без `X-CSRF-Token` даёт 403,
с токеном — проходит; Bearer-мутация работает без токена.

- [ ] **Открыть PR**

```bash
git push -u origin dev
gh pr create --base main --head dev \
  --title "fix(rbac): scope binary assets by tenant, add a CSRF token, turn CORS off by default" \
  --body "См. docs/superpowers/specs/2026-07-29-asset-scoping-csrf-design.md"
```
