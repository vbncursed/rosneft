# Подписи к идентификаторам внутри diff журнала аудита — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В развёрнутой записи журнала аудита поля-ссылки (`role_id`, `user_id`, `model_id`, …) показываются человекочитаемой подписью вместо голого идентификатора.

**Architecture:** Gateway на чтении страницы собирает из сырых снимков `old_row`/`new_row` все значения полей-ссылок, разрешает их пакетно у сервисов-владельцев (auth — роли, права, логины; catalog — территории, модели, панорамы) и отдаёт клиенту плоский словарь `refs`, ключ которого — `имя_поля:значение`. Снимки остаются сырыми, `diff.ts` не меняется, таблица «поле → вид» живёт только на сервере.

**Tech Stack:** Go 1.26.5, gRPC + protobuf (buf), Postgres (pgx), oapi-codegen, minimock + testify/suite + gotest.tools; React 19 + TanStack Query, openapi-typescript, `node --test` для чистой логики.

Спека: [`docs/superpowers/specs/2026-07-29-audit-diff-ref-labels-design.md`](../specs/2026-07-29-audit-diff-ref-labels-design.md).

## Global Constraints

- Потолок 200 строк на файл — и в Go, и во фронтенде. Один смысл на файл: новый метод сервиса — новый файл.
- Доменные типы наружу не текут: транспорт переводит sentinel-ошибки из `domain/errors.go` в коды gRPC.
- Тесты: `testify/suite` для группировки, `gotest.tools/v3/assert` для проверок (`assert.X(s.T(), …)`, не `s.Equal()`), `minimock` для моков. Контроллер строится в `SetupTest` через `minimock.NewController(s.T())` — он сам проверяет ожидания на cleanup.
- Контекст в тестах — `t.Context()` / `s.T().Context()`, никогда `context.Background()`.
- Каждый вызов gRPC-клиента в gateway оборачивается `grpcerr.MapStatus(err, nil)`, иначе HTTP-слой не сможет отличить 400 от 500.
- Перед каждым коммитом — `make -C backend check` (его же запускает pre-commit хук).
- Модерн-Go обязателен: `errors.AsType[T]`, `wg.Go`, `slices`/`maps`, `for i := range n`, `min`/`max`, `new(val)`.
- Ошибка резолва подписи никогда не роняет запрос: логируется через `slog.WarnContext` и глотается, значение деградирует до голого id.

---

## Структура файлов

**catalog-service**
- Создать `internal/domain/label_ref.go` — тип `LabelRef`.
- Создать `internal/storage/resolve_labels.go` — SQL по видам.
- Создать `internal/service/resolve_labels.go` — валидация, дедуп, cap.
- Создать `internal/service/resolve_labels_test.go`.
- Создать `internal/transport/grpcapi/resolve_labels.go`.
- Изменить `internal/service/catalog.go` (Repository), `internal/transport/grpcapi/server.go` (Service).

**auth-service**
- Создать `internal/domain/label_ref.go`.
- Создать `internal/storage/roles/resolve_labels.go`.
- Создать `internal/service/roles/resolve_labels.go` + тест.
- Создать `internal/transport/grpcapi/resolve_labels.go`.
- Изменить `internal/service/roles/roles.go` (Store), `internal/transport/grpcapi/server.go` (RolesSvc).

**proto**
- Изменить `rosneft/catalog/v1/catalog.proto`, `rosneft/auth/v1/auth.proto`.

**gateway-service**
- Создать `internal/clients/catalog/resolve_labels.go`, `internal/clients/auth/resolve_labels.go`.
- Создать `internal/service/audit_ref_fields.go` — таблица полей и сбор ссылок из снимка.
- Создать `internal/service/audit_ref_fields_test.go`.
- Создать `internal/service/audit_refs.go` — резолв и сборка словаря.
- Создать `internal/service/audit_refs_test.go`.
- Изменить `internal/service/gateway.go` (Catalog, Auth), `internal/service/audit.go` (`wantRefs`), `internal/transport/httpapi/audit.go`, `internal/transport/httpapi/audit_csv.go`, `api/openapi.yaml`.

**frontend**
- Создать `src/audit/domain/ref-label.ts` + `ref-label.test.ts`.
- Изменить `src/audit/infrastructure/audit-gateway.ts`, `src/audit/application/use-audit-log.ts`, `src/audit/presentation/components/diff-view.tsx`, `src/audit/presentation/components/audit-row.tsx`.

---

## Task 1: catalog — `ResolveLabels`

**Files:**
- Create: `backend/services/catalog-service/internal/domain/label_ref.go`
- Create: `backend/services/catalog-service/internal/storage/resolve_labels.go`
- Create: `backend/services/catalog-service/internal/service/resolve_labels.go`
- Create: `backend/services/catalog-service/internal/transport/grpcapi/resolve_labels.go`
- Test: `backend/services/catalog-service/internal/service/resolve_labels_test.go`
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto`
- Modify: `backend/services/catalog-service/internal/service/catalog.go` (интерфейс `Repository`)
- Modify: `backend/services/catalog-service/internal/transport/grpcapi/server.go` (интерфейс `Service`)

**Interfaces:**
- Consumes: ничего.
- Produces: `domain.LabelRef{Kind string; ID int64}`; `Catalog.ResolveLabels(ctx, []domain.LabelRef) (map[string]string, error)` — ключ результата `"<kind>:<id>"`; gRPC `CatalogService.ResolveLabels`.

- [ ] **Step 1: Добавить сообщения и RPC в proto**

В `backend/proto/rosneft/catalog/v1/catalog.proto`, сразу после строки с `ResolveTerritorySlugs`:

```proto
  // ResolveLabels names catalog rows for the audit journal, whose snapshots
  // carry a parent or a target only as a number. It is the plural, multi-kind
  // sibling of ResolveTerritorySlugs, which stays because the entry-level
  // enrichment already calls it.
  rpc ResolveLabels(ResolveLabelsRequest) returns (ResolveLabelsResponse);
```

Рядом с `ResolveTerritorySlugsResponse` добавить:

```proto
// LabelRef is one id to name. kind is "territory", "model" or "panorama".
message LabelRef {
  string kind = 1;
  int64 id = 2;
}
message ResolveLabelsRequest {
  // At most 500. A kind this service does not know is dropped rather than
  // refused: during a rolling deploy a newer gateway may ask for one, and a
  // single unknown kind must not cost the reader every other label on the page.
  repeated LabelRef refs = 1;
}
message ResolveLabelsResponse {
  // Keyed "<kind>:<id>". Refs that match nothing are absent — the journal
  // outlives the rows it describes.
  map<string, string> labels = 1;
}
```

- [ ] **Step 2: Сгенерировать Go-код из proto**

Run: `cd backend && make proto-gen`
Expected: в `backend/proto/gen/go/rosneft/catalog/v1/` появляются `LabelRef`, `ResolveLabelsRequest`, `ResolveLabelsResponse` и метод в клиенте/сервере.

Проверка: `cd backend/proto && GOWORK=off go build ./...` — успешно.

- [ ] **Step 3: Написать падающий тест сервиса**

Создать `backend/services/catalog-service/internal/service/resolve_labels_test.go`:

```go
package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

// ResolveLabels называет строки каталога для журнала аудита: снимок знает
// модель или панораму только числом.

type ResolveLabelsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestResolveLabelsSuite(t *testing.T) {
	suite.Run(t, new(ResolveLabelsSuite))
}

func (s *ResolveLabelsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *ResolveLabelsSuite) TestEmptyListSkipsTheRepository() {
	// Мок без ожиданий: minimock провалит тест, если репозиторий всё же позовут.
	got, err := s.svc.ResolveLabels(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ResolveLabelsSuite) TestRefsAreGroupedByKindAndDeduplicated() {
	var seen map[string][]int64
	s.repo.ResolveLabelsMock.Set(
		func(_ context.Context, byKind map[string][]int64) (map[string]string, error) {
			seen = byKind
			return map[string]string{}, nil
		})

	_, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "model", ID: 7},
		{Kind: "model", ID: 7},
		{Kind: "territory", ID: 12},
	})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), seen["model"], []int64{7})
	assert.DeepEqual(s.T(), seen["territory"], []int64{12})
}

