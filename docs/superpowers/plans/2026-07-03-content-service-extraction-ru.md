# План внедрения: выделение `content-service`

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ САБ-НАВЫК: используйте superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans, чтобы выполнять план задача за задачей. Шаги размечены чекбоксами (`- [ ]`) для отслеживания.

**Цель:** вынести концерны `documents` и `panoramas` из `catalog-service` в новый самостоятельный `content-service`, повторяя шаблон `twofa-service`, при этом публичный REST API и фронтенд остаются без изменений.

**Архитектура:** новый gRPC-сервис `content-service` на порту `:9007` владеет таблицами `territory_documents` и `panoramas` в **общей БД `andrey` (Postgres)** (изоляция через собственную goose-таблицу `content_goose_db_version` — тот же приём, что и в twofa). Таблицы **не** пересоздаются и не копируются; content-service читает и пишет существующие таблицы на месте, поэтому каскад `ON DELETE CASCADE` от `territories` продолжает работать сам собой. Шлюз получает gRPC-клиент `Content` и перенаправляет на него свой уже разбитый по концернам код documents/panoramas/scene-bundle. Каталог теряет соответствующие 7 RPC.

**Технологический стек:** Go 1.26, gRPC + protobuf (buf), pgx/v5, goose, cobra+viper, testify/suite + gotest.tools/v3 + minimock/v3, Docker Compose.

## Глобальные ограничения

- **Go 1.26**; современные идиомы согласно backend CLAUDE.md (`t.Context()`, `wg.Go`, `errors.AsType`, `for i := range n`, `omitzero`, пакеты `slices`/`maps`, `new(val)`).
- **Лимит размера файла: 200 строк** (без учёта пустых строк/комментариев), один концерн на файл. Никаких god-файлов.
- **Никакого бренд-слова** в любом отображаемом тексте или логах: используем «Andrey», никогда «Rosneft»/«Роснефть». Строчное `rosneft` в путях модулей — структурное, остаётся.
- **Тесты:** `testify/suite` + `gotest.tools/v3/assert` (`assert.X(s.T(), …)`, не `s.Equal`) + `minimock/v3`. Контроллер строится в `SetupTest` через `minimock.NewController(s.T())`. Для errgroup/производного ctx — `minimock.AnyContext`. Пакет `mocks/` исключён из линта через `//go:generate minimock -i <Ifaces> -o ./mocks -s _mock.go`.
- **Корень пути модуля:** `github.com/vbncursed/rosneft/backend/...`.
- **Алиас импорта сгенерированного proto:** `contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"`.
- **Префикс переменных окружения:** `CONTENT_*`. **Порт gRPC:** `:9007`.
- Доменные sentinel-ошибки живут в `domain/errors.go`; транспорт мапит их в gRPC `codes.*`.

## Соглашение «перенести vs создать» (прочитать перед стартом)

Большинство файлов **переносятся** из каталога с механическими правками, а не пишутся заново. Для переносимого файла изменение полностью задаётся: путь-источник → путь-назначение + точные строковые замены. Применяйте замены редактором; не перепечатывайте тела вручную. **Новые** файлы (proto, обвязка bootstrap, config, интерфейс `Content` шлюза, compose/Dockerfile) приведены с полным содержимым.

Стандартная замена для каждого файла, переносимого в `content-service`:
- импорт `.../catalog-service/internal/domain` → `.../content-service/internal/domain`
- импорт `.../catalog-service/internal/...` → `.../content-service/internal/...`
- ссылки на ресивер/тип остаются как есть, если задача не указывает иное.

---

## Задача 1: `content.proto` + генерация кода

**Файлы:**
- Создать: `backend/proto/rosneft/content/v1/content.proto`
- Генерируется (buf): `backend/proto/gen/go/rosneft/content/v1/*.pb.go`

**Интерфейсы:**
- Производит: `contentv1.ContentServiceServer`, `contentv1.ContentServiceClient`, сообщения `Document`, `Panorama`, `Vec3` и 7 пар запрос/ответ. Потребляется всеми последующими задачами.

- [ ] **Шаг 1: создать proto-файл**

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

- [ ] **Шаг 2: сгенерировать**

Выполнить: `cd backend && make proto-gen`
Ожидается: код возврата 0; новая директория `backend/proto/gen/go/rosneft/content/v1/` с `content.pb.go` и `content_grpc.pb.go`.

- [ ] **Шаг 3: проверить компиляцию сгенерированных стабов**

Выполнить: `cd backend/proto && go build ./...`
Ожидается: код 0, без вывода.

- [ ] **Шаг 4: коммит**

```bash
git add backend/proto/rosneft/content backend/proto/gen/go/rosneft/content
git commit -m "feat(proto): add content.v1 ContentService (documents + panoramas)"
```

---

## Задача 2: скелет модуля content-service (модуль, config, domain, migrate)

**Файлы:**
- Создать: `backend/services/content-service/go.mod`
- Создать: `backend/services/content-service/internal/config/config.go`
- Создать: `backend/services/content-service/internal/domain/{vec3.go,document.go,panorama.go,errors.go}`
- Создать: `backend/services/content-service/internal/migrate/{migrate.go,up.go,down.go,status.go}`
- Создать: `backend/services/content-service/internal/migrate/migrations/00001_init.sql`
- Изменить: `backend/go.work`

**Интерфейсы:**
- Производит: `config.Config` (поля `GRPCAddr`, `DBDSN`, `LogLevel`, `LogFormat`, `AutoMigrate`, `ShutdownTimeout`), `config.Load(cmd)`, `config.Config.Validate()`; `migrate.Up/Down/Status(ctx, dsn)`; доменные типы `Vec3`, `Document`, `Panorama` и sentinel-ошибки `ErrInvalidInput`, `ErrNotFound`, `ErrTerritoryNotFound`.

- [ ] **Шаг 1: создать `go.mod`**

`backend/services/content-service/go.mod` — скопировать `backend/services/twofa-service/go.mod`, заменить строку module на:
```
module github.com/vbncursed/rosneft/backend/services/content-service
```
Убрать require для `redis`, если он есть (content не нужен Redis); оставить pkg pgx, goose, cobra, viper, grpc, testify, gotest.tools, minimock и зависимости `pkg`/`proto`. (Зависимости разрешаются через `go.work`; `go mod tidy` на более позднем шаге зафиксирует точный набор.)

- [ ] **Шаг 2: добавить модуль в `go.work`**

Изменить `backend/go.work` — добавить внутрь `use (`, сохраняя алфавитный порядок после `./services/catalog-service`:
```
	./services/content-service
```

- [ ] **Шаг 3: создать `config.go`**

`backend/services/content-service/internal/config/config.go` — взять за основу `twofa-service/internal/config/config.go` и сократить до полей, нужных content:

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

- [ ] **Шаг 4: создать доменные файлы**

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

`backend/services/content-service/internal/domain/document.go` — перенести `catalog-service/internal/domain/document.go` дословно (меняется только заголовок `package domain`, если требуется; там уже `package domain`).

`backend/services/content-service/internal/domain/panorama.go` — перенести `catalog-service/internal/domain/panorama.go` дословно.

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
> Примечание: скопируйте точные имена/тексты sentinel-ошибок из `catalog-service/internal/domain/errors.go` для `ErrInvalidInput`, `ErrNotFound`, `ErrTerritoryNotFound`. Если в каталоге они названы иначе — повторите написание каталога, чтобы перенесённые файлы storage/service компилировались без изменений.

- [ ] **Шаг 5: создать пакет migrate**

Перенести `twofa-service/internal/migrate/{migrate.go,up.go,down.go,status.go}` в `content-service/internal/migrate/` с заменами. В `migrate.go` изменить строку имени goose-таблицы версий:
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
> `ponytail:` голое `territories(id, slug)` через create-if-not-exists — это подстраховка только для случая свежей БД; на реальной общей БД более полная `territories` каталога уже существует, и это no-op. Оно нужно, чтобы content-service мог мигрировать автономно в тестах/CI. Не добавляйте сюда другие колонки territory — этой таблицей владеет каталог.

- [ ] **Шаг 6: скомпилировать пакеты**

Выполнить: `cd backend/services/content-service && go build ./internal/config/... ./internal/domain/... ./internal/migrate/...`
Ожидается: код 0.