func (s *ResolveLabelsSuite) TestSameIdUnderTwoKindsIsNotCollapsed() {
	// Модель 7 и панорама 7 — разные строки; схлопывание их по числу было бы
	// ровно той коллизией, ради которой ключ несёт вид.
	var seen map[string][]int64
	s.repo.ResolveLabelsMock.Set(
		func(_ context.Context, byKind map[string][]int64) (map[string]string, error) {
			seen = byKind
			return map[string]string{}, nil
		})

	_, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "model", ID: 7},
		{Kind: "panorama", ID: 7},
	})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), seen["model"], []int64{7})
	assert.DeepEqual(s.T(), seen["panorama"], []int64{7})
}

func (s *ResolveLabelsSuite) TestUnknownKindAndNonPositiveIdAreDropped() {
	// Ноль — «поля не было в снимке». Незнакомый вид — перекос выкатки.
	got, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "wormhole", ID: 1},
		{Kind: "model", ID: 0},
		{Kind: "model", ID: -5},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ResolveLabelsSuite) TestOversizedRequestIsRefused() {
	refs := make([]domain.LabelRef, 501)
	for i := range refs {
		refs[i] = domain.LabelRef{Kind: "model", ID: int64(i + 1)}
	}

	_, err := s.svc.ResolveLabels(s.ctx, refs)

	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ResolveLabelsSuite) TestUnknownIdIsOmittedNotAnError() {
	// Журнал помнит удалённые модели; их отсутствие в карте нормально.
	s.repo.ResolveLabelsMock.Return(map[string]string{"model:7": "pump-01"}, nil)

	got, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "model", ID: 7},
		{Kind: "model", ID: 999},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got["model:7"], "pump-01")
	assert.Equal(s.T(), got["model:999"], "")
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он падает**

Run: `cd backend/services/catalog-service && go test ./internal/service/ -run TestResolveLabelsSuite`
Expected: FAIL — компиляция не проходит, `undefined: domain.LabelRef`, `s.svc.ResolveLabels undefined`, `s.repo.ResolveLabelsMock undefined`.

- [ ] **Step 5: Добавить доменный тип**

Создать `backend/services/catalog-service/internal/domain/label_ref.go`:

```go
package domain

// LabelRef is one id the audit journal wants named, together with the kind of
// row it points at. The kind is part of the request because a bare number is
// ambiguous: model 7 and panorama 7 are different rows.
type LabelRef struct {
	Kind string
	ID   int64
}
```

- [ ] **Step 6: Расширить интерфейс Repository и перегенерировать мок**

В `backend/services/catalog-service/internal/service/catalog.go`, сразу под строкой `ResolveTerritorySlugs(...)`:

```go
	// Ключ результата — "<kind>:<id>". Плоская карта вместо карты карт: её
	// потребитель — словарь подписей страницы, у которого ключ ровно такой же.
	ResolveLabels(ctx context.Context, byKind map[string][]int64) (map[string]string, error)
```

Run: `cd backend/services/catalog-service && go generate ./internal/service/`
Expected: `internal/service/mocks/repository_mock.go` пересобран и содержит `ResolveLabelsMock`.

- [ ] **Step 7: Реализовать слой сервиса**

Создать `backend/services/catalog-service/internal/service/resolve_labels.go`:

```go
package service

import (
	"context"
	"fmt"
	"strconv"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// resolveLabelsCap bounds one request, so this stays a labelling helper rather
// than a way to page out the catalog. It matches ResolveTerritorySlugs' cap:
// the callers are the same audit page.
const resolveLabelsCap = 500

// labelKinds is what this service can name. A kind outside it is dropped rather
// than refused: during a rolling deploy a newer gateway may ask for one, and
// refusing would cost the reader every other label on the page.
var labelKinds = map[string]struct{}{
	"territory": {},
	"model":     {},
	"panorama":  {},
}

// ResolveLabels names catalog rows for the audit journal.
//
// No scope, for the same reason ResolveTerritorySlugs has none: the caller
// arrives with ids taken from journal entries its own scope already let
// through, so a slug next to a visible id discloses nothing further. The cap
// stands in for the scope.
//
// A ref that matches nothing is absent from the result — the journal outlives
// the rows it describes, and the caller falls back to showing the id.
func (c *Catalog) ResolveLabels(ctx context.Context, refs []domain.LabelRef) (map[string]string, error) {
	if len(refs) == 0 {
		return map[string]string{}, nil
	}
	if len(refs) > resolveLabelsCap {
		return nil, fmt.Errorf("catalog.ResolveLabels: %w: at most %d refs per call",
			domain.ErrInvalidInput, resolveLabelsCap)
	}

	byKind := make(map[string][]int64, len(labelKinds))
	seen := make(map[string]struct{}, len(refs))
	for _, ref := range refs {
		// Ноль означает «в снимке этого поля не было», а не строку каталога.
		if ref.ID <= 0 {
			continue
		}
		if _, ok := labelKinds[ref.Kind]; !ok {
			continue
		}
		key := ref.Kind + ":" + strconv.FormatInt(ref.ID, 10)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		byKind[ref.Kind] = append(byKind[ref.Kind], ref.ID)
	}
	if len(byKind) == 0 {
		return map[string]string{}, nil
	}
	return c.repo.ResolveLabels(ctx, byKind)
}
```

- [ ] **Step 8: Запустить тест и убедиться, что он проходит**

Run: `cd backend/services/catalog-service && go test ./internal/service/ -run TestResolveLabelsSuite -v`
Expected: PASS, шесть тестов.

- [ ] **Step 9: Реализовать хранилище**

Создать `backend/services/catalog-service/internal/storage/resolve_labels.go`:

```go
package storage

import (
	"context"
	"fmt"
	"strconv"
)

// labelQueries is the per-kind lookup.
//
// panoramas is owned by content-service, not catalog. It lives in the same
// shared DB and catalog already reads it read-only to validate placement
// visibility allowlists (see ListPanoramaIDs); naming one of its rows is the
// same kind of read, and it saves the audit path a second client.
var labelQueries = map[string]string{
	"territory": `SELECT id, slug FROM territories WHERE id = ANY($1)`,
	"model":     `SELECT id, slug FROM models WHERE id = ANY($1)`,
	"panorama":  `SELECT id, slug FROM panoramas WHERE id = ANY($1)`,
}

// ResolveLabels names ids per kind, keyed "<kind>:<id>". The service has
// already dropped kinds this map does not carry.
func (r *PG) ResolveLabels(ctx context.Context, byKind map[string][]int64) (map[string]string, error) {
	out := make(map[string]string)
	for kind, ids := range byKind {
		q, ok := labelQueries[kind]
		if !ok {
			continue
		}
		if err := r.collectLabels(ctx, out, kind, q, ids); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (r *PG) collectLabels(ctx context.Context, out map[string]string, kind, q string, ids []int64) error {
	rows, err := r.pool.Query(ctx, q, ids)
	if err != nil {
		return fmt.Errorf("storage.ResolveLabels(%s): %w", kind, err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id   int64
			slug string
		)
		if err := rows.Scan(&id, &slug); err != nil {
			return fmt.Errorf("storage.ResolveLabels(%s): scan: %w", kind, err)
		}
		out[kind+":"+strconv.FormatInt(id, 10)] = slug
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("storage.ResolveLabels(%s): rows: %w", kind, err)
	}
	return nil
}
```

- [ ] **Step 10: Реализовать gRPC-обвязку**

В `backend/services/catalog-service/internal/transport/grpcapi/server.go` добавить в интерфейс `Service` под строкой `ResolveTerritorySlugs`:

```go
	ResolveLabels(ctx context.Context, refs []domain.LabelRef) (map[string]string, error)
```

Создать `backend/services/catalog-service/internal/transport/grpcapi/resolve_labels.go`:

```go
package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ResolveLabels names catalog rows for the audit journal.
func (s *Server) ResolveLabels(
	ctx context.Context, req *catalogv1.ResolveLabelsRequest,
) (*catalogv1.ResolveLabelsResponse, error) {
	refs := make([]domain.LabelRef, 0, len(req.GetRefs()))
	for _, r := range req.GetRefs() {
		refs = append(refs, domain.LabelRef{Kind: r.GetKind(), ID: r.GetId()})
	}
	labels, err := s.svc.ResolveLabels(ctx, refs)
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.ResolveLabelsResponse{Labels: labels}, nil
}
```

- [ ] **Step 11: Прогнать проверки модуля**

Run: `cd backend/services/catalog-service && GOWORK=off go build ./... && go test ./... && golangci-lint run ./...`
Expected: сборка проходит, тесты зелёные, 0 issues.

- [ ] **Step 12: Коммит**