- [ ] **Шаг 7: коммит**

```bash
git add backend/go.work backend/services/content-service/go.mod backend/services/content-service/internal/config backend/services/content-service/internal/domain backend/services/content-service/internal/migrate
git commit -m "feat(content): module skeleton — config, domain, migrate"
```

---

## Задача 3: слой storage в content-service

**Файлы:**
- Создать: `backend/services/content-service/internal/storage/postgres.go` (структура PG + конструктор)
- Создать: `backend/services/content-service/internal/storage/queries.go` (перенесённые scan-хелперы)
- Создать: `backend/services/content-service/internal/storage/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go`

**Интерфейсы:**
- Производит: `storage.PG` с методами `CreateDocument`, `ListDocuments`, `DeleteDocument`, `CreatePanorama`, `ListPanoramas`, `UpdatePanorama`, `DeletePanorama` (сигнатуры точно как у оригиналов каталога, но с доменными типами `content-service`).

- [ ] **Шаг 1: создать `postgres.go`**

Скопировать структуру `PG` + конструктор `New(pool *pgxpool.Pool) *PG` из `catalog-service/internal/storage/postgres.go`, но оставить ТОЛЬКО поля/обвязку, нужные перенесённым методам (`pool`). Комментарий заголовка: `// Package storage is the content-service PostgreSQL store.`

- [ ] **Шаг 2: перенести scan-хелперы**

Из `catalog-service/internal/storage/queries.go` перенести **только** `scanDocument` и `scanPanorama` (и любой мелкий хелпер, который они вызывают, например интерфейс `rowScanner`, если используется) в `content-service/internal/storage/queries.go`. Применить замену импорта domain. Прочие сканеры каталога не переносить.

Выполнить: `cd backend && grep -n 'scanDocument\|scanPanorama' services/catalog-service/internal/storage/queries.go`
Ожидается: показывает две функции для переноса.

- [ ] **Шаг 3: перенести 7 файлов методов storage**

`git mv` каждый из этих файлов из `catalog-service/internal/storage/` в `content-service/internal/storage/`:
`create_document.go, list_documents.go, delete_document.go, create_panorama.go, list_panoramas.go, update_panorama.go, delete_panorama.go`

Применить замену импорта domain в каждом. Тела (SQL-CTE с JOIN на `territories`) не меняются — они резолвят `territory_slug → territory_id` через общую таблицу `territories`.

- [ ] **Шаг 4: скомпилировать**

Выполнить: `cd backend/services/content-service && go build ./internal/storage/...`
Ожидается: код 0. (Если `scanPanorama`/`scanDocument` ссылаются на неперенесённый хелпер — перенести и его.)

- [ ] **Шаг 5: коммит**

```bash
git add backend/services/content-service/internal/storage
git rm backend/services/catalog-service/internal/storage/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go
git commit -m "feat(content): move documents + panoramas storage from catalog"
```
> Каталог не будет компилироваться, пока Задача 8 не удалит методы Repository; это ожидаемо и чинится в Задаче 8. Коммит всё равно связный (перенос storage — одна ревьюабельная единица).

---

## Задача 4: слой service в content-service (с перенесёнными тестами)

**Файлы:**
- Создать: `backend/services/content-service/internal/service/content.go` (интерфейс Repository + конструктор + `//go:generate`)
- Создать: `backend/services/content-service/internal/service/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go`
- Создать: `backend/services/content-service/internal/service/documents_test.go` (+ тесты панорам, если они есть в каталоге)
- Создать: `backend/services/content-service/internal/service/mocks/` (генерируется)

**Интерфейсы:**
- Потребляет: `storage.PG` (неявно удовлетворяет `Repository`).
- Производит: `service.Content` с 7 публичными методами; интерфейс `service.Repository`.

- [ ] **Шаг 1: создать `content.go`**

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

- [ ] **Шаг 2: перенести 7 файлов методов service**

`git mv` из `catalog-service/internal/service/` в `content-service/internal/service/`:
`create_document.go, list_documents.go, delete_document.go, create_panorama.go, list_panoramas.go, update_panorama.go, delete_panorama.go`.

В каждом применить замену импорта domain И изменить ресивер с `(c *Catalog)` на `(c *Content)`. Логика не меняется (валидация + `c.repo.X`).

- [ ] **Шаг 3: перенести тестовый файл(ы)**

`git mv catalog-service/internal/service/documents_test.go content-service/internal/service/documents_test.go`. Применить замену импорта domain; изменить создаваемый subject с `service.New(repoMock)`, возвращающего `*Catalog`, на `*Content` (имена переменных/типов в тесте, ссылающиеся на `Catalog`). Если в каталоге нет отдельного service-теста панорам — не выдумывать его (YAGNI).

- [ ] **Шаг 4: сгенерировать моки**

Выполнить: `cd backend/services/content-service && go generate ./internal/service/...`
Ожидается: создаёт `internal/service/mocks/repository_mock.go`.

- [ ] **Шаг 5: прогнать тесты**

Выполнить: `cd backend/services/content-service && go test ./internal/service/...`
Ожидается: PASS (перенесённые тесты проверяют ту же логику валидации на новом моке).

- [ ] **Шаг 6: коммит**

```bash
git add backend/services/content-service/internal/service
git rm backend/services/catalog-service/internal/service/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go backend/services/catalog-service/internal/service/documents_test.go
git commit -m "feat(content): move documents + panoramas service layer + tests from catalog"
```

---

## Задача 5: транспорт + bootstrap + main в content-service (сервис стартует)

**Файлы:**
- Создать: `backend/services/content-service/internal/transport/grpcapi/{server.go,documents.go,panoramas.go}`
- Создать: `backend/services/content-service/internal/bootstrap/{logger.go,postgres.go,migrate.go,service.go,transport.go,serve.go}`
- Создать: `backend/services/content-service/cmd/content/main.go`

**Интерфейсы:**
- Потребляет: `service.Content`, стабы `contentv1`, `config.Config`.
- Производит: `grpcapi.Server` (реализует `contentv1.ContentServiceServer`), `bootstrap.RunServe/RunMigrateUp/Down/Status`.

- [ ] **Шаг 1: создать `grpcapi/server.go`**

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

- [ ] **Шаг 2: создать `grpcapi/documents.go` и `grpcapi/panoramas.go`**

Перенести тела хендлеров из `catalog-service/internal/transport/grpcapi/{list,create,delete}_document.go` и панорамных аналогов: та же конвертация pb↔domain, но типы запрос/ответ теперь `contentv1.*`, а ресивер вызывает `s.svc.X`. Разбить на два файла (documents.go = 3 document-RPC; panoramas.go = 4 panorama-RPC). Повторно использовать точную конвертацию Vec3↔domain и Timestamp, что применяют хендлеры каталога.

Ориентир по конвертации — оригиналы каталога:
Выполнить: `cd backend && sed -n '1,60p' services/catalog-service/internal/transport/grpcapi/create_panorama.go`
Скопировать тело, заменив `catalogv1` → `contentv1` и подстроив тип ресивера под content-овый `Server`.

- [ ] **Шаг 3: создать файлы bootstrap**

Перенести `twofa-service/internal/bootstrap/{logger.go,postgres.go,migrate.go}` с заменами (twofa → content, `TWOFA_`→`CONTENT_` в комментариях/логах, имя сервиса `twofa`→`content`).

`bootstrap/service.go` (без Redis, без клиентов — проще, чем в twofa):
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

`bootstrap/transport.go` — скопировать twofa-овый, заменить `twofav1`→`contentv1`, `TwoFAService_ServiceDesc`→`ContentService_ServiceDesc`, а `New(handler, authClient)`→ только handler:
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

`bootstrap/serve.go` — скопировать twofa-овый `serve.go` и убрать строки с Redis + auth-клиентом; обвязка сервиса становится `handler := InitService(pool)`. Заменить все `twofa`→`content`, `twofav1`→`contentv1`, `TwoFAService_ServiceDesc`→`ContentService_ServiceDesc`. Итоговая середина:
```go
	pool, err := InitPostgres(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	handler := InitService(pool)
	grpcSrv, healthSrv := InitGRPCServer(handler, logger)
```
(Всё остальное — signal-ctx, listen, горутина serve, graceful shutdown — идентично twofa с заменами имён.)