```bash
git add backend/proto backend/services/catalog-service
git commit -m "feat(catalog): ResolveLabels names territories, models and panoramas by id"
```

---

## Task 2: auth — `ResolveLabels` для ролей и прав

**Files:**
- Create: `backend/services/auth-service/internal/domain/label_ref.go`
- Create: `backend/services/auth-service/internal/storage/roles/resolve_labels.go`
- Create: `backend/services/auth-service/internal/service/roles/resolve_labels.go`
- Create: `backend/services/auth-service/internal/transport/grpcapi/resolve_labels.go`
- Test: `backend/services/auth-service/internal/service/roles/resolve_labels_test.go`
- Modify: `backend/proto/rosneft/auth/v1/auth.proto`
- Modify: `backend/services/auth-service/internal/service/roles/roles.go` (интерфейс `Store`)
- Modify: `backend/services/auth-service/internal/transport/grpcapi/server.go` (интерфейс `RolesSvc`)

**Interfaces:**
- Consumes: ничего из Task 1 — сервисы независимы.
- Produces: `domain.LabelRef{Kind string; ID string}`; `roles.Service.ResolveLabels(ctx, []domain.LabelRef) (map[string]string, error)`, ключ `"<kind>:<uuid>"`; gRPC `AuthService.ResolveLabels`.

> Проверить перед началом: `message Role` и `message Permission` в `auth.proto` не несут `id`, и доменные типы тоже. Именно поэтому `ListRoles` / `ListPermissions` здесь не годятся — uuid из снимка журнала им нечем сопоставить.

- [ ] **Step 1: Добавить сообщения и RPC в proto**

В `backend/proto/rosneft/auth/v1/auth.proto`, в секцию `--- roles / permissions ---`, после `rpc ListPermissions(...)`:

```proto
  // ResolveLabels names roles and permissions the caller already sees. Like
  // ResolveUserLogins it applies no company scope: the ids arrive from journal
  // snapshots the reader's own scope already released, so naming a visible id
  // discloses nothing further. Unlike ListRoles, which addresses roles by slug,
  // this one takes the uuid the snapshot actually carries.
  rpc ResolveLabels(ResolveLabelsRequest) returns (ResolveLabelsResponse);
```

Рядом с `ResolveUserLoginsResponse` добавить:

```proto
// LabelRef is one id to name. kind is "role" or "permission".
message LabelRef {
  string kind = 1;
  string id = 2;
}
message ResolveLabelsRequest {
  string token = 1; // validated; its company scope is deliberately not applied
  // At most 500. A kind this service does not know is dropped rather than
  // refused, so a rolling deploy cannot blank a whole page of labels.
  repeated LabelRef refs = 2;
}
message ResolveLabelsResponse {
  // Keyed "<kind>:<id>". Refs that match nothing are absent — the journal
  // remembers roles that have since been deleted.
  map<string, string> labels = 1;
}
```

- [ ] **Step 2: Сгенерировать Go-код из proto**

Run: `cd backend && make proto-gen`
Expected: в `backend/proto/gen/go/rosneft/auth/v1/` появляются `LabelRef`, `ResolveLabelsRequest`, `ResolveLabelsResponse`.

Проверка: `cd backend/proto && GOWORK=off go build ./...`

- [ ] **Step 3: Написать падающий тест сервиса**

Создать `backend/services/auth-service/internal/service/roles/resolve_labels_test.go`:

```go
package roles_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles/mocks"
)

// ResolveLabels называет роли и права для журнала аудита: связующие таблицы
// user_roles и role_permissions не хранят ничего, кроме двух uuid.

const (
	roleID = "9b75ebfc-141b-448e-ad63-97fe7ca6fa47"
	permID = "3f01a2c8-0d44-4b0e-9d1a-1c2b3d4e5f60"
)

type ResolveLabelsSuite struct {
	suite.Suite
	store  *mocks.StoreMock
	perms  *mocks.PermsMock
	actors *mocks.ActorsMock
	svc    *roles.Service
	ctx    context.Context
}

func TestResolveLabelsSuite(t *testing.T) {
	suite.Run(t, new(ResolveLabelsSuite))
}

func (s *ResolveLabelsSuite) SetupTest() {
	ctrl := minimock.NewController(s.T())
	s.store = mocks.NewStoreMock(ctrl)
	s.perms = mocks.NewPermsMock(ctrl)
	s.actors = mocks.NewActorsMock(ctrl)
	s.svc = roles.New(s.store, s.perms, s.actors)
	s.ctx = s.T().Context()
}

func (s *ResolveLabelsSuite) TestEmptyListSkipsTheStore() {
	got, err := s.svc.ResolveLabels(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ResolveLabelsSuite) TestRefsAreGroupedByKindAndDeduplicated() {
	var seen map[string][]string
	s.store.ResolveLabelsMock.Set(
		func(_ context.Context, byKind map[string][]string) (map[string]string, error) {
			seen = byKind
			return map[string]string{}, nil
		})

	_, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "role", ID: roleID},
		{Kind: "role", ID: roleID},
		{Kind: "permission", ID: permID},
	})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), seen["role"], []string{roleID})
	assert.DeepEqual(s.T(), seen["permission"], []string{permID})
}

func (s *ResolveLabelsSuite) TestMalformedIdIsRefused() {
	// Не про SQLSTATE — запрос сравнивает id::text и переживёт мусор. Про ответ:
	// невалидный id молча не совпал бы ни с чем и прочитался как «роль удалена»,
	// а это другой факт, чем «вы прислали ерунду».
	_, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{{Kind: "role", ID: "not-a-uuid"}})

	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ResolveLabelsSuite) TestUnknownKindAndBlankIdAreDropped() {
	got, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "wormhole", ID: roleID},
		{Kind: "role", ID: ""},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ResolveLabelsSuite) TestOversizedRequestIsRefused() {
	refs := make([]domain.LabelRef, 501)
	for i := range refs {
		refs[i] = domain.LabelRef{Kind: "role", ID: roleID}
	}

	_, err := s.svc.ResolveLabels(s.ctx, refs)

	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ResolveLabelsSuite) TestUnknownIdIsOmittedNotAnError() {
	s.store.ResolveLabelsMock.Return(map[string]string{"role:" + roleID: "Редактор"}, nil)

	got, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "role", ID: roleID},
		{Kind: "role", ID: permID},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got["role:"+roleID], "Редактор")
	assert.Equal(s.T(), got["role:"+permID], "")
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он падает**

Run: `cd backend/services/auth-service && go test ./internal/service/roles/ -run TestResolveLabelsSuite`
Expected: FAIL — `undefined: domain.LabelRef`, `s.svc.ResolveLabels undefined`, `s.store.ResolveLabelsMock undefined`.

- [ ] **Step 5: Добавить доменный тип**

Создать `backend/services/auth-service/internal/domain/label_ref.go`:

```go
package domain

// LabelRef is one id the audit journal wants named, with the kind of row it
// points at. Roles and permissions are addressed by slug everywhere else in
// this service; the journal is the one caller that only has the uuid.
type LabelRef struct {
	Kind string
	ID   string
}
```

- [ ] **Step 6: Расширить интерфейс Store и перегенерировать моки**

В `backend/services/auth-service/internal/service/roles/roles.go`, в конец интерфейса `Store`:

```go
	// Ключ результата — "<kind>:<uuid>". Единственный метод здесь, который
	// адресует роль по id, а не по слагу: у журнала другого ключа нет.
	ResolveLabels(ctx context.Context, byKind map[string][]string) (map[string]string, error)
```

Run: `cd backend/services/auth-service && go generate ./internal/service/roles/`
Expected: `internal/service/roles/mocks/` пересобран, есть `StoreMock.ResolveLabelsMock`.

- [ ] **Step 7: Реализовать слой сервиса**

Создать `backend/services/auth-service/internal/service/roles/resolve_labels.go`:

```go
package roles

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// resolveLabelsCap bounds one request. Without it this call is a way to dump
// every role in the database one page at a time.
const resolveLabelsCap = 500

// labelKinds is what this service can name. A kind outside it is dropped rather
// than refused: during a rolling deploy a newer gateway may ask for one, and
// refusing would cost the reader every other label on the page.
var labelKinds = map[string]struct{}{
	"role":       {},
	"permission": {},
}