- [ ] **Шаг 4: создать `cmd/content/main.go`**

Скопировать `twofa-service/cmd/twofa/main.go`, заменить `twofa`→`content`, `TWOFA_`→`CONTENT_`, и сократить `PersistentFlags()` до config-а content (убрать флаги redis/secret/issuer/auth/verify):
```go
	flags.String("grpc-addr", ":9007", "gRPC listen address")
	flags.String("db-dsn", "", "PostgreSQL DSN (or set CONTENT_DB_DSN)")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
	flags.Bool("auto-migrate", true, "run goose migrations on startup")
	flags.Duration("shutdown-timeout", 15*time.Second, "graceful shutdown timeout")
```
Оставить обвязку `subCmd` migrate-up/down/status и `Use: "content"`, `Short: "Andrey content service"`.

- [ ] **Шаг 5: tidy + сборка всего модуля**

Выполнить: `cd backend/services/content-service && go mod tidy && go build ./...`
Ожидается: код 0.

- [ ] **Шаг 6: smoke-запуск против dev-БД** (опционально, но рекомендуется)

Выполнить: `cd backend/services/content-service && CONTENT_DB_DSN="postgres://andrey:andrey@localhost:5432/andrey?sslmode=disable" go run ./cmd/content migrate-status`
Ожидается: печатает статус goose для `content_goose_db_version` (нужен локальный Postgres; пропустить, если не запущен).

- [ ] **Шаг 7: коммит**

```bash
git add backend/services/content-service/internal/transport backend/services/content-service/internal/bootstrap backend/services/content-service/cmd backend/services/content-service/go.mod backend/services/content-service/go.sum
git commit -m "feat(content): grpc transport + bootstrap + main — service boots"
```

---

## Задача 6: Dockerfile, compose, Makefile

**Файлы:**
- Создать: `backend/services/content-service/Dockerfile`
- Изменить: `docker-compose.yml`
- Изменить: `backend/Makefile:1`

**Интерфейсы:** нет (обвязка деплоя).

- [ ] **Шаг 1: создать Dockerfile**

Скопировать `backend/services/twofa-service/Dockerfile` в `backend/services/content-service/Dockerfile`, заменив каждый токен `twofa` на `content` (путь сборки `./cmd/content`, имя бинарника `content`, любые метки `TWOFA`). Это образ `distroless/static` статического Go (без gltfpack), как и twofa.

- [ ] **Шаг 2: добавить `content` в `docker-compose.yml`**

Вставить после блока сервиса `twofa:`:
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

Затем в блок `gateway:` добавить в `depends_on`:
```yaml
      content: { condition: service_started }
```
и в `gateway.environment`:
```yaml
      GATEWAY_CONTENT_GRPC_ADDR: "content:9007"
```

- [ ] **Шаг 3: добавить в Makefile**

Изменить `backend/Makefile:1`:
```make
SERVICES := gateway-service catalog-service auth-service twofa-service content-service mesh-service asset-service upload-service
```

- [ ] **Шаг 4: собрать образ**

Выполнить: `cd /Users/vbncursed/programming/rosneft && docker compose build content`
Ожидается: образ успешно собирается.

- [ ] **Шаг 5: коммит**

```bash
git add backend/services/content-service/Dockerfile docker-compose.yml backend/Makefile
git commit -m "build(content): Dockerfile, compose service, Makefile entry"
```

---

## Задача 7: шлюз — клиент Content + перенаправление documents/panoramas/scene-bundle

**Файлы:**
- Создать: `backend/services/gateway-service/internal/clients/content/{client.go,documents.go,panoramas.go,converters.go}`
- Изменить: `backend/services/gateway-service/internal/service/gateway.go` (добавить интерфейс `Content` + поле + конструктор)
- Изменить: `backend/services/gateway-service/internal/service/documents.go`, `.../panoramas.go` (`g.catalog`→`g.content`)
- Изменить: `backend/services/gateway-service/internal/service/scene_bundle.go` (ветки docs/panorama → `g.content`)
- Изменить: `backend/services/gateway-service/internal/bootstrap/*` (дозвон content, передать в `service.New`)
- Изменить: `backend/services/gateway-service/internal/config/*` (добавить `ContentGRPCAddr`)
- Перегенерировать: `backend/services/gateway-service/internal/service/mocks/`

**Интерфейсы:**
- Потребляет: клиент `contentv1`, gateway-овые `domain.Document`/`domain.Panorama`.
- Производит: интерфейс `service.Content`; `content.Client` с 7 методами (те же сигнатуры, что были у интерфейса `Catalog` для этих методов).

- [ ] **Шаг 1: создать пакет клиента content**

`clients/content/client.go` — скопировать `clients/catalog/client.go`, заменить `catalog`→`content`, `catalogv1`→`contentv1`, `CatalogServiceClient`→`ContentServiceClient`.

`clients/content/documents.go` и `clients/content/panoramas.go` — `git mv` из `clients/catalog/documents.go` и `clients/catalog/panoramas.go`, затем заменить пакет `catalog`→`content`, `c.cc.ListDocuments`/и т.д. теперь бьют по запросам `contentv1`. Конвертация pb→domain переносится вместе.

`clients/content/converters.go` — перенести ТОЛЬКО конвертеры document/panorama (pb↔domain), нужные двум файлам выше, из `clients/catalog/converters.go` в новый файл. Конвертеры territory/model/placement оставить в каталоговом.

- [ ] **Шаг 2: добавить интерфейс `Content` в `gateway.go`**

В `backend/services/gateway-service/internal/service/gateway.go`:
- Удалить 7 методов doc/panorama из интерфейса `Catalog`.
- Добавить новый интерфейс:
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
- Обновить строку `//go:generate`: `//go:generate minimock -i Catalog,Content,Mesh,Upload -o ./mocks -s _mock.go`.
- Добавить `content Content` в структуру `Gateway` и параметр `content` в `New`:
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

- [ ] **Шаг 3: перенаправить методы service**

В `service/documents.go` и `service/panoramas.go`: заменить каждый `g.catalog.` на `g.content.` (7 точек вызова). Логика валидации не меняется.

В `service/scene_bundle.go`: ветки errgroup, вызывающие `g.catalog.ListPanoramas(...)` и `g.catalog.ListDocuments(...)`, становятся `g.content.ListPanoramas(...)` / `g.content.ListDocuments(...)`. Ветки territory/model/placement остаются на `g.catalog`.

- [ ] **Шаг 4: config + обвязка bootstrap**

В gateway `config` — добавить `ContentGRPCAddr string` (mapstructure `content-grpc-addr`), дефолт `"content:9007"` и флаг `--content-grpc-addr` по образцу `--catalog-grpc-addr` (найти их в gateway `cmd`/`config` и повторить паттерн).

В gateway `bootstrap` — там, где дозванивается catalog и вызывается `service.New(catalogClient, meshClient, uploadClient)`:
```go
	contentClient, err := content.Dial(cfg.ContentGRPCAddr)
	if err != nil { return ... }
	defer func() { _ = contentClient.Close() }()
	...
	svc := service.New(catalogClient, contentClient, meshClient, uploadClient)
```
Добавить импорт клиента `content`.

- [ ] **Шаг 5: перегенерировать моки + починить конструкторы в тестах**

Выполнить: `cd backend/services/gateway-service && go generate ./internal/service/...`
Ожидается: создан `mocks/content_mock.go`, `catalog_mock.go` сокращается (7 методов ушли).

Затем обновить каждый вызов `service.New(...)` в gateway `*_test.go`, передав `ContentMock` в новой 2-й позиции. В `scene_bundle_test.go`, тестах service documents/panoramas: выставлять ожидания на `ContentMock` вместо `CatalogMock` для этих вызовов.

- [ ] **Шаг 6: сборка + тесты шлюза**

Выполнить: `cd backend/services/gateway-service && go mod tidy && go build ./... && go test ./...`
Ожидается: код 0, тесты PASS.

- [ ] **Шаг 7: коммит**

```bash
git add backend/services/gateway-service
git commit -m "feat(gateway): route documents + panoramas to content-service"
```

---

## Задача 8: удалить documents + panoramas из каталога