// ResolveLabels names roles and permissions for the audit journal.
//
// It applies no company scope, exactly as ResolveUserLogins does not: the ids
// come from entries the journal's own scope already let through, so a title
// next to a visible uuid discloses nothing new. They arrive from a row
// snapshot, never from a user-supplied parameter, so no one can fish for a
// stranger's uuid through this path. The size cap stands in for the scope.
//
// An id that matches nothing is absent from the result: the journal is
// append-only and remembers deleted roles, so the caller falls back to the uuid.
func (s *Service) ResolveLabels(ctx context.Context, refs []domain.LabelRef) (map[string]string, error) {
	if len(refs) == 0 {
		return map[string]string{}, nil
	}
	if len(refs) > resolveLabelsCap {
		return nil, fmt.Errorf("roles.ResolveLabels: %w: at most %d refs per call",
			domain.ErrInvalidInput, resolveLabelsCap)
	}

	byKind := make(map[string][]string, len(labelKinds))
	seen := make(map[string]struct{}, len(refs))
	for _, ref := range refs {
		if ref.ID == "" {
			continue
		}
		if _, ok := labelKinds[ref.Kind]; !ok {
			continue
		}
		// Отвергается здесь, а не в запросе. Запрос сравнивает id::text и мусор
		// переживёт — дело в ответе: невалидный id молча не совпал бы ни с чем и
		// прочитался бы как «роль удалена», а это другой факт.
		if uuid.Validate(ref.ID) != nil {
			return nil, fmt.Errorf("roles.ResolveLabels: %w: id must be a uuid",
				domain.ErrInvalidInput)
		}
		key := ref.Kind + ":" + ref.ID
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		byKind[ref.Kind] = append(byKind[ref.Kind], ref.ID)
	}
	if len(byKind) == 0 {
		return map[string]string{}, nil
	}
	return s.store.ResolveLabels(ctx, byKind)
}
```

- [ ] **Step 8: Запустить тест и убедиться, что он проходит**

Run: `cd backend/services/auth-service && go test ./internal/service/roles/ -run TestResolveLabelsSuite -v`
Expected: PASS, шесть тестов.

- [ ] **Step 9: Реализовать хранилище**

Создать `backend/services/auth-service/internal/storage/roles/resolve_labels.go`:

```go
package roles

import (
	"context"
	"fmt"
)

// labelQueries is the per-kind lookup. A role's label is its title, which is
// what a human named it; the slug is the fallback for a row whose title was
// never filled in. A permission has no title — its slug (`audit:read`) is the
// name people use for it.
//
// The comparison casts id to text rather than the parameter to uuid[]: pgx
// would have to infer the array's element type, and a text[] compared against a
// uuid column is exactly the cast that fails with SQLSTATE 22P02.
var labelQueries = map[string]string{
	"role":       `SELECT id::text, COALESCE(NULLIF(title, ''), slug) FROM roles WHERE id::text = ANY($1)`,
	"permission": `SELECT id::text, slug FROM permissions WHERE id::text = ANY($1)`,
}