**Файлы:**
- Изменить: `backend/proto/rosneft/catalog/v1/catalog.proto` (убрать 7 RPC + сообщения doc/panorama) + перегенерировать
- Изменить: `backend/services/catalog-service/internal/service/catalog.go` (убрать 7 методов Repository)
- Изменить: `backend/services/catalog-service/internal/transport/grpcapi/server.go`, если он ссылается на удалённые хендлеры
- Удалить: каталоговые `transport/grpcapi/{create,list,delete}_document.go`, файлы хендлеров панорам
- Удалить: каталоговые `domain/document.go`, `domain/panorama.go` (если теперь не используются)
- Изменить: `catalog-service/internal/storage/queries.go` (scanDocument/scanPanorama уже перенесены — убедиться, что ничего не висит)
- Перегенерировать: каталоговые service `mocks/`

**Интерфейсы:**
- Производит: похудевший `CatalogService` (48 RPC), похудевший каталоговый `Repository`.

- [ ] **Шаг 1: обрезать `catalog.proto`**

Удалить 3 document + 4 panorama строки `rpc` из `service CatalogService`, и удалить сообщения `Panorama`, `Document` и их 7 пар request/response. Оставить `Vec3` (ещё используется артефактами/плейсментами).

Выполнить: `cd backend && make proto-gen`
Ожидается: код 0; каталоговый gen больше не содержит стабов ListDocuments/Panorama.

- [ ] **Шаг 2: обрезать каталоговый `Repository`**

В `catalog-service/internal/service/catalog.go` удалить 7 сигнатур методов (блок `ListPanoramas … DeleteDocument`, показанный в дизайне). Всё остальное оставить.

- [ ] **Шаг 3: удалить каталоговые transport-хендлеры**

`git rm` каталоговые `internal/transport/grpcapi/{create_document,list_documents,delete_document,create_panorama,list_panoramas,update_panorama,delete_panorama}.go`. В `grpcapi/server.go` убрать любые ссылки (отсутствующие методы покрывает `UnimplementedCatalogServiceServer`; удалить оставшиеся строки регистрации, которые их называли).

- [ ] **Шаг 4: удалить более не используемые доменные файлы**

Выполнить: `cd backend && grep -rn 'domain.Document\|domain.Panorama' services/catalog-service/`
Ожидается: совпадений нет. Затем `git rm services/catalog-service/internal/domain/document.go services/catalog-service/internal/domain/panorama.go`. (Если совпадение остаётся — устранить его перед удалением.)

- [ ] **Шаг 5: перегенерировать каталоговые моки + сборка + тесты**

Выполнить: `cd backend/services/catalog-service && go generate ./internal/service/... && go mod tidy && go build ./... && go test ./...`
Ожидается: код 0, тесты PASS. (`documents_test.go` уже перенесён в Задаче 4.)

- [ ] **Шаг 6: полная сборка + тесты воркспейса**

Выполнить: `cd backend && make build && make test`
Ожидается: каждый модуль собирается, тесты проходят.

- [ ] **Шаг 7: коммит**

```bash
git add backend/proto backend/services/catalog-service
git commit -m "refactor(catalog): drop documents + panoramas (now owned by content-service)"
```

---

## Задача 9: интеграционная проверка + документация

**Файлы:**
- Изменить: `backend/CLAUDE.md` (таблица сервисов + устаревшие места про mesh/CLAUDE)

- [ ] **Шаг 1: поднять стек**

Выполнить: `cd /Users/vbncursed/programming/rosneft && docker compose up --build -d`
Ожидается: контейнер `content` здоров; `docker compose ps` показывает его Up.

- [ ] **Шаг 2: прогнать documents end-to-end**

С существующим slug территории `<slug>` и валидным хешом загруженного blob `<hash>`:
```bash
curl -s -X POST localhost:8080/api/territories/<slug>/documents \
  -H 'content-type: application/json' \
  -d '{"title":"Spec","sourceBlobHash":"<hash>"}'
curl -s localhost:8080/api/territories/<slug>/documents
```
Ожидается: POST возвращает 201 с документом; GET перечисляет его. (Подтверждает путь gateway→content.)

- [ ] **Шаг 3: прогнать panoramas end-to-end**