// ResolveLabels names ids per kind, keyed "<kind>:<uuid>". The service has
// already validated every id and dropped kinds this map does not carry.
func (s *Store) ResolveLabels(ctx context.Context, byKind map[string][]string) (map[string]string, error) {
	out := make(map[string]string)
	for kind, ids := range byKind {
		q, ok := labelQueries[kind]
		if !ok {
			continue
		}
		if err := s.collectLabels(ctx, out, kind, q, ids); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *Store) collectLabels(ctx context.Context, out map[string]string, kind, q string, ids []string) error {
	rows, err := s.pool.Query(ctx, q, ids)
	if err != nil {
		return fmt.Errorf("roles.ResolveLabels(%s): %w", kind, err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, label string
		if err := rows.Scan(&id, &label); err != nil {
			return fmt.Errorf("roles.ResolveLabels(%s): scan: %w", kind, err)
		}
		out[kind+":"+id] = label
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("roles.ResolveLabels(%s): rows: %w", kind, err)
	}
	return nil
}
```

- [ ] **Step 10: Реализовать gRPC-обвязку**

В `backend/services/auth-service/internal/transport/grpcapi/server.go` добавить в интерфейс `RolesSvc`:

```go
	// No actorID or scope: this one names ids the caller already sees.
	ResolveLabels(ctx context.Context, refs []domain.LabelRef) (map[string]string, error)
```

Создать `backend/services/auth-service/internal/transport/grpcapi/resolve_labels.go`:

```go
package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// ResolveLabels names roles and permissions for the audit journal. The token is
// validated so the call needs a real session rather than only network reach;
// its company scope is deliberately not applied, as on ResolveUserLogins.
func (s *Server) ResolveLabels(
	ctx context.Context, req *authv1.ResolveLabelsRequest,
) (*authv1.ResolveLabelsResponse, error) {
	if _, _, _, err := s.roleActor(ctx, req.GetToken()); err != nil {
		return nil, mapError(err)
	}
	refs := make([]domain.LabelRef, 0, len(req.GetRefs()))
	for _, r := range req.GetRefs() {
		refs = append(refs, domain.LabelRef{Kind: r.GetKind(), ID: r.GetId()})
	}
	labels, err := s.roles.ResolveLabels(ctx, refs)
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.ResolveLabelsResponse{Labels: labels}, nil
}
```

- [ ] **Step 11: Прогнать проверки модуля**

Run: `cd backend/services/auth-service && GOWORK=off go build ./... && go test ./... && golangci-lint run ./...`
Expected: сборка проходит, тесты зелёные, 0 issues.

- [ ] **Step 12: Коммит**

```bash
git add backend/proto backend/services/auth-service
git commit -m "feat(auth): ResolveLabels names roles and permissions by uuid"
```

---

## Task 3: gateway — клиенты обоих резолверов

**Files:**
- Create: `backend/services/gateway-service/internal/clients/catalog/resolve_labels.go`
- Create: `backend/services/gateway-service/internal/clients/auth/resolve_labels.go`
- Modify: `backend/services/gateway-service/internal/service/gateway.go` (интерфейсы `Catalog`, `Auth`)

**Interfaces:**
- Consumes: gRPC `CatalogService.ResolveLabels` (Task 1), `AuthService.ResolveLabels` (Task 2).
- Produces: `Catalog.ResolveLabels(ctx, refs []domain.LabelRef) (map[string]string, error)` и `Auth.ResolveLabels(ctx, token string, refs []domain.LabelRef) (map[string]string, error)` на интерфейсах сервисного слоя gateway; `domain.LabelRef{Kind, ID string}` в домене gateway — **id строковый в обоих случаях**, потому что словарь страницы плоский и значение снимка приходит как текст.

- [ ] **Step 1: Добавить доменный тип gateway**

Создать `backend/services/gateway-service/internal/domain/label_ref.go`:

```go
package domain

// LabelRef is one value from a row snapshot the journal wants named.
//
// ID is a string for both sides: catalog ids are numbers and auth ids are
// uuids, but the page dictionary is flat and keyed by the snapshot's own text,
// so converting once at the client edge is cheaper than carrying two shapes
// through the service layer.
type LabelRef struct {
	Kind string
	ID   string
}
```

- [ ] **Step 2: Реализовать клиент catalog**

Создать `backend/services/gateway-service/internal/clients/catalog/resolve_labels.go`:

```go
package catalog

import (
	"context"
	"fmt"
	"strconv"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ResolveLabels names territory, model and panorama ids for the audit journal.
//
// A ref whose id is not a number is dropped here rather than sent: catalog ids
// are BIGSERIAL, so a non-numeric value means the snapshot held something other
// than an id, and the far side would only drop it after a round trip.
func (c *Client) ResolveLabels(ctx context.Context, refs []domain.LabelRef) (map[string]string, error) {
	out := make([]*catalogv1.LabelRef, 0, len(refs))
	for _, r := range refs {
		id, err := strconv.ParseInt(r.ID, 10, 64)
		if err != nil {
			continue
		}
		out = append(out, &catalogv1.LabelRef{Kind: r.Kind, Id: id})
	}
	if len(out) == 0 {
		return map[string]string{}, nil
	}
	resp, err := c.cc.ResolveLabels(ctx, &catalogv1.ResolveLabelsRequest{Refs: out})
	if err != nil {
		return nil, fmt.Errorf("catalog.ResolveLabels: %w", grpcerr.MapStatus(err, nil))
	}
	return resp.GetLabels(), nil
}
```

- [ ] **Step 3: Реализовать клиент auth**

Создать `backend/services/gateway-service/internal/clients/auth/resolve_labels.go`:

```go
package auth

import (
	"context"
	"fmt"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ResolveLabels names role and permission ids for the audit journal.
func (c *Client) ResolveLabels(
	ctx context.Context, token string, refs []domain.LabelRef,
) (map[string]string, error) {
	if len(refs) == 0 {
		return map[string]string{}, nil
	}
	out := make([]*authv1.LabelRef, 0, len(refs))
	for _, r := range refs {
		out = append(out, &authv1.LabelRef{Kind: r.Kind, Id: r.ID})
	}
	resp, err := c.cc.ResolveLabels(ctx, &authv1.ResolveLabelsRequest{Token: token, Refs: out})
	if err != nil {
		return nil, fmt.Errorf("auth.ResolveLabels: %w", grpcerr.MapStatus(err, nil))
	}
	return resp.GetLabels(), nil
}
```

- [ ] **Step 4: Расширить интерфейсы сервисного слоя и перегенерировать моки**

В `backend/services/gateway-service/internal/service/gateway.go`, в интерфейс `Catalog` под `ResolveTerritorySlugs`:

```go
	ResolveLabels(ctx context.Context, refs []domain.LabelRef) (map[string]string, error)
```

В интерфейс `Auth` (и поправить его комментарий — методов там теперь два):

```go
// Auth is the auth client surface this service calls. The gateway's user
// administration goes through authhttp; what the service layer needs from auth
// is turning the ids in a journal entry into names.
type Auth interface {
	ResolveUserLogins(ctx context.Context, token string, ids []string) (map[string]string, error)
	ResolveLabels(ctx context.Context, token string, refs []domain.LabelRef) (map[string]string, error)
}
```

Run: `cd backend/services/gateway-service && go generate ./internal/service/`
Expected: `internal/service/mocks/` содержит `CatalogMock.ResolveLabelsMock` и `AuthMock.ResolveLabelsMock`.

- [ ] **Step 5: Проверить сборку**

Run: `cd backend/services/gateway-service && GOWORK=off go build ./... && go test ./... && golangci-lint run ./...`
Expected: сборка проходит, существующие тесты зелёные, 0 issues.

- [ ] **Step 6: Коммит**

```bash
git add backend/services/gateway-service
git commit -m "feat(gateway): clients for the catalog and auth label resolvers"
```

---

## Task 4: gateway — таблица полей и сбор ссылок из снимка

Чистая логика, без сети и моков. Отдельная задача, потому что именно здесь живёт вся правда о том, какое поле что означает.

**Files:**
- Create: `backend/services/gateway-service/internal/service/audit_ref_fields.go`
- Test: `backend/services/gateway-service/internal/service/audit_ref_fields_test.go`

**Interfaces:**
- Consumes: `domain.AuditEntry` (уже есть), `domain.LabelRef` (Task 3).
- Produces: `collectRefs(entries []domain.AuditEntry) []domain.LabelRef` и `refKey(field, value string) string` — обе пакетные, невыгружаемые наружу.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/services/gateway-service/internal/service/audit_ref_fields_test.go`:

```go
package service

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// collectRefs вынимает из снимков значения полей-ссылок. Тест внутри пакета:
// функция не экспортируется, потому что её единственный потребитель —
// resolveRowRefs двумя файлами дальше.

func TestCollectRefsReadsBothSnapshots(t *testing.T) {
	// Изменённому полю нужны подписи обоих значений, иначе стрелка «было →
	// стало» показывает одну сторону расшифрованной, а другую нет.
	entries := []domain.AuditEntry{{
		Entity: "user_role",
		OldRow: `{"user_id":"u-1","role_id":"r-old"}`,
		NewRow: `{"user_id":"u-1","role_id":"r-new"}`,
	}}

	got := collectRefs(entries)

	assert.Assert(t, hasRef(got, "role", "r-old"))
	assert.Assert(t, hasRef(got, "role", "r-new"))
	assert.Assert(t, hasRef(got, "user", "u-1"))
}

func TestCollectRefsIgnoresEntitiesWithoutRefFields(t *testing.T) {
	// Страница пользовательских событий не должна платить за разбор JSON.
	entries := []domain.AuditEntry{{
		Entity: "user",
		NewRow: `{"id":"u-1","email":"a@b.c","username":"ivan"}`,
	}}

	assert.Equal(t, len(collectRefs(entries)), 0)
}

func TestCollectRefsExpandsArrayValues(t *testing.T) {
	// placements.visible_panorama_ids — массив; подпись нужна каждому элементу.
	entries := []domain.AuditEntry{{
		Entity: "placement",
		NewRow: `{"territory_id":12,"model_id":7,"visible_panorama_ids":[2,5]}`,
	}}

	got := collectRefs(entries)

	assert.Assert(t, hasRef(got, "territory", "12"))
	assert.Assert(t, hasRef(got, "model", "7"))
	assert.Assert(t, hasRef(got, "panorama", "2"))
	assert.Assert(t, hasRef(got, "panorama", "5"))
}

func TestCollectRefsSurvivesBrokenSnapshot(t *testing.T) {
	// Сломанный снимок не должен стоить читателю всей страницы.
	entries := []domain.AuditEntry{
		{Entity: "placement", NewRow: `{ this is not json`},
		{Entity: "placement", NewRow: `{"model_id":7}`},
	}

	got := collectRefs(entries)

	assert.Assert(t, hasRef(got, "model", "7"))
}

func TestCollectRefsSkipsNullAndZero(t *testing.T) {
	// null — «связи нет», ноль — «поля не было»; ни то ни другое не строка.
	entries := []domain.AuditEntry{{
		Entity: "placement",
		NewRow: `{"model_id":null,"territory_id":0}`,
	}}

	assert.Equal(t, len(collectRefs(entries)), 0)
}

func TestRefKeyJoinsFieldAndValue(t *testing.T) {
	assert.Equal(t, refKey("role_id", "r-1"), "role_id:r-1")
}

func hasRef(refs []domain.LabelRef, kind, id string) bool {
	for _, r := range refs {
		if r.Kind == kind && r.ID == id {
			return true
		}
	}
	return false
}
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd backend/services/gateway-service && go test ./internal/service/ -run 'TestCollectRefs|TestRefKey'`
Expected: FAIL — `undefined: collectRefs`, `undefined: refKey`.

- [ ] **Step 3: Реализовать таблицу и сбор**

Создать `backend/services/gateway-service/internal/service/audit_ref_fields.go`:

```go
package service

import (
	"encoding/json"
	"strconv"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// refFields is the single source of truth for which snapshot column holds a
// reference and to what.
//
// The client never gets a copy: the page dictionary is keyed "field:value", and
// because no column name means two different kinds across the ten audited
// tables, the field name alone carries the kind. That is deliberate — the
// entity list in frontend/src/audit/domain/vocabulary.ts is the same idea
// duplicated onto the client, and it silently drifted out of step with the
// triggers. If a future table ever introduces a column whose name means a
// different kind, this map is where it has to be noticed.
var refFields = map[string]map[string]string{
	"user_role":            {"user_id": "user", "role_id": "role"},
	"role_permission":      {"role_id": "role", "permission_id": "permission"},
	"territory_assignment": {"territory_id": "territory", "admin_user_id": "user"},
	"placement": {
		"territory_id":         "territory",
		"model_id":             "model",
		"visible_panorama_ids": "panorama",
	},
	"panorama": {"territory_id": "territory"},
	"document": {"territory_id": "territory"},
}

// refKey is the dictionary key the client rebuilds from the field name and the
// raw value it is about to render.
func refKey(field, value string) string {
	return field + ":" + value
}

// collectRefs gathers every referenced id on a page, from both snapshots.
//
// Both, not just the newer one: a changed field needs a label on each side of
// the arrow, and labelling only the new value would leave half the diff opaque.
func collectRefs(entries []domain.AuditEntry) []domain.LabelRef {
	var out []domain.LabelRef
	seen := make(map[string]struct{})

	for _, e := range entries {
		fields, ok := refFields[e.Entity]
		if !ok {
			// Checked before parsing: a page of user or session events carries
			// no references and must not pay for a JSON decode.
			continue
		}
		for _, raw := range []string{e.OldRow, e.NewRow} {
			collectRowRefs(raw, fields, seen, &out)
		}
	}
	return out
}

func collectRowRefs(raw string, fields map[string]string, seen map[string]struct{}, out *[]domain.LabelRef) {
	if raw == "" {
		return
	}
	var row map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &row); err != nil {
		// A broken snapshot costs its own labels, never the page's.
		return
	}
	for field, kind := range fields {
		val, ok := row[field]
		if !ok {
			continue
		}
		for _, id := range refValues(val) {
			key := kind + ":" + id
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			*out = append(*out, domain.LabelRef{Kind: kind, ID: id})
		}
	}
}

// refValues turns one column value into the ids inside it. A column is either a
// scalar id or an array of them (placements.visible_panorama_ids).
func refValues(val json.RawMessage) []string {
	if id, ok := refScalar(val); ok {
		return []string{id}
	}
	var list []json.RawMessage
	if err := json.Unmarshal(val, &list); err != nil {
		return nil
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		if id, ok := refScalar(item); ok {
			out = append(out, id)
		}
	}
	return out
}

// refScalar reads one id, whether the column is a uuid string or a bigint.
// null means "no link" and 0 means "the column was absent"; neither is an id.
func refScalar(val json.RawMessage) (string, bool) {
	var s string
	if err := json.Unmarshal(val, &s); err == nil {
		return s, s != ""
	}
	var n int64
	if err := json.Unmarshal(val, &n); err == nil {
		return strconv.FormatInt(n, 10), n > 0
	}
	return "", false
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `cd backend/services/gateway-service && go test ./internal/service/ -run 'TestCollectRefs|TestRefKey' -v`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add backend/services/gateway-service/internal/service/audit_ref_fields.go \
        backend/services/gateway-service/internal/service/audit_ref_fields_test.go
git commit -m "feat(gateway): collect referenced ids out of audit row snapshots"
```

---

## Task 5: gateway — резолв словаря и флаг `wantRefs`

**Files:**
- Create: `backend/services/gateway-service/internal/service/audit_refs.go`
- Test: `backend/services/gateway-service/internal/service/audit_refs_test.go`
- Modify: `backend/services/gateway-service/internal/service/audit.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit_csv.go`

**Interfaces:**
- Consumes: `collectRefs`, `refKey` (Task 4); `Catalog.ResolveLabels`, `Auth.ResolveLabels` (Task 3).
- Produces: `Gateway.ListAudit(ctx, q domain.AuditQuery, isOwner bool, companyID, token string, wantRefs bool) ([]domain.AuditEntry, int64, map[string]string, error)` — четвёртым значением идёт словарь, ключ `"поле:значение"`, при `wantRefs=false` он `nil`.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/services/gateway-service/internal/service/audit_refs_test.go`:

```go
package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

// Словарь подписей к идентификаторам внутри снимков. Ключ — "поле:значение",
// потому что изменённому полю нужны подписи обеих сторон стрелки.

type AuditRefsSuite struct {
	suite.Suite
	catalog *mocks.CatalogMock
	auth    *mocks.AuthMock
	audit   *mocks.AuditMock
	svc     *service.Gateway
	ctx     context.Context
}

func TestAuditRefsSuite(t *testing.T) {
	suite.Run(t, new(AuditRefsSuite))
}

func (s *AuditRefsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.catalog = mocks.NewCatalogMock(mc)
	s.auth = mocks.NewAuthMock(mc)
	s.audit = mocks.NewAuditMock(mc)
	s.svc = service.New(s.catalog, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), s.audit, s.auth)
	s.ctx = s.T().Context()
	// Подписи уровня записи не предмет этого теста, но ListAudit их зовёт.
	s.auth.ResolveUserLoginsMock.Return(map[string]string{}, nil)
}

func (s *AuditRefsSuite) entry() domain.AuditEntry {
	return domain.AuditEntry{
		Entity: "user_role",
		NewRow: `{"user_id":"u-1","role_id":"r-1"}`,
	}
}

func (s *AuditRefsSuite) TestLabelsAreKeyedByFieldAndValue() {
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveLabelsMock.Return(map[string]string{"role:r-1": "Редактор"}, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), refs["role_id:r-1"], "Редактор")
}

func (s *AuditRefsSuite) TestUnresolvedIdIsAbsentRatherThanBlank() {
	// Пустая подпись перезаписала бы id пустотой; отсутствие ключа откатывает
	// клиента к показу самого id — ровно то, что он показывал раньше.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveLabelsMock.Return(map[string]string{}, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", true)

	assert.NilError(s.T(), err)
	_, ok := refs["role_id:r-1"]
	assert.Assert(s.T(), !ok)
}

func (s *AuditRefsSuite) TestResolverFailureDoesNotFailThePage() {
	// Журнал, отвечающий 500 из-за перезапуска auth, хуже журнала с uuid.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveLabelsMock.Return(nil, errors.New("auth is restarting"))

	entries, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(entries), 1)
	assert.Equal(s.T(), len(refs), 0)
}

func (s *AuditRefsSuite) TestOneResolverFailingKeepsTheOther() {
	// Роли не разрешились — модели всё равно должны быть подписаны.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{{
		Entity: "placement",
		NewRow: `{"model_id":7}`,
	}}, 0, nil)
	s.catalog.ResolveLabelsMock.Return(map[string]string{"model:7": "pump-01"}, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), refs["model_id:7"], "pump-01")
}