```bash
curl -s -X POST localhost:8080/api/territories/<slug>/panoramas \
  -H 'content-type: application/json' \
  -d '{"slug":"p1","title":"Pano","sourceBlobHash":"<hash>","position":{"x":0,"y":0,"z":0},"yawOffset":0}'
curl -s "localhost:8080/api/territories/<slug>/scene" | jq '.panoramas, .documents'
```
Ожидается: POST 201; scene bundle возвращает панораму и документ (подтверждает, что ветки errgroup теперь бьют по content-service).

- [ ] **Шаг 4: проверить каскад**

Удалить территорию и убедиться, что её строки documents/panoramas исчезли (каскад на уровне БД всё ещё срабатывает несмотря на перенос владения):
```bash
curl -s -X DELETE localhost:8080/api/territories/<slug>
docker compose exec postgres psql -U andrey -d andrey -c \
  "SELECT count(*) FROM territory_documents td JOIN territories t ON t.id=td.territory_id WHERE t.slug='<slug>';"
```
Ожидается: DELETE 204; count-запрос возвращает 0 строк (территория удалена → потомки каскадно удалены).

- [ ] **Шаг 5: обновить `backend/CLAUDE.md`**

Обновить таблицу Services: добавить `content` (`services/content-service`, cmd `content`, «Владеет documents + panoramas, привязанными к территории; на Postgres, общая БД `andrey`, изоляция через `content_goose_db_version`. gRPC `:9007`.»). Также добавить недостающие строки `auth` и `twofa`, если их всё ещё нет, и изменить строку каталога на «territories + models + artifacts + placements + admins» (убрать documents/panoramas). Исправить счётчик «nine containers».

- [ ] **Шаг 6: коммит**

```bash
git add backend/CLAUDE.md
git commit -m "docs(backend): document content-service; refresh services table"
```

---

## Самопроверка

**Покрытие спеки:**
- Подход A (docs + panoramas → один content-service): Задачи 1–6. ✅
- Вариант FK B1-lite (общая БД, таблицы на месте, каскад на уровне БД): Задача 2 Шаг 5 (`IF NOT EXISTS`, пустой Down) + Задача 9 Шаг 4 (проверка каскада). ✅
- Повторение скелета twofa: Задачи 2–6 явно копируют файлы twofa. ✅
- Перенаправление шлюза (уже по концернам; ветки scene bundle): Задача 7. ✅
- Публичный REST/фронтенд без изменений: Задача 7 оставляет `httpapi/*` + OpenAPI нетронутыми; проверено в Задаче 9 Шаги 2–3. ✅
- Каталог худеет (55→48 RPC): Задача 8. ✅
- Compose/Makefile/go.work: Задача 6 + Задача 2 Шаг 2. ✅
- Соглашения по тестам + перенесённые тесты: Задача 4. ✅
- Устаревший CLAUDE.md: Задача 9 Шаг 5. ✅

**Скан плейсхолдеров:** новые файлы даны полностью; перенесённые файлы полностью заданы путём + заменой + изменением ресивера/типа. Две точки делегируют на `sed`/`grep`-ссылку существующего каталогового файла (Задача 5 Шаг 2 конвертация хендлера панорам, Задача 3 Шаг 2 scan-хелперы) вместо повторной вставки — намеренно, потому что этот код существует в репозитории дословно и должен быть скопирован, а не переписан.

**Согласованность типов:** `service.Content` (content) vs `service.Catalog` (catalog) vs интерфейс `Content` шлюза — все семь сигнатур методов совпадают в storage `PG`, content `Repository`, content `grpcapi.Service` и gateway `Content` (сверено с блоком каталогового `Repository` в дизайне). Изменение арности конструктора (`New` шлюза получает `content` во 2-й позиции) применяется в Задаче 7 Шаг 2 и потребляется в обвязке Шага 4 + тестах Шага 5.

## Передача на выполнение

Два варианта выполнения:

1. **На саб-агентах (рекомендуется)** — свежий саб-агент на каждую задачу, ревью между задачами. Задачи 3–5 должны идти по порядку (они инкрементально собирают модуль); Задачи 7 и 8 обе зависят от Задач 1–6, но независимы друг от друга.
2. **Inline-выполнение** — выполнение в этой сессии с чекпоинтами.