func (s *AuditRefsSuite) TestWantRefsFalseSkipsBothResolvers() {
	// Экспорт CSV снимков не печатает; моки без ожиданий провалят тест, если
	// резолверы всё же позовут.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", false)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), refs == nil)
}
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd backend/services/gateway-service && go test ./internal/service/ -run TestAuditRefsSuite`
Expected: FAIL — `ListAudit` принимает 5 аргументов и возвращает 3 значения, а тест ждёт 6 и 4.

- [ ] **Step 3: Реализовать резолв словаря**

Создать `backend/services/gateway-service/internal/service/audit_refs.go`:

```go
package service

import (
	"context"
	"log/slog"
	"sync"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// authKinds is which side of the fence a kind lives on. Everything else that
// refFields can produce belongs to catalog.
var authKinds = map[string]struct{}{
	"role":       {},
	"permission": {},
}

// resolveRowRefs builds the page's label dictionary, keyed "field:value".
//
// Keyed by value rather than by field because a changed field needs a label for
// both sides of the arrow. The field name carries the kind, so the client needs
// no table of its own — see refFields.
//
// One call per service per page, never one per entry. Failure is logged and
// swallowed on each side independently: a journal that answers 500 because auth
// is restarting is worse than one that answers with uuids, which is exactly
// what it answered before this existed.
func (g *Gateway) resolveRowRefs(
	ctx context.Context, token string, entries []domain.AuditEntry,
) map[string]string {
	refs := collectRefs(entries)
	if len(refs) == 0 {
		return map[string]string{}
	}

	var authRefs, catalogRefs []domain.LabelRef
	for _, r := range refs {
		if _, ok := authKinds[r.Kind]; ok {
			authRefs = append(authRefs, r)
			continue
		}
		catalogRefs = append(catalogRefs, r)
	}

	var (
		mu     sync.Mutex
		labels = make(map[string]string, len(refs))
		wg     sync.WaitGroup
	)
	collect := func(name string, call func() (map[string]string, error)) {
		wg.Go(func() {
			got, err := call()
			if err != nil {
				slog.WarnContext(ctx, "audit: could not resolve row refs", "resolver", name, "err", err)
				return
			}
			mu.Lock()
			defer mu.Unlock()
			for k, v := range got {
				labels[k] = v
			}
		})
	}
	if len(authRefs) > 0 {
		collect("auth", func() (map[string]string, error) {
			return g.auth.ResolveLabels(ctx, token, authRefs)
		})
	}
	if len(catalogRefs) > 0 {
		collect("catalog", func() (map[string]string, error) {
			return g.catalog.ResolveLabels(ctx, catalogRefs)
		})
	}
	wg.Wait()

	return keyByField(refs, labels)
}

// keyByField rewrites "<kind>:<id>" into "<field>:<id>" — the shape the client
// looks up.
//
// It walks the field table rather than the entries because one kind sits under
// more than one column name: a user is "user_id" in user_roles and
// "admin_user_id" in territory_assignments, and the client searches by the name
// it can see in the diff. Six entities against a page capped at 200 rows makes
// the sweep free.
//
// An id nobody resolved is left out entirely rather than mapped to an empty
// string: a blank label would paint over the id, and showing the id is the
// fallback.
func keyByField(refs []domain.LabelRef, labels map[string]string) map[string]string {
	out := make(map[string]string, len(labels))
	for _, fields := range refFields {
		for field, kind := range fields {
			for _, r := range refs {
				if r.Kind != kind {
					continue
				}
				if label, ok := labels[kind+":"+r.ID]; ok {
					out[refKey(field, r.ID)] = label
				}
			}
		}
	}
	return out
}
```

- [ ] **Step 4: Провести флаг через ListAudit**

В `backend/services/gateway-service/internal/service/audit.go` заменить `ListAudit` на:

```go
// ListAudit reads one page of the journal.
//
// The tenant filter is derived here from the principal, never taken from q —
// the handler fills in only the user-facing filters (actor, action, entity,
// time range, paging). Accepting a company id from the request would let one
// Company Owner read another's history.
// token is the caller's bearer, forwarded to auth so the ids in the result can
// be turned into names. It carries no authority of its own here: the tenant
// scope above is what limits the rows, and the token only proves to auth that a
// real session is asking.
// wantRefs asks for the dictionary naming the ids inside the row snapshots. The
// CSV export passes false: it prints no snapshots, and it pages the whole result
// 200 rows at a time, so it would buy a dictionary per page and throw each away.
func (g *Gateway) ListAudit(
	ctx context.Context, q domain.AuditQuery, isOwner bool, companyID, token string, wantRefs bool,
) ([]domain.AuditEntry, int64, map[string]string, error) {
	all, company, err := AuditScope(isOwner, companyID)
	if err != nil {
		return nil, 0, nil, err
	}
	q.AllCompanies = all
	q.CompanyID = company
	entries, next, err := g.audit.ListEntries(ctx, q)
	if err != nil {
		return nil, 0, nil, err
	}
	entries = g.labelAuditEntries(ctx, token, entries)
	if !wantRefs {
		return entries, next, nil, nil
	}
	return entries, next, g.resolveRowRefs(ctx, token, entries), nil
}
```

- [ ] **Step 5: Поправить оба вызова в транспорте**

В `backend/services/gateway-service/internal/transport/httpapi/audit.go` — вызов принимает `true`, но словарь пока уходит в `_`: поля для него в сгенерированном `AuditPage` ещё нет, оно появится в Task 6. Так задача остаётся собираемой сама по себе.

```go
	entries, next, _, err := s.svc.ListAudit(ctx,
		auditQueryFromParams(req.Params), authhttp.IsOwner(ctx), authhttp.AuditCompany(ctx), authhttp.Token(ctx), true)
```

В `backend/services/gateway-service/internal/transport/httpapi/audit_csv.go` — оба вызова (первый и внутри цикла) получают `false` и `_` на месте словаря:

```go
	first, next, _, err := s.svc.ListAudit(ctx, q, isOwner, company, token, false)
	…
		page, next, _, err = s.svc.ListAudit(ctx, q, isOwner, company, token, false)
```

- [ ] **Step 6: Запустить тесты и убедиться, что они проходят**

Run: `cd backend/services/gateway-service && GOWORK=off go build ./... && go test ./... && golangci-lint run ./...`
Expected: сборка проходит, тесты зелёные, 0 issues. Словарь пока никуда не отдаётся — это Task 6.

- [ ] **Step 7: Коммит**

```bash
git add backend/services/gateway-service
git commit -m "feat(gateway): resolve the labels behind ids inside row snapshots"
```

---

## Task 6: openapi — поле `refs` на странице

**Files:**
- Modify: `backend/services/gateway-service/api/openapi.yaml`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit.go` (если строки из Task 5 были закомментированы)

**Interfaces:**
- Consumes: словарь из `Gateway.ListAudit` (Task 5).
- Produces: `AuditPage.refs` — `map[string]string`, необязательное; в сгенерированном Go — `Refs *map[string]string`.

- [ ] **Step 1: Добавить поле в спецификацию**

В `backend/services/gateway-service/api/openapi.yaml`, в схему `AuditPage` после `nextCursor`:

```yaml
        refs:
          type: object
          additionalProperties:
            type: string
          description: >
            Human-readable names for the ids inside oldRow/newRow, keyed
            "<field>:<value>" — e.g. "role_id:9b75ebfc-…": "Редактор". Keyed by
            value because a changed field needs a name on both sides of the
            arrow; the field name alone carries the kind, so no client-side
            table of field kinds is needed. An id nobody could name is absent,
            and the client falls back to showing the id. Absent entirely on the
            CSV export, which prints no snapshots.
```

- [ ] **Step 2: Перегенерировать серверные стабы**

Run: `cd backend && make openapi-gen`
Expected: в сгенерированном коде `AuditPage` появляется поле `Refs *map[string]string`.

- [ ] **Step 3: Отдать словарь в ответе**

В `backend/services/gateway-service/internal/transport/httpapi/audit.go` вернуть словарю имя вместо `_`, поставленного в Task 5:

```go
	entries, next, refs, err := s.svc.ListAudit(ctx,
		auditQueryFromParams(req.Params), authhttp.IsOwner(ctx), authhttp.AuditCompany(ctx), authhttp.Token(ctx), true)
```

и рядом с заполнением `nextCursor`, перед возвратом страницы:

```go
	// Пустой словарь не отдаётся: страница без ссылок в снимках — обычное дело
	// (сессионные события, изменения заголовков), и пустой объект в каждом
	// таком ответе только раздувал бы его.
	if len(refs) > 0 {
		page.Refs = &refs
	}
```

- [ ] **Step 4: Прогнать полный бэкенд-гейт**

Run: `cd backend && make check`
Expected: `==> all checks passed`.

- [ ] **Step 5: Коммит**

```bash
git add backend/services/gateway-service
git commit -m "feat(gateway): expose the audit ref dictionary on the page response"
```

---

## Task 7: frontend — приём словаря и чистый хелпер

**Files:**
- Create: `frontend/src/audit/domain/ref-label.ts`
- Test: `frontend/src/audit/domain/ref-label.test.ts`
- Modify: `frontend/src/audit/infrastructure/audit-gateway.ts`
- Modify: `frontend/src/audit/application/use-audit-log.ts`

**Interfaces:**
- Consumes: `AuditPage.refs` из DTO (Task 6).
- Produces: `type Refs = Record<string, string>`; `labelFor(refs: Refs, field: string, value: unknown): string | null`; `AuditPage.refs` в гейтвее; `useAuditLog(...)` возвращает дополнительно `refs: Refs`.

- [ ] **Step 1: Перегенерировать DTO**

Run: `cd frontend && yarn openapi:generate`
Expected: в `src/shared/infrastructure/api/dto.ts` у `AuditPage` появляется `refs?: { [key: string]: string }`.

- [ ] **Step 2: Написать падающий тест**

Создать `frontend/src/audit/domain/ref-label.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { labelFor } from "./ref-label";

const refs = {
  "role_id:9b75ebfc-141b-448e-ad63-97fe7ca6fa47": "Редактор",
  "model_id:7": "pump-01",
};

test("находит подпись по имени поля и значению", () => {
  assert.equal(labelFor(refs, "role_id", "9b75ebfc-141b-448e-ad63-97fe7ca6fa47"), "Редактор");
});

test("число приводится к строке — снимок хранит id каталога числом", () => {
  assert.equal(labelFor(refs, "model_id", 7), "pump-01");
});

test("промах возвращает null, а не пустую строку", () => {
  // Пустая строка нарисовалась бы вместо id; null означает «показывай id».
  assert.equal(labelFor(refs, "role_id", "unknown"), null);
});

test("null и undefined подписи не имеют", () => {
  assert.equal(labelFor(refs, "model_id", null), null);
  assert.equal(labelFor(refs, "model_id", undefined), null);
});

test("объект не ключ — вложенный трансформ подписи не имеет", () => {
  assert.equal(labelFor(refs, "model_id", { x: 1 }), null);
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `cd frontend && yarn test`
Expected: FAIL — `Cannot find module './ref-label'`.

- [ ] **Step 4: Реализовать хелпер**

Создать `frontend/src/audit/domain/ref-label.ts`:

```ts
// Refs — словарь подписей к идентификаторам внутри снимков, приходящий вместе
// со страницей журнала. Ключ склеен сервером как "поле:значение": по значению,
// потому что изменённому полю нужны подписи обеих сторон стрелки, и без вида
// сущности, потому что имя поля его уже несёт. Благодаря этому клиенту не нужна
// своя таблица видов — дублировать её было бы ровно той ошибкой, из-за которой
// список сущностей в vocabulary.ts разъехался с триггерами.
export type Refs = Record<string, string>;

// labelFor возвращает подпись или null. Именно null, а не пустая строка:
// отсутствие подписи означает «рисуй сам идентификатор» — сущность могли
// удалить, а сервис подписей мог быть недоступен.
export function labelFor(refs: Refs, field: string, value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return refs[`${field}:${String(value)}`] ?? null;
}

// shortId укорачивает uuid до первых восьми символов, чтобы подпись оставалась
// прослеживаемой, но не занимала строку целиком. Числовой id возвращается как
// есть — резать «7» не от чего.
export function shortId(value: string | number): string {
  const s = String(value);
  return s.length > 12 ? s.slice(0, 8) : s;
}
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

Run: `cd frontend && yarn test`
Expected: PASS.

- [ ] **Step 6: Провести словарь через гейтвей**

В `frontend/src/audit/infrastructure/audit-gateway.ts`:

добавить импорт `import type { Refs } from "@/audit/domain/ref-label";`,

заменить тип страницы:

```ts
export type AuditPage = { entries: AuditEntry[]; nextCursor: number | null; refs: Refs };
```

и возврат в `fetchAuditPage`:

```ts
  return {
    entries: dto.entries.map(toEntry),
    nextCursor: dto.nextCursor && dto.nextCursor > 0 ? dto.nextCursor : null,
    refs: dto.refs ?? {},
  };
```

- [ ] **Step 7: Слить словари страниц в хуке**

В `frontend/src/audit/application/use-audit-log.ts` добавить в возвращаемый объект:

```ts
    // Словари страниц не конфликтуют: ключ несёт значение идентификатора, а
    // одно и то же значение везде означает одну и ту же строку.
    refs: Object.assign({}, ...(query.data?.pages.map((p) => p.refs) ?? [])) as Refs,
```

и импорт `import type { Refs } from "@/audit/domain/ref-label";`.

- [ ] **Step 8: Проверить сборку и линт**

Run: `cd frontend && yarn lint && yarn build`
Expected: без ошибок.

- [ ] **Step 9: Коммит**

```bash
git add frontend/src/audit frontend/src/shared/infrastructure/api/dto.ts
git commit -m "feat(audit): carry the ref dictionary from the page into the client"
```

---

## Task 8: frontend — отрисовка подписей в diff

**Files:**
- Modify: `frontend/src/audit/presentation/components/diff-view.tsx`
- Modify: `frontend/src/audit/presentation/components/audit-row.tsx`
- Test: `frontend/src/audit/presentation/components/audit-table.spec.tsx`

**Interfaces:**
- Consumes: `labelFor`, `shortId`, `Refs` (Task 7); `refs` из `useAuditLog` (Task 7).
- Produces: пользовательский результат — `role_id  Редактор ·9b75ebfc`.

- [ ] **Step 1: Написать падающий тест компонента**

В `frontend/src/audit/presentation/components/audit-table.spec.tsx`, внутрь существующего `describe("AuditTable", …)`, в конец. Фабрика `entry(over)`, `afterEach(cleanup)` и мок роутера в файле уже есть; jest-dom здесь не подключён, поэтому проверки — `toBeTruthy()` / `toBeNull()`, а раскрывашка ищется как `{ name: /diff/i }`:

```tsx
  const ROLE_UUID = "9b75ebfc-141b-448e-ad63-97fe7ca6fa47";

  it("names an id inside the diff and keeps a shortened id beside it", async () => {
    render(
      <AuditTable
        entries={[
          entry({
            entity: "user_role",
            action: "user_role.create",
            oldRow: null,
            newRow: { user_id: "u-1", role_id: ROLE_UUID },
          }),
        ]}
        refs={{ [`role_id:${ROLE_UUID}`]: "Редактор" }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /diff/i }));

    expect(screen.getByText("Редактор ·9b75ebfc")).toBeTruthy();
    // Полный uuid больше не занимает строку целиком.
    expect(screen.queryByText(ROLE_UUID)).toBeNull();
  });

  // Подписи может не быть: роль удалили, либо сервис подписей был недоступен.
  // Тогда показывается сам id — ровно то, что показывалось до словаря.
  it("falls back to the raw id when nothing named it", async () => {
    render(
      <AuditTable
        entries={[
          entry({ entity: "user_role", oldRow: null, newRow: { role_id: "r-unknown" } }),
        ]}
        refs={{}}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /diff/i }));

    expect(screen.getByText("r-unknown")).toBeTruthy();
  });
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd frontend && yarn test:spa`
Expected: FAIL — `AuditTable` не принимает `refs`, подпись не отрисована.

- [ ] **Step 3: Провести refs до DiffView**

Проп **необязательный, со значением `{}` по умолчанию**: пять уже зелёных тестов в этом же файле рендерят `<AuditTable entries={…} />` без него, и обязательный проп сломал бы их компиляцию. Пустой словарь — это и есть штатное «подписей нет», в котором diff ведёт себя как до задачи.

`audit-table.tsx`:

```tsx
export default function AuditTable({
  entries,
  refs = {},
}: {
  entries: AuditEntry[];
  refs?: Refs;
}) {
```

и вниз по строке: `<AuditRow key={e.id} entry={e} refs={refs} />`.

`audit-row.tsx`:

```tsx
export default function AuditRow({ entry, refs = {} }: { entry: AuditEntry; refs?: Refs }) {
```

и в месте отрисовки — `<DiffView oldRow={entry.oldRow} newRow={entry.newRow} refs={refs} />`.

В обоих файлах добавить `import type { Refs } from "@/audit/domain/ref-label";`.

В `audit-panel.tsx` взять `refs` из `useAuditLog` и передать в таблицу: `<AuditTable entries={entries} refs={refs} />`.

- [ ] **Step 4: Отрисовать подписи**

В `frontend/src/audit/presentation/components/diff-view.tsx` заменить `render` и сигнатуру компонента:

```tsx
import { diffRows, type DiffField } from "@/audit/domain/diff";
import { labelFor, shortId, type Refs } from "@/audit/domain/ref-label";

// Снимки хранят сырые значения колонок; всё, что не скаляр, рисуется как JSON,
// чтобы вложенный трансформ остался читаемым, а не схлопнулся в [object Object].
// Значение, за которым сервер прислал подпись, показывается подписью с
// укороченным id рядом: имя видно сразу, прослеживаемость до строки не теряется.
function render(refs: Refs, field: string, value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => render(refs, field, item)).join(", ")}]`;
  }
  const label = labelFor(refs, field, value);
  if (label) return `${label} ·${shortId(value as string | number)}`;
  if (typeof value === "string") return value === "" ? '""' : value;
  return JSON.stringify(value);
}
```

и во всех четырёх местах отрисовки заменить `render(f.after)` / `render(f.before)` на `render(refs, f.field, f.after)` / `render(refs, f.field, f.before)`. Пропсы компонента:

```tsx
export default function DiffView({
  oldRow,
  newRow,
  refs = {},
}: {
  oldRow: Record<string, unknown> | null;
  newRow: Record<string, unknown> | null;
  refs?: Refs;
}) {
  const fields = diffRows(oldRow, newRow);
```

Массив рекурсивно уходит в тот же `render` с тем же именем поля — у `visible_panorama_ids` вид один на все элементы, так что ключ строится по каждому значению отдельно.

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

Run: `cd frontend && yarn test:spa`
Expected: PASS.

- [ ] **Step 6: Проверить размер файла**

Run: `cd frontend && yarn lint`
Expected: 0 ошибок, в том числе `max-lines` — `diff-view.tsx` должен остаться заметно ниже 200 строк.

- [ ] **Step 7: Прогнать всё**

Run: `cd frontend && yarn test && yarn test:spa && yarn lint && yarn build`
Run: `cd backend && make check`
Expected: всё зелёное.

- [ ] **Step 8: Коммит**

```bash
git add frontend/src/audit
git commit -m "feat(audit): render ref labels beside shortened ids in the diff"
```

---

## Ручная проверка после Task 8

1. `cd backend && make compose-up`, фронтенд — `cd frontend && yarn dev --port 3000`.
2. Зайти Root'ом, назначить любому пользователю роль (Админка → Пользователи → роли).
3. Открыть журнал аудита, развернуть запись `user_role.create`.
4. Ожидается `user_id  ivan.petrov ·3f01a2c8` и `role_id  Редактор ·9b75ebfc` вместо двух голых uuid.
5. Изменить трансформ размещения и проверить `placement.update`: `territory_id` и `model_id` со слагами.
6. Выгрузить CSV и убедиться, что в нём по-прежнему 11 колонок и он не стал медленнее.
