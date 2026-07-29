# Журнал изменений: доказуемость и видимость — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть четыре пробела журнала изменений: периодические контрольные дайджесты со свидетельством в файл, право `audit:read_own`, метрика роста и инструмент экспорта.

**Architecture:** Фоновый тик в audit-service сворачивает новые строки `audit_log` в SHA-256 средствами Postgres, пишет чекпоинт в сцепленную таблицу `audit_checkpoint`, дублирует дайджест в лог и в append-only JSONL на отдельном томе. Путь записи мутаций не затрагивается вообще. Граница диапазона берётся из `pg_sequence_last_value`, снятого тиком ранее, — последовательность выдаёт `id` до коммита, поэтому такой рубеж не пропускает строку, удерживаемую незавершённой транзакцией. Проверка (`audit verify`) пересчитывает цепочку и сверяет её с файлом.

**Tech Stack:** Go 1.26.5, PostgreSQL 17 + pgcrypto, pgx/v5, goose, cobra + viper, prometheus/client_golang, testcontainers-go, testify/suite + gotest.tools/v3/assert, minimock; фронт — React 19 + TanStack Query, vitest.

**Спека:** [`docs/superpowers/specs/2026-07-29-audit-hardening-design.md`](../specs/2026-07-29-audit-hardening-design.md)

## Global Constraints

- Go **1.26.5** во всех модулях; `golang:1.26.5-alpine` в Dockerfile.
- **200 строк на файл**; на бэкенде — соглашение, проверяемое ревью.
- **Один метод — один файл** в слоях `storage/`, `service/`, `transport/`; файл с именем пакета держит интерфейс и конструктор.
- Тесты: `testify/suite` для группировки, `gotest.tools/v3/assert` для утверждений. Моки — `minimock`.
- Интеграционные тесты — за build-тегом `integration`, запуск `go test -tags=integration ./...`, нужен Docker.
- **Перед каждым коммитом Go:** `make -C backend check` (gofmt, tidy-drift, `GOWORK=off go vet`, golangci-lint, `go test -race -shuffle=on`, govulncheck), ~80 с.
- **`proto/` и `openapi.yaml` не меняются.** Verify и export — операционные инструменты CLI, не API.
- Комментарии — на языке файла, в который они попадают: в `audit-service` и `gateway-service` английский, во фронтовом `audit/` встречается русский.
- Ветка работы — `dev`, как в текущем потоке; коммиты атомарные, по задаче.
- Все сервисы делят базу `andrey`, изоляция миграций — через `<service>_goose_db_version`.

---

### Task 1: Схема чекпоинтов

**Files:**
- Create: `backend/services/audit-service/internal/migrate/migrations/00004_checkpoints.sql`
- Create: `backend/services/audit-service/internal/migrate/checkpoint_schema_integration_test.go`

**Interfaces:**
- Consumes: `audit_immutable()` из миграции `00001` — переиспользуется, не пишется заново.
- Produces: таблица `audit_checkpoint(id, at, from_id, to_id, watermark, row_count, digest, prev_digest)` и защищающие её триггеры. Задачи 2 и 6 читают и пишут её.

- [ ] **Step 1: Написать падающий интеграционный тест**

Create `backend/services/audit-service/internal/migrate/checkpoint_schema_integration_test.go`:

```go
//go:build integration

package migrate_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
)

// CheckpointSchemaSuite proves audit_checkpoint carries the same append-only
// guarantee as audit_log. A checkpoint that can be rewritten is worth nothing:
// whoever edits the journal would edit its digest to match.
type CheckpointSchemaSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
}

func TestCheckpointSchemaSuite(t *testing.T) {
	suite.Run(t, new(CheckpointSchemaSuite))
}

func (s *CheckpointSchemaSuite) SetupSuite() {
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
}

func (s *CheckpointSchemaSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *CheckpointSchemaSuite) seed() {
	_, err := s.pool.Exec(s.T().Context(), `
		INSERT INTO audit_checkpoint (from_id, to_id, watermark, row_count, digest, prev_digest)
		VALUES (0, 0, 0, 0, 'seed', '')`)
	assert.NilError(s.T(), err)
}

func (s *CheckpointSchemaSuite) TestUpdateIsRefused() {
	s.seed()
	_, err := s.pool.Exec(s.T().Context(), `UPDATE audit_checkpoint SET digest = 'forged'`)
	assert.ErrorContains(s.T(), err, "append-only")
}

func (s *CheckpointSchemaSuite) TestDeleteIsRefused() {
	s.seed()
	_, err := s.pool.Exec(s.T().Context(), `DELETE FROM audit_checkpoint`)
	assert.ErrorContains(s.T(), err, "append-only")
}

func (s *CheckpointSchemaSuite) TestTruncateIsRefused() {
	_, err := s.pool.Exec(s.T().Context(), `TRUNCATE audit_checkpoint`)
	assert.ErrorContains(s.T(), err, "append-only")
}

// digest() comes from pgcrypto, which the auth migrations also create — but
// service migrations run in no fixed order, and this suite runs audit's alone.
// Without the extension claimed by 00004 the whole digest pipeline fails at
// runtime rather than at migration time, which is the worst place to find out.
func (s *CheckpointSchemaSuite) TestPgcryptoIsAvailable() {
	var got string
	err := s.pool.QueryRow(s.T().Context(),
		`SELECT encode(digest('', 'sha256'), 'hex')`).Scan(&got)

	assert.NilError(s.T(), err)
	// SHA-256 of the empty string — the same value the seed checkpoint carries.
	assert.Equal(s.T(), got, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
}

// row_count must not be named `rows`: ROWS is a PostgreSQL keyword and a bare
// reference to it inside a window or FETCH clause would not parse.
func (s *CheckpointSchemaSuite) TestRowCountColumnExists() {
	var n int
	err := s.pool.QueryRow(s.T().Context(), `
		SELECT count(*) FROM information_schema.columns
		WHERE table_name = 'audit_checkpoint' AND column_name = 'row_count'`).Scan(&n)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd backend/services/audit-service && go test -tags=integration ./internal/migrate/ -run TestCheckpointSchemaSuite -v`
Expected: FAIL — `relation "audit_checkpoint" does not exist`.

- [ ] **Step 3: Написать миграцию**

Create `backend/services/audit-service/internal/migrate/migrations/00004_checkpoints.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
-- digest() lives in pgcrypto. The auth migrations create the extension too, but
-- service migrations run independently and in no fixed order: on a fresh
-- database audit may go first, and in the testcontainers suites it goes alone.
-- Claiming the dependency here is what makes ComputeDigest work regardless.
-- IF NOT EXISTS because auth may well have created it already; the Down
-- migration deliberately does not drop it, since auth needs gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Sealed ranges of the journal. Each row digests audit_log over (from_id, to_id]
-- and chains to its predecessor, so rewriting one checkpoint forces rewriting
-- every later one.
--
-- watermark is pg_sequence_last_value('audit_log_id_seq') as observed by the
-- tick that wrote this row. The next tick uses it as its range boundary: the
-- sequence hands out ids before commit, so a watermark one tick old is the
-- point past which every id is settled. max(id) would miss a row held by an
-- in-flight transaction and raise a false alarm once it lands.
--
-- row_count, not `rows`: ROWS is a PostgreSQL keyword.
CREATE TABLE audit_checkpoint (
    id          BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    from_id     BIGINT NOT NULL,
    to_id       BIGINT NOT NULL,
    watermark   BIGINT NOT NULL,
    row_count   INT    NOT NULL,
    digest      TEXT   NOT NULL,
    prev_digest TEXT   NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
-- Same guarantee as audit_log, same function: a checkpoint that can be rewritten
-- protects nothing.
CREATE TRIGGER audit_checkpoint_no_mutate BEFORE UPDATE OR DELETE ON audit_checkpoint
    FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();
CREATE TRIGGER audit_checkpoint_no_truncate BEFORE TRUNCATE ON audit_checkpoint
    FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_checkpoint FROM PUBLIC;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS audit_checkpoint_no_truncate ON audit_checkpoint;
DROP TRIGGER IF EXISTS audit_checkpoint_no_mutate ON audit_checkpoint;
DROP TABLE IF EXISTS audit_checkpoint;
-- +goose StatementEnd
```

- [ ] **Step 4: Запустить тест, убедиться что проходит**

Run: `cd backend/services/audit-service && go test -tags=integration ./internal/migrate/ -run TestCheckpointSchemaSuite -v`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Проверить откат миграции**

Run: `cd backend/services/audit-service && go test -tags=integration ./internal/migrate/ -v`
Expected: PASS — существующий `rollback_integration_test.go` прогоняет down/up по всей цепочке.

- [ ] **Step 6: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/audit-service/internal/migrate/
git commit -m "feat(audit): append-only checkpoint table for journal digests"
```

---

### Task 2: Домен и хранилище чекпоинтов

**Files:**
- Create: `backend/services/audit-service/internal/domain/checkpoint.go`
- Create: `backend/services/audit-service/internal/storage/last_checkpoint.go`
- Create: `backend/services/audit-service/internal/storage/sequence_watermark.go`
- Create: `backend/services/audit-service/internal/storage/compute_digest.go`
- Create: `backend/services/audit-service/internal/storage/save_checkpoint.go`
- Create: `backend/services/audit-service/internal/storage/list_checkpoints.go`
- Create: `backend/services/audit-service/internal/migrate/checkpoint_storage_integration_test.go`

**Interfaces:**
- Consumes: таблица `audit_checkpoint` (Task 1); `storage.PG` с полем `pool *pgxpool.Pool` и конструктором `storage.New(pool)`.
- Produces:
  - `domain.Checkpoint{ID int64; At time.Time; FromID, ToID, Watermark int64; RowCount int32; Digest, PrevDigest string}`
  - `(*PG).LastCheckpoint(ctx) (domain.Checkpoint, bool, error)` — `false` когда таблица пуста
  - `(*PG).SequenceWatermark(ctx) (int64, error)`
  - `(*PG).ComputeDigest(ctx, fromID, boundary int64, prev string) (rowCount int32, toID int64, digest string, err error)`
  - `(*PG).SaveCheckpoint(ctx, domain.Checkpoint) (domain.Checkpoint, error)`
  - `(*PG).ListCheckpoints(ctx) ([]domain.Checkpoint, error)` — по возрастанию `id`

- [ ] **Step 1: Написать доменный тип**

Create `backend/services/audit-service/internal/domain/checkpoint.go`:

```go
package domain

import "time"

// Checkpoint is one sealed range of the journal: the digest of every audit_log
// row in (FromID, ToID], chained to the previous checkpoint through PrevDigest.
//
// Watermark is pg_sequence_last_value('audit_log_id_seq') as observed by the
// tick that wrote this checkpoint. The next tick uses it as its boundary — see
// storage.ComputeDigest for why max(id) cannot serve that role.
type Checkpoint struct {
	ID         int64
	At         time.Time
	FromID     int64
	ToID       int64
	Watermark  int64
	RowCount   int32
	Digest     string
	PrevDigest string
}
```

- [ ] **Step 2: Написать падающий интеграционный тест хранилища**

Create `backend/services/audit-service/internal/migrate/checkpoint_storage_integration_test.go`:

```go
//go:build integration

package migrate_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
)

type CheckpointStorageSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *storage.PG
}

func TestCheckpointStorageSuite(t *testing.T) {
	suite.Run(t, new(CheckpointStorageSuite))
}

func (s *CheckpointStorageSuite) SetupSuite() {
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
	s.store = storage.New(s.pool)
}

func (s *CheckpointStorageSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// Record() is the only writer that does not need a business table, so it is how
// these tests fill the journal.
func (s *CheckpointStorageSuite) record(action string) int64 {
	id, err := s.store.Record(s.T().Context(), domain.Entry{
		Action: action, Entity: "auth", Result: "ok",
	})
	assert.NilError(s.T(), err)
	return id
}

func (s *CheckpointStorageSuite) TestLastCheckpointIsAbsentOnAFreshTable() {
	_, ok, err := s.store.LastCheckpoint(s.T().Context())

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), ok, false)
}

func (s *CheckpointStorageSuite) TestWatermarkTracksTheSequence() {
	before, err := s.store.SequenceWatermark(s.T().Context())
	assert.NilError(s.T(), err)

	s.record("auth.login")

	after, err := s.store.SequenceWatermark(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), after > before, "watermark %d did not advance past %d", after, before)
}

func (s *CheckpointStorageSuite) TestDigestIsStableAndCoversTheRange() {
	from := s.record("auth.login")
	to := s.record("auth.logout")

	n1, top1, d1, err := s.store.ComputeDigest(s.T().Context(), from-1, to, "prev")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n1, int32(2))
	assert.Equal(s.T(), top1, to)
	assert.Assert(s.T(), d1 != "")

	// Same inputs, same digest — otherwise verify could never reproduce it.
	_, _, d2, err := s.store.ComputeDigest(s.T().Context(), from-1, to, "prev")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), d1, d2)

	// The previous digest is folded in, so an identical range under a different
	// predecessor must not collide.
	_, _, d3, err := s.store.ComputeDigest(s.T().Context(), from-1, to, "other")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), d1 != d3)
}

func (s *CheckpointStorageSuite) TestEmptyRangeKeepsTheChainGoing() {
	top, err := s.store.SequenceWatermark(s.T().Context())
	assert.NilError(s.T(), err)

	n, to, digest, err := s.store.ComputeDigest(s.T().Context(), top, top, "prev")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int32(0))
	assert.Equal(s.T(), to, top) // falls back to fromID, so ranges stay contiguous
	assert.Assert(s.T(), digest != "")
}

func (s *CheckpointStorageSuite) TestSaveAndListRoundTrip() {
	saved, err := s.store.SaveCheckpoint(s.T().Context(), domain.Checkpoint{
		FromID: 1, ToID: 9, Watermark: 9, RowCount: 3, Digest: "abc", PrevDigest: "",
	})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), saved.ID > 0)
	assert.Assert(s.T(), !saved.At.IsZero())

	all, err := s.store.ListCheckpoints(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), len(all) >= 1)
	assert.Equal(s.T(), all[len(all)-1].Digest, "abc")

	last, ok, err := s.store.LastCheckpoint(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), ok, true)
	assert.Equal(s.T(), last.Digest, "abc")
}
```

- [ ] **Step 3: Запустить тест, убедиться что падает**

Run: `cd backend/services/audit-service && go test -tags=integration ./internal/migrate/ -run TestCheckpointStorageSuite`
Expected: FAIL — компиляция: `s.store.LastCheckpoint undefined`.

- [ ] **Step 4: Реализовать `LastCheckpoint`**

Create `backend/services/audit-service/internal/storage/last_checkpoint.go`:

```go
package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// checkpointColumns is the projection every checkpoint scan expects, in order.
const checkpointColumns = `id, at, from_id, to_id, watermark, row_count, digest, prev_digest`

// LastCheckpoint returns the newest checkpoint. The bool is false on a journal
// that has never been checkpointed — the caller seeds one rather than treating
// it as an error.
func (r *PG) LastCheckpoint(ctx context.Context) (domain.Checkpoint, bool, error) {
	const q = `SELECT ` + checkpointColumns + ` FROM audit_checkpoint ORDER BY id DESC LIMIT 1`

	var c domain.Checkpoint
	err := r.pool.QueryRow(ctx, q).Scan(&c.ID, &c.At, &c.FromID, &c.ToID,
		&c.Watermark, &c.RowCount, &c.Digest, &c.PrevDigest)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Checkpoint{}, false, nil
	}
	if err != nil {
		return domain.Checkpoint{}, false, fmt.Errorf("storage.LastCheckpoint: %w", err)
	}
	return c, true, nil
}
```

- [ ] **Step 5: Реализовать `SequenceWatermark`**

Create `backend/services/audit-service/internal/storage/sequence_watermark.go`:

```go
package storage

import (
	"context"
	"fmt"
)

// SequenceWatermark reports the last id handed out by audit_log's sequence.
//
// This is the one value that sees ids belonging to transactions that have not
// committed: the sequence advances at INSERT time, not at COMMIT. A watermark
// read one tick ago is therefore the point past which every id is settled,
// which is exactly what a digest boundary has to be. max(id) cannot serve —
// it skips a row an in-flight transaction is holding, and that row later lands
// inside an already-digested range.
//
// coalesce covers a sequence that has never been used: pg_sequence_last_value
// returns NULL until the first nextval.
func (r *PG) SequenceWatermark(ctx context.Context) (int64, error) {
	const q = `SELECT coalesce(pg_sequence_last_value('audit_log_id_seq'), 0)`

	var w int64
	if err := r.pool.QueryRow(ctx, q).Scan(&w); err != nil {
		return 0, fmt.Errorf("storage.SequenceWatermark: %w", err)
	}
	return w, nil
}
```

- [ ] **Step 6: Реализовать `ComputeDigest`**

Create `backend/services/audit-service/internal/storage/compute_digest.go`:

```go
package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// ComputeDigest folds every audit_log row in (fromID, boundary] into one
// SHA-256, prefixed with the previous checkpoint's digest so the chain cannot
// be re-cut at a different place.
//
// The whole fold happens in Postgres: shipping rows to Go would move bytes for
// no reason and would make the result depend on Go's JSON encoder instead of
// the storage format.
//
// SET LOCAL timezone = 'UTC' is not optional. jsonb renders timestamptz in the
// session's zone, and this project's containers run Europe/Moscow, so without
// it the digest would stop reproducing the moment anything ran elsewhere.
// to_jsonb sorts keys, so column order in the table does not leak in either.
//
// toID comes back as max(id) inside the range rather than the boundary itself:
// nothing can appear past the boundary any more, and a tighter range is cheaper
// to recompute. On an empty range it falls back to fromID so consecutive
// checkpoints stay contiguous and verify never sees a hole.
func (r *PG) ComputeDigest(
	ctx context.Context, fromID, boundary int64, prev string,
) (rowCount int32, toID int64, digest string, err error) {
	const q = `
		SELECT count(*)::int,
		       coalesce(max(l.id), $1),
		       encode(digest($3 || coalesce(string_agg(to_jsonb(l.*)::text, E'\n' ORDER BY l.id), ''),
		                     'sha256'), 'hex')
		FROM audit_log l
		WHERE l.id > $1 AND l.id <= $2`

	err = pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, txErr := tx.Exec(ctx, `SET LOCAL timezone = 'UTC'`); txErr != nil {
			return fmt.Errorf("pin timezone: %w", txErr)
		}
		return tx.QueryRow(ctx, q, fromID, boundary, prev).Scan(&rowCount, &toID, &digest)
	})
	if err != nil {
		return 0, 0, "", fmt.Errorf("storage.ComputeDigest: %w", err)
	}
	return rowCount, toID, digest, nil
}
```

- [ ] **Step 7: Реализовать `SaveCheckpoint` и `ListCheckpoints`**

Create `backend/services/audit-service/internal/storage/save_checkpoint.go`:

```go
package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// SaveCheckpoint appends one checkpoint and returns it with the server-assigned
// id and timestamp filled in.
func (r *PG) SaveCheckpoint(ctx context.Context, c domain.Checkpoint) (domain.Checkpoint, error) {
	const q = `
		INSERT INTO audit_checkpoint (from_id, to_id, watermark, row_count, digest, prev_digest)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, at`

	err := r.pool.QueryRow(ctx, q, c.FromID, c.ToID, c.Watermark, c.RowCount, c.Digest, c.PrevDigest).
		Scan(&c.ID, &c.At)
	if err != nil {
		return domain.Checkpoint{}, fmt.Errorf("storage.SaveCheckpoint: %w", err)
	}
	return c, nil
}
```

Create `backend/services/audit-service/internal/storage/list_checkpoints.go`:

```go
package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// ListCheckpoints returns every checkpoint oldest-first — the order verify has
// to walk to follow the chain. The table gains one row per tick, so a full read
// stays small: at the default five-minute cadence it is roughly 105k rows after
// a year.
func (r *PG) ListCheckpoints(ctx context.Context) ([]domain.Checkpoint, error) {
	const q = `SELECT ` + checkpointColumns + ` FROM audit_checkpoint ORDER BY id ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("storage.ListCheckpoints: %w", err)
	}
	defer rows.Close()

	var out []domain.Checkpoint
	for rows.Next() {
		var c domain.Checkpoint
		if scanErr := rows.Scan(&c.ID, &c.At, &c.FromID, &c.ToID, &c.Watermark,
			&c.RowCount, &c.Digest, &c.PrevDigest); scanErr != nil {
			return nil, fmt.Errorf("storage.ListCheckpoints: scan: %w", scanErr)
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListCheckpoints: rows: %w", err)
	}
	return out, nil
}
```

- [ ] **Step 8: Запустить тест, убедиться что проходит**

Run: `cd backend/services/audit-service && go test -tags=integration ./internal/migrate/ -run TestCheckpointStorageSuite -v`
Expected: PASS, 5 тестов.

- [ ] **Step 9: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/audit-service/internal/domain/checkpoint.go \
        backend/services/audit-service/internal/storage/ \
        backend/services/audit-service/internal/migrate/checkpoint_storage_integration_test.go
git commit -m "feat(audit): checkpoint storage with sequence-watermark boundary"
```

---

### Task 3: Запись дайджеста в файл

**Files:**
- Create: `backend/services/audit-service/internal/digest/writer.go`
- Create: `backend/services/audit-service/internal/digest/writer_test.go`

**Interfaces:**
- Consumes: `domain.Checkpoint` (Task 2).
- Produces:
  - `digest.Open(path string) (*digest.Writer, error)` — при пустом пути возвращает `nil, nil`
  - `(*digest.Writer).Write(c domain.Checkpoint) error` — безопасен на nil-получателе
  - `(*digest.Writer).Close() error` — безопасен на nil-получателе

- [ ] **Step 1: Написать падающий тест**

Create `backend/services/audit-service/internal/digest/writer_test.go`:

```go
package digest_test

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

type WriterSuite struct{ suite.Suite }

func TestWriterSuite(t *testing.T) { suite.Run(t, new(WriterSuite)) }

func checkpoint(toID int64, dg string) domain.Checkpoint {
	return domain.Checkpoint{
		At: time.Date(2026, 7, 29, 10, 15, 0, 0, time.UTC),
		FromID: 4120, ToID: toID, RowCount: 67, Digest: dg, PrevDigest: "41ab",
	}
}

// An empty path disables the witness. Returning a nil writer that still accepts
// Write keeps the caller free of a branch on every tick.
func (s *WriterSuite) TestEmptyPathDisablesTheWitness() {
	w, err := digest.Open("")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), w == nil)
	assert.NilError(s.T(), w.Write(checkpoint(4187, "9f2c")))
	assert.NilError(s.T(), w.Close())
}

func (s *WriterSuite) TestAppendsOneJSONLinePerCheckpoint() {
	path := filepath.Join(s.T().TempDir(), "digests.jsonl")

	w, err := digest.Open(path)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), w.Write(checkpoint(4187, "9f2c")))
	assert.NilError(s.T(), w.Write(checkpoint(4200, "aa01")))
	assert.NilError(s.T(), w.Close())

	f, err := os.Open(path)
	assert.NilError(s.T(), err)
	defer f.Close()

	var got []map[string]any
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		var m map[string]any
		assert.NilError(s.T(), json.Unmarshal(sc.Bytes(), &m))
		got = append(got, m)
	}
	assert.NilError(s.T(), sc.Err())

	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[0]["digest"], "9f2c")
	assert.Equal(s.T(), got[0]["to_id"], float64(4187))
	assert.Equal(s.T(), got[0]["row_count"], float64(67))
	assert.Equal(s.T(), got[1]["digest"], "aa01")
}

// Reopening must not truncate: the file is the witness, and a restart that
// wiped it would erase exactly the history it exists to protect.
func (s *WriterSuite) TestReopenAppends() {
	path := filepath.Join(s.T().TempDir(), "digests.jsonl")

	w1, err := digest.Open(path)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), w1.Write(checkpoint(1, "one")))
	assert.NilError(s.T(), w1.Close())

	w2, err := digest.Open(path)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), w2.Write(checkpoint(2, "two")))
	assert.NilError(s.T(), w2.Close())

	b, err := os.ReadFile(path)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), len(b) > 0)

	lines := 0
	sc := bufio.NewScanner(bytes.NewReader(b))
	for sc.Scan() {
		lines++
	}
	assert.Equal(s.T(), lines, 2)
}

func (s *WriterSuite) TestMissingDirectoryIsAnError() {
	_, err := digest.Open(filepath.Join(s.T().TempDir(), "nope", "digests.jsonl"))

	assert.Assert(s.T(), err != nil)
}
```

Добавить в импорты теста `"bytes"` — он используется в `TestReopenAppends`.

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd backend/services/audit-service && go test ./internal/digest/ -v`
Expected: FAIL — пакет `digest` не существует.

- [ ] **Step 3: Реализовать**

Create `backend/services/audit-service/internal/digest/writer.go`:

```go
// Package digest witnesses journal checkpoints outside the database.
//
// A digest chain that lives only in Postgres protects against nobody: whoever
// can drop the append-only trigger can recompute the chain to match whatever
// they rewrote. The value is in a copy kept somewhere else — here an append-only
// JSONL file on a volume separate from the database, so a backup of one is not
// a backup of the other.
package digest

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Writer appends one JSON line per checkpoint.
type Writer struct {
	mu sync.Mutex
	f  *os.File
}

// line is the on-disk shape. Field names match audit_checkpoint's columns so a
// reader never has to translate between the two.
type line struct {
	At         time.Time `json:"at"`
	FromID     int64     `json:"from_id"`
	ToID       int64     `json:"to_id"`
	RowCount   int32     `json:"row_count"`
	Digest     string    `json:"digest"`
	PrevDigest string    `json:"prev_digest"`
}

// Open prepares the witness file. An empty path returns (nil, nil): the witness
// is optional, and a nil Writer still answers Write and Close, so callers stay
// free of a branch per tick.
//
// The file is opened for append and never truncated — a restart that wiped it
// would erase precisely the history it exists to protect. It is not created
// with its parent directories: a mistyped path must fail loudly at boot rather
// than silently witness into a directory nobody backs up.
func Open(path string) (*Writer, error) {
	if path == "" {
		return nil, nil
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("digest.Open %s: %w", path, err)
	}
	return &Writer{f: f}, nil
}

// Write appends one checkpoint and fsyncs it. One line every few minutes makes
// the sync free, and durability is the entire point of the file.
func (w *Writer) Write(c domain.Checkpoint) error {
	if w == nil {
		return nil
	}
	b, err := json.Marshal(line{
		At: c.At.UTC(), FromID: c.FromID, ToID: c.ToID,
		RowCount: c.RowCount, Digest: c.Digest, PrevDigest: c.PrevDigest,
	})
	if err != nil {
		return fmt.Errorf("digest.Write: marshal: %w", err)
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	if _, err := w.f.Write(append(b, '\n')); err != nil {
		return fmt.Errorf("digest.Write: %w", err)
	}
	if err := w.f.Sync(); err != nil {
		return fmt.Errorf("digest.Write: sync: %w", err)
	}
	return nil
}

// Close releases the file. Safe on a nil Writer.
func (w *Writer) Close() error {
	if w == nil {
		return nil
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.f.Close()
}
```

- [ ] **Step 4: Запустить тест, убедиться что проходит**

Run: `cd backend/services/audit-service && go test ./internal/digest/ -v`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/audit-service/internal/digest/
git commit -m "feat(audit): append-only JSONL witness for checkpoint digests"
```

---

### Task 4: Сервисный слой — один тик чекпоинта

**Files:**
- Modify: `backend/services/audit-service/internal/service/audit.go` (интерфейс `Store`)
- Create: `backend/services/audit-service/internal/service/checkpoint.go`
- Create: `backend/services/audit-service/internal/service/checkpoint_test.go`
- Modify: `backend/services/audit-service/internal/service/mocks/store_mock.go` (регенерация)

**Interfaces:**
- Consumes: методы хранилища из Task 2.
- Produces: `(*Service).Checkpoint(ctx) (domain.Checkpoint, error)` — один тик; Task 5 вызывает его по таймеру, Task 6 переиспользует `ComputeDigest` через тот же `Store`.

- [ ] **Step 1: Расширить интерфейс `Store`**

Modify `backend/services/audit-service/internal/service/audit.go` — добавить в интерфейс:

```go
// Store is the persistence contract.
type Store interface {
	List(ctx context.Context, f domain.Filter) ([]domain.Entry, error)
	DistinctActors(ctx context.Context, f domain.Filter) ([]string, error)
	Record(ctx context.Context, e domain.Entry) (int64, error)

	LastCheckpoint(ctx context.Context) (domain.Checkpoint, bool, error)
	SequenceWatermark(ctx context.Context) (int64, error)
	ComputeDigest(ctx context.Context, fromID, boundary int64, prev string) (int32, int64, string, error)
	SaveCheckpoint(ctx context.Context, c domain.Checkpoint) (domain.Checkpoint, error)
	ListCheckpoints(ctx context.Context) ([]domain.Checkpoint, error)
}
```

- [ ] **Step 2: Регенерировать мок**

Run: `cd backend/services/audit-service && go generate ./internal/service/...`
Expected: `internal/service/mocks/store_mock.go` перезаписан и содержит `LastCheckpointMock`, `SequenceWatermarkMock`, `ComputeDigestMock`, `SaveCheckpointMock`, `ListCheckpointsMock`.

Если `minimock` не установлен: `go install github.com/gojuno/minimock/v3/cmd/minimock@v3.4.7`.

- [ ] **Step 3: Написать падающий тест**

Create `backend/services/audit-service/internal/service/checkpoint_test.go`:

```go
package service_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service/mocks"
)

type CheckpointSuite struct {
	suite.Suite
	mc *minimock.Controller
}

func TestCheckpointSuite(t *testing.T) { suite.Run(t, new(CheckpointSuite)) }

func (s *CheckpointSuite) SetupTest() { s.mc = minimock.NewController(s.T()) }

func emptyDigest() string {
	sum := sha256.Sum256(nil)
	return hex.EncodeToString(sum[:])
}

// The first ever tick has nothing to digest — it only records where the journal
// stood, so the next tick has a boundary it can trust.
func (s *CheckpointSuite) TestFirstTickSeedsWithoutDigesting() {
	store := mocks.NewStoreMock(s.mc).
		SequenceWatermarkMock.Return(42, nil).
		LastCheckpointMock.Return(domain.Checkpoint{}, false, nil).
		SaveCheckpointMock.Set(func(_ context.Context, c domain.Checkpoint) (domain.Checkpoint, error) {
			assert.Equal(s.T(), c.FromID, int64(0))
			assert.Equal(s.T(), c.ToID, int64(0))
			assert.Equal(s.T(), c.Watermark, int64(42))
			assert.Equal(s.T(), c.RowCount, int32(0))
			assert.Equal(s.T(), c.Digest, emptyDigest())
			assert.Equal(s.T(), c.PrevDigest, "")
			c.ID = 1
			return c, nil
		})
	// ComputeDigest has no expectation: minimock fails the test if it is called.

	got, err := service.New(store).Checkpoint(s.T().Context())

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.ID, int64(1))
}

// The boundary is the PREVIOUS checkpoint's watermark, not the one read now.
// Reading the fresh watermark and digesting up to it would cover ids that
// in-flight transactions are still holding.
func (s *CheckpointSuite) TestBoundaryComesFromThePreviousWatermark() {
	prev := domain.Checkpoint{ToID: 100, Watermark: 150, Digest: "prevdigest"}
	store := mocks.NewStoreMock(s.mc).
		SequenceWatermarkMock.Return(220, nil).
		LastCheckpointMock.Return(prev, true, nil).
		ComputeDigestMock.Set(func(_ context.Context, from, boundary int64, p string) (int32, int64, string, error) {
			assert.Equal(s.T(), from, int64(100))
			assert.Equal(s.T(), boundary, int64(150), "boundary must be the previous watermark, not 220")
			assert.Equal(s.T(), p, "prevdigest")
			return 7, 148, "newdigest", nil
		}).
		SaveCheckpointMock.Set(func(_ context.Context, c domain.Checkpoint) (domain.Checkpoint, error) {
			assert.Equal(s.T(), c.FromID, int64(100))
			assert.Equal(s.T(), c.ToID, int64(148))
			assert.Equal(s.T(), c.Watermark, int64(220))
			assert.Equal(s.T(), c.RowCount, int32(7))
			assert.Equal(s.T(), c.Digest, "newdigest")
			assert.Equal(s.T(), c.PrevDigest, "prevdigest")
			return c, nil
		})

	_, err := service.New(store).Checkpoint(s.T().Context())

	assert.NilError(s.T(), err)
}

// A quiet interval still writes a checkpoint: skipping it would leave the chain
// with a silent hole that verify could not tell from a deletion.
func (s *CheckpointSuite) TestQuietIntervalStillChains() {
	prev := domain.Checkpoint{ToID: 100, Watermark: 100, Digest: "prevdigest"}
	store := mocks.NewStoreMock(s.mc).
		SequenceWatermarkMock.Return(100, nil).
		LastCheckpointMock.Return(prev, true, nil).
		ComputeDigestMock.Return(0, 100, "samerange", nil).
		SaveCheckpointMock.Set(func(_ context.Context, c domain.Checkpoint) (domain.Checkpoint, error) {
			assert.Equal(s.T(), c.RowCount, int32(0))
			assert.Equal(s.T(), c.FromID, c.ToID)
			assert.Equal(s.T(), c.PrevDigest, "prevdigest")
			return c, nil
		})

	_, err := service.New(store).Checkpoint(s.T().Context())

	assert.NilError(s.T(), err)
}
```

- [ ] **Step 4: Запустить тест, убедиться что падает**

Run: `cd backend/services/audit-service && go test ./internal/service/ -run TestCheckpointSuite`
Expected: FAIL — `svc.Checkpoint undefined`.

- [ ] **Step 5: Реализовать**

Create `backend/services/audit-service/internal/service/checkpoint.go`:

```go
package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Checkpoint seals everything the journal has settled since the last tick and
// appends one chained digest.
//
// The boundary is the PREVIOUS checkpoint's watermark, never the one read now.
// audit_log's sequence hands out ids at INSERT, so an id may exist inside a
// transaction that has not committed and is therefore invisible here. A
// watermark one tick old is past every such id: the transactions alive when it
// was taken have since committed or rolled back. Digesting up to a freshly read
// watermark would cover ids still in flight, and each one landing afterwards
// would look to verify like a forged insertion.
//
// ponytail: the tick interval must exceed the longest write transaction.
// Mutations here are single-statement upserts and the default is 5m, which is
// generous. A longer transaction produces a false alarm from verify, never a
// missed forgery — the failure leans safe. Upgrade path: derive the boundary
// from pg_snapshot_xmin(pg_current_snapshot()) if long write transactions ever
// appear.
//
// The first tick digests nothing. It records where the journal stood so the
// next tick has a boundary, and the seed digest is SHA-256 of the empty string.
func (s *Service) Checkpoint(ctx context.Context) (domain.Checkpoint, error) {
	watermark, err := s.store.SequenceWatermark(ctx)
	if err != nil {
		return domain.Checkpoint{}, err
	}

	prev, ok, err := s.store.LastCheckpoint(ctx)
	if err != nil {
		return domain.Checkpoint{}, err
	}
	if !ok {
		sum := sha256.Sum256(nil)
		return s.store.SaveCheckpoint(ctx, domain.Checkpoint{
			Watermark: watermark,
			Digest:    hex.EncodeToString(sum[:]),
		})
	}

	rowCount, toID, dg, err := s.store.ComputeDigest(ctx, prev.ToID, prev.Watermark, prev.Digest)
	if err != nil {
		return domain.Checkpoint{}, fmt.Errorf("audit.Checkpoint: %w", err)
	}

	return s.store.SaveCheckpoint(ctx, domain.Checkpoint{
		FromID:     prev.ToID,
		ToID:       toID,
		Watermark:  watermark,
		RowCount:   rowCount,
		Digest:     dg,
		PrevDigest: prev.Digest,
	})
}
```

- [ ] **Step 6: Запустить тест, убедиться что проходит**

Run: `cd backend/services/audit-service && go test ./internal/service/ -run TestCheckpointSuite -v`
Expected: PASS, 3 теста.

- [ ] **Step 7: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/audit-service/internal/service/
git commit -m "feat(audit): checkpoint tick sealing settled journal ranges"
```

---

### Task 5: Проводка — конфиг, тикер, образ, compose

**Files:**
- Modify: `backend/services/audit-service/internal/config/config.go`
- Modify: `backend/services/audit-service/cmd/audit/main.go:36-42`
- Create: `backend/services/audit-service/internal/bootstrap/checkpointer.go`
- Modify: `backend/services/audit-service/internal/bootstrap/serve.go`
- Modify: `backend/services/audit-service/internal/bootstrap/service.go`
- Modify: `backend/services/audit-service/Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `(*Service).Checkpoint` (Task 4), `digest.Open/Write/Close` (Task 3).
- Produces: `bootstrap.RunCheckpointer(ctx, svc *service.Service, w *digest.Writer, every time.Duration, logger *slog.Logger)` — блокирующий цикл для горутины; `InitService` дополнительно возвращает `*service.Service`.

- [ ] **Step 1: Добавить настройки**

Modify `backend/services/audit-service/internal/config/config.go` — в структуру `Config`:

```go
	AutoMigrate        bool          `mapstructure:"auto-migrate"`
	CheckpointInterval time.Duration `mapstructure:"checkpoint-interval"`
	DigestFile         string        `mapstructure:"digest-file"`
	ShutdownTimeout    time.Duration `mapstructure:"shutdown-timeout"`
```

и в `Load`, рядом с остальными дефолтами:

```go
	v.SetDefault("checkpoint-interval", 5*time.Minute)
	v.SetDefault("digest-file", "")
```

- [ ] **Step 2: Добавить флаги**

Modify `backend/services/audit-service/cmd/audit/main.go` — в блок `flags`:

```go
	flags.Duration("checkpoint-interval", 5*time.Minute, "how often to seal a journal checkpoint; 0 disables")
	flags.String("digest-file", "", "append-only JSONL witness for checkpoint digests (or set AUDIT_DIGEST_FILE)")
```

- [ ] **Step 3: Написать цикл тикера**

Create `backend/services/audit-service/internal/bootstrap/checkpointer.go`:

```go
package bootstrap

import (
	"context"
	"log/slog"
	"time"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
)

// RunCheckpointer seals a checkpoint every `every` and witnesses it twice: once
// in the service log under a stable key, once in the JSONL file. It blocks
// until ctx is done; run it in a goroutine.
//
// A zero interval disables checkpointing entirely — useful for a deployment
// that has not provisioned the witness volume yet.
//
// A failed witness write does NOT undo the checkpoint. The chain in Postgres
// stays whole, and a gap in the file is itself detectable by `audit verify
// --digest-file`. Losing the checkpoint instead would break the chain, which is the
// worse of the two.
func RunCheckpointer(
	ctx context.Context, svc *service.Service, w *digest.Writer,
	every time.Duration, logger *slog.Logger,
) {
	if every <= 0 {
		logger.Info("audit: checkpointing disabled")
		return
	}
	logger.Info("audit: checkpointing every", "interval", every.String())

	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			c, err := svc.Checkpoint(ctx)
			if err != nil {
				logger.Error("audit: checkpoint failed", "err", err)
				continue
			}
			logger.Info("audit: checkpoint",
				"from_id", c.FromID, "to_id", c.ToID,
				"row_count", c.RowCount, "digest", c.Digest)
			if err := w.Write(c); err != nil {
				metricDigestWriteFailures.Inc()
				logger.Error("audit: digest witness write failed", "err", err, "to_id", c.ToID)
			}
		}
	}
}
```

`metricDigestWriteFailures` объявляется в Task 7. До неё эта строка не скомпилируется — поэтому Step 4 объявляет счётчик здесь же, а Task 7 добавляет к нему два gauge.

- [ ] **Step 4: Объявить счётчик неудачных записей свидетельства**

Create `backend/services/audit-service/internal/bootstrap/metrics.go`:

```go
package bootstrap

import (
	"github.com/prometheus/client_golang/prometheus"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

// A failed witness write leaves the digest only in Postgres, where it protects
// against nobody who can edit Postgres. It is a silent degradation of the whole
// point of checkpointing, so it gets its own alertable counter rather than
// living in the logs alone.
var metricDigestWriteFailures = prometheus.NewCounter(prometheus.CounterOpts{
	Name: "audit_digest_write_failures_total",
	Help: "Checkpoint digests that could not be appended to the witness file.",
})

func init() { metrics.Registry.MustRegister(metricDigestWriteFailures) }
```

- [ ] **Step 5: Отдать сервис наружу из `InitService`**

Modify `backend/services/audit-service/internal/bootstrap/service.go`:

```go
// InitService wires storage → service → gRPC handler. It hands back the store
// so RunServe can attach capture triggers, and the service so the checkpointer
// can tick against the same instance.
func InitService(pool *pgxpool.Pool) (*grpcapi.Server, *storage.PG, *service.Service) {
	store := storage.New(pool)
	svc := service.New(store)
	return grpcapi.New(svc), store, svc
}
```

- [ ] **Step 6: Запустить тикер в `RunServe`**

Modify `backend/services/audit-service/internal/bootstrap/serve.go`:

Заменить строку `handler, store := InitService(pool)` на:

```go
	handler, store, svc := InitService(pool)

	witness, err := digest.Open(cfg.DigestFile)
	if err != nil {
		return fmt.Errorf("open digest witness: %w", err)
	}
	defer func() { _ = witness.Close() }()
```

и после блока `logger.Info("audit: capture triggers ensured", ...)` добавить:

```go
	go RunCheckpointer(rootCtx, svc, witness, cfg.CheckpointInterval, logger)
```

Добавить в импорты: `"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"`.

- [ ] **Step 7: Собрать и прогнать тесты**

Run: `cd backend/services/audit-service && go build ./... && go test ./...`
Expected: PASS.

- [ ] **Step 8: Предсоздать каталог свидетельства в образе**

Modify `backend/services/audit-service/Dockerfile`.

В build-стадии, после шага `go build`:

```dockerfile
# The runtime image is distroless: no shell, so the witness directory cannot be
# created there. Staging it here lets COPY --chown place it with the right owner.
RUN mkdir -p /out/varaudit
```

В runtime-стадии, между `COPY --from=build /out/audit /audit` и `USER`:

```dockerfile
# Named volumes initialise from the image, so /var/audit must already exist and
# belong to nonroot — otherwise the volume mounts root-owned and the service
# cannot write its witness. Same trap the mesh-worker hit with blob-data.
COPY --from=build --chown=nonroot:nonroot /out/varaudit /var/audit
```

- [ ] **Step 9: Прописать том и переменные в compose**

Modify `docker-compose.yml`.

В сервис `audit`, в `environment`:

```yaml
      AUDIT_CHECKPOINT_INTERVAL: "5m"
      AUDIT_DIGEST_FILE: "/var/audit/digests.jsonl"
```

В сервис `audit`, после `environment`:

```yaml
    volumes:
      # Deliberately a different volume from postgres-data: the witness is only
      # worth having if a backup of the database is not also a backup of the
      # digests that would expose the database being rewritten.
      - audit-digest:/var/audit
```

В блок `volumes:` внизу файла добавить `audit-digest:`.

- [ ] **Step 10: Проверить вживую**

```bash
cd /Users/vbncursed/programming/rosneft
docker compose up -d --build audit
sleep 20
docker compose logs audit | grep "audit: checkpointing every"
AUDIT_CHECKPOINT_INTERVAL=10s docker compose up -d audit && sleep 30
docker compose exec audit cat /var/audit/digests.jsonl | head -3
```

Expected: лог показывает интервал; файл содержит хотя бы одну JSON-строку с `digest`.

Вернуть интервал: `docker compose up -d audit`.

- [ ] **Step 11: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/audit-service/ docker-compose.yml
git commit -m "feat(audit): run the checkpointer and witness digests to a volume"
```

---

### Task 6: Проверка цепочки — `audit verify`

**Files:**
- Create: `backend/services/audit-service/internal/domain/verify.go`
- Create: `backend/services/audit-service/internal/service/verify.go`
- Create: `backend/services/audit-service/internal/digest/read.go`
- Create: `backend/services/audit-service/internal/bootstrap/verify.go`
- Modify: `backend/services/audit-service/cmd/audit/main.go`
- Create: `backend/services/audit-service/internal/service/verify_test.go`
- Create: `backend/services/audit-service/internal/migrate/verify_integration_test.go`

**Interfaces:**
- Consumes: `Store.ListCheckpoints`, `Store.ComputeDigest` (Task 2/4); `digest.Writer` line shape (Task 3).
- Produces:
  - `domain.VerifyResult{Checked int; OK bool; FailedID int64; Reason string}`
  - `(*Service).Verify(ctx, witnessed map[int64]string) (domain.VerifyResult, error)` — ключ карты `to_id`, значение `digest`; `nil` отключает сверку с файлом
  - `digest.ReadFile(path string) (map[int64]string, error)`
  - `bootstrap.RunVerify(ctx, cfg) error`

- [ ] **Step 1: Написать доменный тип результата**

Create `backend/services/audit-service/internal/domain/verify.go`:

```go
package domain

// VerifyResult is the outcome of recomputing the checkpoint chain.
//
// FailedID names the checkpoint that did not reproduce; Reason says how. Only
// the first failure is reported: past it every later checkpoint fails too,
// because the chain folds its predecessor in, and a wall of derived failures
// would bury the one that matters.
type VerifyResult struct {
	Checked  int
	OK       bool
	FailedID int64
	Reason   string
}
```

- [ ] **Step 2: Написать падающий юнит-тест**

Create `backend/services/audit-service/internal/service/verify_test.go`:

```go
package service_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service/mocks"
)

type VerifySuite struct {
	suite.Suite
	mc *minimock.Controller
}

func TestVerifySuite(t *testing.T) { suite.Run(t, new(VerifySuite)) }

func (s *VerifySuite) SetupTest() { s.mc = minimock.NewController(s.T()) }

// Seed (id 1) plus one sealed range (id 2). The seed digests nothing, so verify
// must skip recomputing it and only check what follows.
func chain() []domain.Checkpoint {
	return []domain.Checkpoint{
		{ID: 1, FromID: 0, ToID: 0, Watermark: 10, Digest: "seed", PrevDigest: ""},
		{ID: 2, FromID: 0, ToID: 9, Watermark: 30, RowCount: 9, Digest: "good", PrevDigest: "seed"},
	}
}

func (s *VerifySuite) TestIntactChainPasses() {
	store := mocks.NewStoreMock(s.mc).
		ListCheckpointsMock.Return(chain(), nil).
		ComputeDigestMock.Return(9, 9, "good", nil)

	got, err := service.New(store).Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, true)
	assert.Equal(s.T(), got.Checked, 2)
}

// Rows were edited: the range no longer folds to the stored digest.
func (s *VerifySuite) TestEditedRowsAreCaught() {
	store := mocks.NewStoreMock(s.mc).
		ListCheckpointsMock.Return(chain(), nil).
		ComputeDigestMock.Return(9, 9, "different", nil)

	got, err := service.New(store).Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, false)
	assert.Equal(s.T(), got.FailedID, int64(2))
	assert.Assert(s.T(), got.Reason != "")
}

// A checkpoint was swapped out: its PrevDigest no longer names its predecessor.
func (s *VerifySuite) TestBrokenLinkIsCaught() {
	broken := chain()
	broken[1].PrevDigest = "unrelated"
	store := mocks.NewStoreMock(s.mc).
		ListCheckpointsMock.Return(broken, nil)
	// ComputeDigest has no expectation: the link is checked first, and once it
	// fails there is nothing worth recomputing.

	got, err := service.New(store).Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, false)
	assert.Equal(s.T(), got.FailedID, int64(2))
}

// The database was rewritten consistently — chain and all — but the witness on
// the other volume still holds what was sealed at the time.
func (s *VerifySuite) TestWitnessDisagreementIsCaught() {
	store := mocks.NewStoreMock(s.mc).
		ListCheckpointsMock.Return(chain(), nil).
		ComputeDigestMock.Return(9, 9, "good", nil)

	got, err := service.New(store).Verify(s.T().Context(), map[int64]string{9: "what-was-witnessed"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, false)
	assert.Equal(s.T(), got.FailedID, int64(2))
}

// A witness that simply has not seen a checkpoint yet is not evidence of
// tampering — the file is written after the row is committed.
func (s *VerifySuite) TestMissingWitnessLineIsNotAFailure() {
	store := mocks.NewStoreMock(s.mc).
		ListCheckpointsMock.Return(chain(), nil).
		ComputeDigestMock.Return(9, 9, "good", nil)

	got, err := service.New(store).Verify(s.T().Context(), map[int64]string{})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, true)
}

func (s *VerifySuite) TestEmptyChainPasses() {
	store := mocks.NewStoreMock(s.mc).ListCheckpointsMock.Return(nil, nil)

	got, err := service.New(store).Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, true)
	assert.Equal(s.T(), got.Checked, 0)
}
```

- [ ] **Step 3: Запустить тест, убедиться что падает**

Run: `cd backend/services/audit-service && go test ./internal/service/ -run TestVerifySuite`
Expected: FAIL — `svc.Verify undefined`.

- [ ] **Step 4: Реализовать `Verify`**

Create `backend/services/audit-service/internal/service/verify.go`:

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Verify recomputes the checkpoint chain and, when witnessed is non-nil, checks
// it against the digests recorded outside the database.
//
// The witness is what makes this worth running. Recomputation alone catches a
// careless forger — someone who edited audit_log and left the digests behind.
// It cannot catch one who edited the rows and recomputed the chain, because
// both live in the same database under the same credentials. The file on the
// other volume is the copy they would also have to reach.
//
// A checkpoint the witness has not seen is not a failure: the file is appended
// after the row commits, so the newest checkpoint is legitimately absent for a
// moment, and a witness disabled for part of the journal's life leaves a
// permanent, harmless gap.
//
// The seed checkpoint (the first row, which digests nothing) is walked for its
// link but not recomputed — there is no range under it.
func (s *Service) Verify(ctx context.Context, witnessed map[int64]string) (domain.VerifyResult, error) {
	all, err := s.store.ListCheckpoints(ctx)
	if err != nil {
		return domain.VerifyResult{}, err
	}

	res := domain.VerifyResult{OK: true, Checked: len(all)}
	for i, c := range all {
		if i > 0 && c.PrevDigest != all[i-1].Digest {
			return fail(res, c.ID, fmt.Sprintf(
				"chain broken: prev_digest %q does not match checkpoint %d digest %q",
				c.PrevDigest, all[i-1].ID, all[i-1].Digest)), nil
		}
		if i == 0 {
			continue
		}

		_, _, got, err := s.store.ComputeDigest(ctx, c.FromID, c.ToID, c.PrevDigest)
		if err != nil {
			return domain.VerifyResult{}, fmt.Errorf("audit.Verify: checkpoint %d: %w", c.ID, err)
		}
		if got != c.Digest {
			return fail(res, c.ID, fmt.Sprintf(
				"rows in (%d, %d] no longer digest to %q (got %q)",
				c.FromID, c.ToID, c.Digest, got)), nil
		}

		if witnessed == nil {
			continue
		}
		if w, seen := witnessed[c.ToID]; seen && w != c.Digest {
			return fail(res, c.ID, fmt.Sprintf(
				"witness disagrees at to_id %d: file has %q, database has %q",
				c.ToID, w, c.Digest)), nil
		}
	}
	return res, nil
}

// fail stamps the first failure onto the result. Later checkpoints fold this
// one in and would all fail too; reporting them would bury the cause.
func fail(res domain.VerifyResult, id int64, reason string) domain.VerifyResult {
	res.OK = false
	res.FailedID = id
	res.Reason = reason
	return res
}
```

- [ ] **Step 5: Реализовать чтение файла свидетельств**

Create `backend/services/audit-service/internal/digest/read.go`:

```go
package digest

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

// ReadFile loads the witness into a to_id → digest map.
//
// Later lines win: a checkpoint written twice (a restart mid-tick, a replayed
// range) is not corruption, and the last word is the one the database ended up
// agreeing with.
func ReadFile(path string) (map[int64]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("digest.ReadFile %s: %w", path, err)
	}
	defer f.Close()

	out := make(map[int64]string)
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 4096), 1<<20)
	for n := 1; sc.Scan(); n++ {
		var l line
		if err := json.Unmarshal(sc.Bytes(), &l); err != nil {
			return nil, fmt.Errorf("digest.ReadFile %s: line %d: %w", path, n, err)
		}
		out[l.ToID] = l.Digest
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("digest.ReadFile %s: %w", path, err)
	}
	return out, nil
}
```

- [ ] **Step 6: Подключить подкоманду**

Create `backend/services/audit-service/internal/bootstrap/verify.go`:

```go
package bootstrap

import (
	"context"
	"errors"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
)

// ErrJournalTampered is returned when the chain does not reproduce. main maps
// it to a non-zero exit status so a cron or a CI step notices without parsing
// output.
var ErrJournalTampered = errors.New("audit journal failed verification")

// RunVerify recomputes the checkpoint chain, optionally against the witness
// file named by AUDIT_DIGEST_FILE.
func RunVerify(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)

	pool, err := InitPostgres(ctx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	var witnessed map[int64]string
	if cfg.DigestFile != "" {
		witnessed, err = digest.ReadFile(cfg.DigestFile)
		if err != nil {
			return err
		}
		logger.Info("audit: witness loaded", "path", cfg.DigestFile, "lines", len(witnessed))
	} else {
		logger.Warn("audit: no witness file configured; recomputation alone cannot catch a forger who also recomputed the chain")
	}

	_, _, svc := InitService(pool)
	res, err := svc.Verify(ctx, witnessed)
	if err != nil {
		return err
	}
	if !res.OK {
		logger.Error("audit: verification failed",
			"checkpoint_id", res.FailedID, "reason", res.Reason, "checked", res.Checked)
		return fmt.Errorf("%w: checkpoint %d: %s", ErrJournalTampered, res.FailedID, res.Reason)
	}
	logger.Info("audit: verification passed", "checkpoints", res.Checked)
	return nil
}
```

Modify `backend/services/audit-service/cmd/audit/main.go` — в `cmd.AddCommand(...)`:

```go
		subCmd("verify", "Recompute the checkpoint chain and compare it to the witness", bootstrap.RunVerify),
```

- [ ] **Step 7: Запустить юнит-тесты**

Run: `cd backend/services/audit-service && go test ./internal/service/ ./internal/digest/ -v`
Expected: PASS.

- [ ] **Step 8: Написать интеграционный тест на настоящую подделку**

Create `backend/services/audit-service/internal/migrate/verify_integration_test.go`:

```go
//go:build integration

package migrate_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
)

// VerifySuite exercises the one thing the unit tests cannot: a forger who drops
// the append-only trigger, edits the journal, and puts the trigger back.
type VerifySuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	svc  *service.Service
}

func TestVerifyIntegrationSuite(t *testing.T) { suite.Run(t, new(VerifySuite)) }

func (s *VerifySuite) SetupSuite() {
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
	s.svc = service.New(storage.New(s.pool))
}

func (s *VerifySuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// Two ticks with journal activity between them: the first seeds the watermark,
// the second seals everything written before it.
func (s *VerifySuite) sealSomeHistory() {
	ctx := s.T().Context()
	_, err := s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)

	for _, a := range []string{"auth.login", "auth.logout", "auth.password_change"} {
		_, err := s.svc.Record(ctx, domain.Entry{Action: a, Entity: "auth", Result: "ok"})
		assert.NilError(s.T(), err)
	}

	_, err = s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)
	c, err := s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), c.RowCount > 0, "nothing was sealed; the boundary did not advance")
}

// The forger's full move: drop the guard, rewrite a row, put the guard back.
func (s *VerifySuite) forgeRow() {
	ctx := s.T().Context()
	for _, q := range []string{
		`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_mutate`,
		`UPDATE audit_log SET action = 'auth.nothing_happened' WHERE id = (SELECT min(id) FROM audit_log)`,
		`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_mutate`,
	} {
		_, err := s.pool.Exec(ctx, q)
		assert.NilError(s.T(), err, q)
	}
}

func (s *VerifySuite) TestIntactJournalVerifies() {
	s.sealSomeHistory()

	res, err := s.svc.Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, true, res.Reason)
}

func (s *VerifySuite) TestEditedRowIsCaught() {
	s.sealSomeHistory()
	s.forgeRow()

	res, err := s.svc.Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, false)
	assert.Assert(s.T(), res.FailedID > 0)
}

func (s *VerifySuite) TestDeletedRowIsCaught() {
	s.sealSomeHistory()
	ctx := s.T().Context()
	for _, q := range []string{
		`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_mutate`,
		`DELETE FROM audit_log WHERE id = (SELECT min(id) FROM audit_log)`,
		`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_mutate`,
	} {
		_, err := s.pool.Exec(ctx, q)
		assert.NilError(s.T(), err, q)
	}

	res, err := s.svc.Verify(ctx, nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, false)
}

// The forger rewrote the rows AND recomputed the chain, so the database agrees
// with itself. Only the witness on the other volume still disagrees.
func (s *VerifySuite) TestWitnessCatchesARecomputedChain() {
	s.sealSomeHistory()
	ctx := s.T().Context()

	before, err := s.svc.Verify(ctx, nil)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), before.OK, true, before.Reason)

	all, err := storage.New(s.pool).ListCheckpoints(ctx)
	assert.NilError(s.T(), err)
	sealed := all[len(all)-1]

	witnessed := map[int64]string{sealed.ToID: "what-the-file-recorded"}

	res, err := s.svc.Verify(ctx, witnessed)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, false)
	assert.Assert(s.T(), res.Reason != "")
}

// A transaction opened before a tick and committed after it must not read as a
// forgery — that is the entire reason the boundary comes from the watermark.
func (s *VerifySuite) TestLateCommitDoesNotFalselyAlarm() {
	ctx := s.T().Context()
	_, err := s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)

	tx, err := s.pool.Begin(ctx)
	assert.NilError(s.T(), err)
	_, err = tx.Exec(ctx, `INSERT INTO audit_log (action, entity, result) VALUES ('auth.login','auth','ok')`)
	assert.NilError(s.T(), err)

	// Tick while the row above is holding an id nobody can see.
	_, err = s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), tx.Commit(ctx))

	_, err = s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)
	_, err = s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)

	res, err := s.svc.Verify(ctx, nil)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, true, res.Reason)
}
```

Тест наполняет журнал через `s.svc.Record` — существующий метод сервиса (`internal/service/record.go`, сигнатура `Record(ctx, domain.Entry) (int64, error)`). Это единственный писатель, которому не нужна бизнес-таблица.

- [ ] **Step 9: Запустить интеграционные тесты**

Run: `cd backend/services/audit-service && go test -tags=integration ./internal/migrate/ -run TestVerifyIntegrationSuite -v`
Expected: PASS, 5 тестов.

- [ ] **Step 10: Проверить CLI вживую**

```bash
cd /Users/vbncursed/programming/rosneft
docker compose exec audit /audit verify
```

Expected: `audit: verification passed` и код возврата 0.

- [ ] **Step 11: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/audit-service/
git commit -m "feat(audit): verify the checkpoint chain against the witness file"
```

---

### Task 7: Метрика роста журнала и правила алертов

**Files:**
- Create: `backend/services/audit-service/internal/storage/table_stats.go`
- Modify: `backend/services/audit-service/internal/service/audit.go` (интерфейс `Store`)
- Create: `backend/services/audit-service/internal/service/table_stats.go`
- Modify: `backend/services/audit-service/internal/bootstrap/metrics.go`
- Modify: `backend/services/audit-service/internal/bootstrap/checkpointer.go`
- Modify: `ops/prometheus/rules.yml`
- Modify: `backend/services/audit-service/internal/service/mocks/store_mock.go` (регенерация)

**Interfaces:**
- Consumes: тик из Task 5.
- Produces: `(*PG).TableStats(ctx) (rows, bytes int64, err error)`; `(*Service).TableStats(ctx) (int64, int64, error)`; метрики `audit_log_rows`, `audit_log_bytes`.

- [ ] **Step 1: Реализовать запрос статистики**

Create `backend/services/audit-service/internal/storage/table_stats.go`:

```go
package storage

import (
	"context"
	"fmt"
)

// TableStats reports the journal's size for the growth alert.
//
// The row count is reltuples — the planner's estimate, refreshed by ANALYZE —
// not count(*). An exact count is a sequential scan, and running one every tick
// on the table that only ever grows is a strange way to find out that it grows.
// The alert fires on orders of magnitude, where an estimate is plenty.
// greatest(...,0) covers a table that has never been analysed, where reltuples
// is -1.
func (r *PG) TableStats(ctx context.Context) (rows, bytes int64, err error) {
	const q = `
		SELECT greatest(c.reltuples, 0)::bigint, pg_total_relation_size(c.oid)
		FROM pg_class c WHERE c.oid = 'audit_log'::regclass`

	if err := r.pool.QueryRow(ctx, q).Scan(&rows, &bytes); err != nil {
		return 0, 0, fmt.Errorf("storage.TableStats: %w", err)
	}
	return rows, bytes, nil
}
```

- [ ] **Step 2: Пробросить через сервис**

Modify `backend/services/audit-service/internal/service/audit.go` — добавить в интерфейс `Store`:

```go
	TableStats(ctx context.Context) (rows, bytes int64, err error)
```

Create `backend/services/audit-service/internal/service/table_stats.go`:

```go
package service

import "context"

// TableStats exposes the journal's size so the checkpointer can publish it.
// It is a pass-through: there is no policy to apply, and the alert threshold
// lives in Prometheus where it can change without a deploy.
func (s *Service) TableStats(ctx context.Context) (rows, bytes int64, err error) {
	return s.store.TableStats(ctx)
}
```

- [ ] **Step 3: Регенерировать мок**

Run: `cd backend/services/audit-service && go generate ./internal/service/...`
Expected: мок содержит `TableStatsMock`.

- [ ] **Step 4: Объявить метрики**

Modify `backend/services/audit-service/internal/bootstrap/metrics.go` — добавить:

```go
// The journal has no retention policy: it is kept forever, on purpose. These
// two exist so "forever" is a decision that gets revisited on evidence rather
// than on the day the disk fills.
var (
	metricJournalRows = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "audit_log_rows",
		Help: "Estimated rows in audit_log (planner statistics, not an exact count).",
	})
	metricJournalBytes = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "audit_log_bytes",
		Help: "Total on-disk size of audit_log including indexes and TOAST.",
	})
)
```

и расширить `init`:

```go
func init() {
	metrics.Registry.MustRegister(metricDigestWriteFailures, metricJournalRows, metricJournalBytes)
}
```

- [ ] **Step 5: Обновлять метрики на том же тике**

Modify `backend/services/audit-service/internal/bootstrap/checkpointer.go` — внутри `case <-t.C:`, после блока записи свидетельства:

```go
			// Same tick, same connection pool: the size gauges cost one extra
			// query every few minutes and need no schedule of their own.
			if rows, bytes, err := svc.TableStats(ctx); err != nil {
				logger.Warn("audit: table stats unavailable", "err", err)
			} else {
				metricJournalRows.Set(float64(rows))
				metricJournalBytes.Set(float64(bytes))
			}
```

- [ ] **Step 6: Добавить правила Prometheus**

Modify `ops/prometheus/rules.yml` — в конец списка `rules:`:

```yaml
      - alert: AuditJournalGrowth
        expr: audit_log_bytes > 5e9
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Audit journal above 5GB — revisit the keep-forever retention policy"

      - alert: AuditDigestWitnessFailing
        expr: increase(audit_digest_write_failures_total[15m]) > 0
        labels:
          severity: critical
        annotations:
          summary: "Checkpoint digests are not reaching the witness file; the journal's tamper evidence lives only in the database it protects"
```

- [ ] **Step 7: Проверить экспозицию метрик**

```bash
cd /Users/vbncursed/programming/rosneft
docker compose up -d --build audit
sleep 15
docker compose exec audit /audit verify >/dev/null 2>&1 || true
docker compose exec prometheus wget -qO- http://audit:9101/metrics | grep -E "audit_log_(rows|bytes)|audit_digest_write_failures"
```

Expected: три метрики присутствуют. `audit_log_*` появляются после первого тика — при интервале 5m подождать или временно выставить `AUDIT_CHECKPOINT_INTERVAL=10s`.

- [ ] **Step 8: Проверить, что Prometheus принял правила**

Run: `docker compose exec prometheus promtool check rules /etc/prometheus/rules.yml`
Expected: `SUCCESS` и число правил 10.

- [ ] **Step 9: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/audit-service/ ops/prometheus/rules.yml
git commit -m "feat(audit): publish journal size and alert on growth and witness failure"
```

---

### Task 8: Экспорт журнала — `audit export`

**Files:**
- Create: `backend/services/audit-service/internal/storage/export_before.go`
- Create: `backend/services/audit-service/internal/bootstrap/export.go`
- Modify: `backend/services/audit-service/internal/config/config.go`
- Modify: `backend/services/audit-service/cmd/audit/main.go`
- Create: `backend/services/audit-service/internal/migrate/export_integration_test.go`

**Interfaces:**
- Consumes: `storage.PG`, `entryColumns`/`scanEntry` из `queries.go`.
- Produces: `(*PG).ExportBefore(ctx, before time.Time, fn func(domain.Entry) error) error` — потоковый обход; `bootstrap.RunExport(ctx, cfg) error`.

> `ExportBefore` **не добавляется** в интерфейс `service.Store`, и мок не перегенерируется: у экспорта нет ни одного правила, которое стоило бы применить в сервисном слое, а метод в интерфейсе, которого никто не вызывает через сервис, — лишняя поверхность. `RunExport` обращается к `storage.New(pool)` напрямую.

- [ ] **Step 1: Написать падающий интеграционный тест**

Create `backend/services/audit-service/internal/migrate/export_integration_test.go`:

```go
//go:build integration

package migrate_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
)

type ExportSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *storage.PG
}

func TestExportSuite(t *testing.T) { suite.Run(t, new(ExportSuite)) }

func (s *ExportSuite) SetupSuite() {
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
	s.store = storage.New(s.pool)
}

func (s *ExportSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *ExportSuite) TestExportsOnlyRowsBeforeTheCutoff() {
	ctx := s.T().Context()

	_, err := s.pool.Exec(ctx, `
		INSERT INTO audit_log (at, action, entity, result) VALUES
			(now() - interval '10 days', 'auth.login', 'auth', 'ok'),
			(now() - interval '10 days', 'auth.logout', 'auth', 'ok'),
			(now(),                      'auth.login', 'auth', 'ok')`)
	assert.NilError(s.T(), err)

	var got []domain.Entry
	err = s.store.ExportBefore(ctx, time.Now().Add(-24*time.Hour), func(e domain.Entry) error {
		got = append(got, e)
		return nil
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 2)
	// Oldest first: an archive is read forwards.
	assert.Assert(s.T(), got[0].ID < got[1].ID)
}

// The callback's error must abort the walk — a full disk halfway through an
// export has to fail loudly, not produce a truncated archive that looks whole.
func (s *ExportSuite) TestCallbackErrorAborts() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		INSERT INTO audit_log (at, action, entity, result)
		VALUES (now() - interval '10 days', 'auth.login', 'auth', 'ok')`)
	assert.NilError(s.T(), err)

	boom := errors.New("disk full")
	err = s.store.ExportBefore(ctx, time.Now(), func(domain.Entry) error { return boom })

	assert.ErrorIs(s.T(), err, boom)
}
```

Добавить в импорты теста `"errors"`.

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd backend/services/audit-service && go test -tags=integration ./internal/migrate/ -run TestExportSuite`
Expected: FAIL — `s.store.ExportBefore undefined`.

- [ ] **Step 3: Реализовать обход**

Create `backend/services/audit-service/internal/storage/export_before.go`:

```go
package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// ExportBefore streams every entry older than `before` into fn, oldest first.
//
// Streaming rather than returning a slice: the point of the export is a journal
// too large to keep, so materialising it is the one thing the caller cannot
// afford. An error from fn aborts the walk — a truncated archive that looked
// complete would be worse than no archive.
//
// It deletes nothing. Removing rows would need the append-only trigger out of
// the way, and the only way to reclaim space without that is partitioning,
// which this system has deliberately not adopted.
func (r *PG) ExportBefore(ctx context.Context, before time.Time, fn func(domain.Entry) error) error {
	const q = `SELECT ` + entryColumns + ` FROM audit_log WHERE at < $1 ORDER BY id ASC`

	rows, err := r.pool.Query(ctx, q, before)
	if err != nil {
		return fmt.Errorf("storage.ExportBefore: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		e, scanErr := scanEntry(rows)
		if scanErr != nil {
			return fmt.Errorf("storage.ExportBefore: scan: %w", scanErr)
		}
		if err := fn(e); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("storage.ExportBefore: rows: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Добавить подкоманду**

Modify `backend/services/audit-service/internal/config/config.go` — в `Config`:

```go
	ExportBefore string `mapstructure:"before"`
	ExportOut    string `mapstructure:"out"`
```

и дефолты в `Load`:

```go
	v.SetDefault("before", "")
	v.SetDefault("out", "")
```

Create `backend/services/audit-service/internal/bootstrap/export.go`:

```go
package bootstrap

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
)

// RunExport writes every entry older than --before to --out as JSON Lines.
//
// It is the manual half of a retention policy whose automatic half does not
// exist on purpose: the journal is kept forever, and this is what an operator
// runs when the growth alert says forever has become expensive. Nothing is
// deleted here — deciding to delete is a separate, deliberate act.
func RunExport(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)

	if cfg.ExportBefore == "" || cfg.ExportOut == "" {
		return fmt.Errorf("export: --before (RFC3339 or YYYY-MM-DD) and --out are both required")
	}
	before, err := parseCutoff(cfg.ExportBefore)
	if err != nil {
		return err
	}

	pool, err := InitPostgres(ctx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	f, err := os.OpenFile(cfg.ExportOut, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("export: create %s: %w", cfg.ExportOut, err)
	}
	defer f.Close()

	bw := bufio.NewWriter(f)
	enc := json.NewEncoder(bw)
	n := 0
	err = storage.New(pool).ExportBefore(ctx, before, func(e domain.Entry) error {
		n++
		return enc.Encode(e)
	})
	if err != nil {
		return fmt.Errorf("export: %w", err)
	}
	if err := bw.Flush(); err != nil {
		return fmt.Errorf("export: flush: %w", err)
	}

	logger.Info("audit: export complete", "entries", n, "before", before.Format(time.RFC3339), "out", cfg.ExportOut)
	return nil
}

// parseCutoff accepts a bare date as well as a full timestamp: an operator
// archiving "everything before March" should not have to remember RFC3339.
func parseCutoff(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, fmt.Errorf("export: --before must be RFC3339 or YYYY-MM-DD, got %q", s)
	}
	return t, nil
}
```

Modify `backend/services/audit-service/cmd/audit/main.go`:

```go
	flags.String("before", "", "export: cutoff, RFC3339 or YYYY-MM-DD")
	flags.String("out", "", "export: destination JSONL file (must not exist)")
```

и в `cmd.AddCommand(...)`:

```go
		subCmd("export", "Write entries older than --before to --out as JSONL", bootstrap.RunExport),
```

- [ ] **Step 5: Запустить тесты**

Run: `cd backend/services/audit-service && go test -tags=integration ./internal/migrate/ -run TestExportSuite -v && go test ./...`
Expected: PASS.

- [ ] **Step 6: Проверить CLI вживую**

```bash
cd /Users/vbncursed/programming/rosneft
docker compose exec audit /audit export --before=2030-01-01 --out=/var/audit/archive.jsonl
docker compose exec audit sh -c 'wc -l /var/audit/archive.jsonl' 2>/dev/null || \
  docker compose exec audit /audit verify
```

Expected: `audit: export complete` с числом записей. У distroless нет шелла — проверять содержимое через `docker compose cp audit:/var/audit/archive.jsonl ./archive.jsonl`.

- [ ] **Step 7: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/audit-service/
git commit -m "feat(audit): stream entries older than a cutoff to JSONL"
```

---

### Task 9: Право `audit:read_own` в каталоге разрешений

**Files:**
- Create: `backend/services/auth-service/internal/migrate/migrations/00013_audit_read_own.sql`

**Interfaces:**
- Produces: разрешение `audit:read_own`, выданное ролям `editor` и `viewer`. Task 10 читает его из снимка прав принципала.

- [ ] **Step 1: Написать миграцию**

Create `backend/services/auth-service/internal/migrate/migrations/00013_audit_read_own.sql`:

```sql
-- +goose Up
-- +goose StatementBegin
-- Seeing what was done under your own account is not the same authority as
-- reading the company's history: audit:read stays with the Company Owner, this
-- one narrows the journal to the caller's own actions. The gateway's AuditScope
-- pins the actor; the permission only opens the door.
--
-- guest is deliberately left out: a guest barely acts, and the page would be
-- empty for them.
INSERT INTO permissions (slug, description)
VALUES ('audit:read_own', 'read your own actions in the audit journal');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug = 'audit:read_own'
WHERE r.slug IN ('editor', 'viewer');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions WHERE permission_id =
    (SELECT id FROM permissions WHERE slug = 'audit:read_own');
DELETE FROM permissions WHERE slug = 'audit:read_own';
-- +goose StatementEnd
```

- [ ] **Step 2: Применить и проверить**

```bash
cd /Users/vbncursed/programming/rosneft
docker compose up -d --build auth
sleep 10
docker compose exec postgres psql -U andrey -d andrey -c \
  "SELECT r.slug FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE p.slug='audit:read_own' ORDER BY r.slug;"
```

Expected: две строки — `editor`, `viewer`.

- [ ] **Step 3: Проверить откат**

```bash
docker compose exec auth /auth migrate-down
docker compose exec postgres psql -U andrey -d andrey -c \
  "SELECT count(*) FROM permissions WHERE slug='audit:read_own';"
docker compose exec auth /auth migrate-up
```

Expected: после отката `0`, после повторного применения миграция проходит без ошибок.

- [ ] **Step 4: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/auth-service/internal/migrate/migrations/00013_audit_read_own.sql
git commit -m "feat(auth): grant editor and viewer audit:read_own"
```

---

### Task 10: Шлюз — третий режим скоупа

**Files:**
- Create: `backend/services/gateway-service/internal/domain/audit_scope.go`
- Modify: `backend/services/gateway-service/internal/service/audit_scope.go`
- Modify: `backend/services/gateway-service/internal/service/audit.go`
- Modify: `backend/services/gateway-service/internal/service/audit_actors.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit_csv.go:53`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/route_permissions.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/principal.go`
- Modify: `backend/services/gateway-service/internal/service/audit_scope_test.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/route_permissions_test.go`

**Interfaces:**
- Consumes: разрешение `audit:read_own` (Task 9).
- Produces:
  - `domain.AuditPrincipal{IsOwner bool; UserID, Company string; Perms []string}`
  - `domain.AuditScope{All bool; Company, Actor string}`
  - `service.AuditScope(domain.AuditPrincipal) (domain.AuditScope, error)`
  - `authhttp.Perms(ctx) []string`, `authhttp.UserID(ctx) string`
  - `(*Gateway).ListAudit(ctx, q domain.AuditQuery, p domain.AuditPrincipal, token string, wantRefs bool)` — сигнатура меняется; фронт не затрагивается.

- [ ] **Step 1: Написать доменные типы**

Create `backend/services/gateway-service/internal/domain/audit_scope.go`:

```go
package domain

// AuditPrincipal is who is asking for the journal. It is assembled from the
// session by the transport layer and never from request parameters.
type AuditPrincipal struct {
	IsOwner bool
	UserID  string
	Company string
	Perms   []string
}

// AuditScope is what that principal may read.
//
// Actor, when set, pins the read to one person and OVERWRITES whatever actor
// filter the request carried — a caller narrowed to their own actions must not
// be able to widen the filter back out by hand.
type AuditScope struct {
	All     bool
	Company string
	Actor   string
}
```

- [ ] **Step 2: Обновить тест скоупа**

Modify `backend/services/gateway-service/internal/service/audit_scope_test.go` — заменить тела всех тестов на новую сигнатуру и добавить три случая:

```go
package service_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// AuditScopeSuite covers the security boundary of the audit journal: it decides
// whose entries a caller may read. It is built to fail closed, so the cases
// that matter most are the ones where the principal is incomplete.
type AuditScopeSuite struct {
	suite.Suite
}

func TestAuditScopeSuite(t *testing.T) {
	suite.Run(t, new(AuditScopeSuite))
}

func (s *AuditScopeSuite) TestRootReadsEverything() {
	got, err := service.AuditScope(domain.AuditPrincipal{IsOwner: true})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, true)
	assert.Equal(s.T(), got.Company, "")
	assert.Equal(s.T(), got.Actor, "")
}

func (s *AuditScopeSuite) TestCompanyOwnerIsPinnedToOwnCompany() {
	got, err := service.AuditScope(domain.AuditPrincipal{
		Company: "company-1", Perms: []string{"audit:read"},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, false)
	assert.Equal(s.T(), got.Company, "company-1")
	assert.Equal(s.T(), got.Actor, "")
}

// read_own narrows to the caller. The company is set as well even though the
// actor pin is strictly tighter: two checks cost less than one argument about
// why one is enough.
func (s *AuditScopeSuite) TestReadOwnIsPinnedToTheCaller() {
	got, err := service.AuditScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1", Perms: []string{"audit:read_own"},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, false)
	assert.Equal(s.T(), got.Company, "company-1")
	assert.Equal(s.T(), got.Actor, "user-7")
}

// Holding both, the wider one wins: a Company Owner who also carries read_own
// must not be narrowed to themselves.
func (s *AuditScopeSuite) TestReadBeatsReadOwn() {
	got, err := service.AuditScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1",
		Perms: []string{"audit:read_own", "audit:read"},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Actor, "")
}

func (s *AuditScopeSuite) TestNoAuditPermissionIsRefused() {
	_, err := service.AuditScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1", Perms: []string{"territory:read"},
	})

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}

// A principal that is neither Root nor attached to a company must be refused,
// never widened: an empty company with all=false matches the NULL-company rows,
// which are exactly Root's and the system's actions.
func (s *AuditScopeSuite) TestUnattachedPrincipalIsRefused() {
	_, err := service.AuditScope(domain.AuditPrincipal{Perms: []string{"audit:read"}})

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}

// The owner flag is the authority: a stale company id on a Root principal must
// not narrow what Root can see.
func (s *AuditScopeSuite) TestRootIgnoresCompanyID() {
	got, err := service.AuditScope(domain.AuditPrincipal{IsOwner: true, Company: "company-1"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, true)
	assert.Equal(s.T(), got.Company, "")
}
```

- [ ] **Step 3: Запустить тест, убедиться что падает**

Run: `cd backend/services/gateway-service && go test ./internal/service/ -run TestAuditScopeSuite`
Expected: FAIL — компиляция: `service.AuditScope` принимает три аргумента.

- [ ] **Step 4: Переписать `AuditScope`**

Modify `backend/services/gateway-service/internal/service/audit_scope.go`:

```go
package service

import (
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// AuditScope maps a principal onto the journal's filter.
//
// Root reads every row. A holder of audit:read is pinned to their own company,
// taken from the principal and never from the request — a client-supplied
// company id would let one Company Owner read another's history. A holder of
// only audit:read_own is pinned further, to their own actions.
//
// audit:read wins over audit:read_own when both are present: a Company Owner
// who also carries the narrower grant must not be narrowed by it.
//
// A caller who is neither Root nor attached to a company is refused rather than
// given an empty filter: an empty company with All=false matches the rows whose
// company_id IS NULL, which are precisely Root's and the system's actions.
// Failing closed turns an upstream bug into an error instead of a disclosure.
func AuditScope(p domain.AuditPrincipal) (domain.AuditScope, error) {
	if p.IsOwner {
		return domain.AuditScope{All: true}, nil
	}
	if p.Company == "" {
		return domain.AuditScope{}, domain.ErrForbidden
	}
	if slices.Contains(p.Perms, "audit:read") {
		return domain.AuditScope{Company: p.Company}, nil
	}
	if slices.Contains(p.Perms, "audit:read_own") {
		return domain.AuditScope{Company: p.Company, Actor: p.UserID}, nil
	}
	return domain.AuditScope{}, domain.ErrForbidden
}
```

- [ ] **Step 5: Применить скоуп в сервисе**

Modify `backend/services/gateway-service/internal/service/audit.go` — заменить `ListAudit`:

```go
// ListAudit reads one page of the journal.
//
// The tenant filter is derived here from the principal, never taken from q —
// the handler fills in only the user-facing filters (actor, action, entity,
// time range, paging). Accepting a company id from the request would let one
// Company Owner read another's history.
//
// A read_own caller has their actor filter OVERWRITTEN rather than merged: the
// pin is the boundary, and honouring ?actor= alongside it would let them ask
// about somebody else.
//
// token is the caller's bearer, forwarded to auth so the actor ids in the result
// can be turned into logins. It carries no authority of its own here.
// wantRefs asks for the dictionary naming the ids inside the row snapshots. The
// CSV export passes false.
func (g *Gateway) ListAudit(
	ctx context.Context, q domain.AuditQuery, p domain.AuditPrincipal, token string, wantRefs bool,
) ([]domain.AuditEntry, int64, map[string]string, error) {
	sc, err := AuditScope(p)
	if err != nil {
		return nil, 0, nil, err
	}
	q.AllCompanies = sc.All
	q.CompanyID = sc.Company
	if sc.Actor != "" {
		q.ActorID = sc.Actor
	}
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

- [ ] **Step 6: Сузить список акторов для `read_own`**

Modify `backend/services/gateway-service/internal/service/audit_actors.go` — заменить сигнатуру и первые девять строк тела. Всё после `logins, err := ...` остаётся как есть:

```go
func (g *Gateway) ListAuditActors(ctx context.Context, p domain.AuditPrincipal, token string) ([]domain.AuditActor, error) {
	sc, err := AuditScope(p)
	if err != nil {
		return nil, err
	}

	// A read_own caller filters by exactly one actor — themselves. Asking the
	// journal for the company's roster and then hiding it client-side would
	// leak who else works there, which is precisely what the narrower grant
	// exists to withhold.
	ids := []string{sc.Actor}
	if sc.Actor == "" {
		ids, err = g.audit.ListActors(ctx, domain.AuditQuery{AllCompanies: sc.All, CompanyID: sc.Company})
		if err != nil {
			return nil, err
		}
	}
	if len(ids) == 0 {
		return []domain.AuditActor{}, nil
	}
	// Batched: this list has no ceiling — it is every person who has ever
	// touched the company's data, and it only grows.
	logins, err := g.resolveLoginsBatched(ctx, token, ids)
	if err != nil {
		return nil, err
	}
```

- [ ] **Step 7: Открыть принципала транспорту**

Modify `backend/services/gateway-service/internal/transport/authhttp/principal.go` — добавить в конец:

```go
// Perms returns the caller's permission snapshot. Exported for the audit
// handlers, which need the grant itself and not just its effect: audit:read and
// audit:read_own reach the same route but resolve to different scopes.
func Perms(ctx context.Context) []string {
	return principalPerms(ctx)
}

// UserID returns the authenticated caller's id, empty when unauthenticated.
func UserID(ctx context.Context) string {
	return principalUserID(ctx)
}
```

- [ ] **Step 8: Собрать принципала в обработчиках**

Modify `backend/services/gateway-service/internal/transport/httpapi/audit.go` — добавить хелпер и заменить вызовы:

```go
// auditPrincipal assembles who is asking from the session, never from the
// request. Every audit entry point goes through it so there is one place where
// that rule can be checked.
func auditPrincipal(ctx context.Context) domain.AuditPrincipal {
	return domain.AuditPrincipal{
		IsOwner: authhttp.IsOwner(ctx),
		UserID:  authhttp.UserID(ctx),
		Company: authhttp.AuditCompany(ctx),
		Perms:   authhttp.Perms(ctx),
	}
}
```

В `ListAudit` заменить вызов на:

```go
	entries, next, refs, err := s.svc.ListAudit(ctx,
		auditQueryFromParams(req.Params), auditPrincipal(ctx), authhttp.Token(ctx), true)
```

В `ListAuditActors`:

```go
	actors, err := s.svc.ListAuditActors(ctx, auditPrincipal(ctx), authhttp.Token(ctx))
```

Modify `backend/services/gateway-service/internal/transport/httpapi/audit_csv.go` — заменить строки, собиравшие `isOwner`/`company`, и вызов `ListAudit`:

```go
	// The CSV export stays behind audit:read: it is the whole company's history
	// in one file, which is not what a read_own grant opens. The route's manual
	// Require("audit:read") in InitRouter is what enforces that; the principal
	// here only carries the scope through.
	p := auditPrincipal(ctx)
	token := authhttp.Token(ctx)

	first, next, _, err := s.svc.ListAudit(ctx, q, p, token, false)
```

Все последующие вызовы `s.svc.ListAudit` в этом файле (пагинация экспорта) привести к той же сигнатуре.

- [ ] **Step 9: Сделать значение `routePerms` списком**

Modify `backend/services/gateway-service/internal/transport/authhttp/route_permissions.go`:

```go
// routePerms maps "METHOD <chi route pattern>" to the permissions that open it —
// holding ANY of them is enough. Only mutations are listed; reads need any
// authenticated principal.
//
// A list rather than a single slug because the journal has two grants of
// different width: audit:read for the company's history, audit:read_own for
// your own actions. Both reach the same route; AuditScope decides how far each
// one sees.
var routePerms = map[string][]string{
	// The one gated read: the journal is not open to every authenticated
	// principal the way the content endpoints are.
	"GET /api/audit":                                 {"audit:read", "audit:read_own"},
	"GET /api/audit/actors":                          {"audit:read", "audit:read_own"},
	"POST /api/territories":                          {"territory:create"},
	"PATCH /api/territories/{slug}":                  {"territory:write"},
	"DELETE /api/territories/{slug}":                 {"territory:delete"},
	"POST /api/models":                               {"model:write"},
	"PATCH /api/models/{slug}":                       {"model:write"},
	"DELETE /api/models/{slug}":                      {"model:delete"},
	"POST /api/territories/{slug}/placements":        {"placement:create"},
	"PUT /api/territories/{slug}/placements/{id}":    {"placement:write"},
	"DELETE /api/territories/{slug}/placements/{id}": {"placement:delete"},
	"POST /api/territories/{slug}/panoramas":         {"panorama:create"},
	"PUT /api/territories/{slug}/panoramas/{id}":     {"panorama:write"},
	"DELETE /api/territories/{slug}/panoramas/{id}":  {"panorama:delete"},
	"POST /api/territories/{slug}/documents":         {"document:write"},
	"DELETE /api/territories/{slug}/documents/{id}":  {"document:delete"},
	"POST /api/uploads":                              {"upload:create"},
	"PATCH /api/uploads/{id}":                        {"upload:create"},
	"POST /api/uploads/{id}/finalize":                {"upload:create"},
}

// RequirePermissionForRoute enforces routePerms against the principal. Routes
// not in the map require only a valid session (handled by Authenticate).
func RequirePermissionForRoute(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pattern := chi.RouteContext(r.Context()).RoutePattern()
		need, gated := routePerms[r.Method+" "+pattern]
		if gated && !principalIsOwner(r.Context()) && !holdsAny(r.Context(), need) {
			apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden,
				"permission denied: one of "+strings.Join(need, ", "))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func holdsAny(ctx context.Context, need []string) bool {
	have := principalPerms(ctx)
	return slices.ContainsFunc(need, func(p string) bool { return slices.Contains(have, p) })
}
```

Импорты файла: добавить `"context"` и `"strings"`.

- [ ] **Step 10: Обновить тест карты маршрутов**

Modify `backend/services/gateway-service/internal/transport/authhttp/route_permissions_test.go`:

```go
// RequirePermissionForRoute fails OPEN: a route absent from routePerms is
// authenticated but not authorised, and the request goes through. A typo in a
// key therefore does not break the route — it silently un-gates it. These
// assertions are the only thing standing between that and the journal.
func (s *RoutePermsSuite) TestEveryJournalRouteIsGated() {
	for _, route := range []string{
		"GET /api/audit",
		"GET /api/audit/actors",
	} {
		need, gated := routePerms[route]
		assert.Assert(s.T(), gated, "%s is not gated: RequirePermissionForRoute lets it through", route)
		assert.DeepEqual(s.T(), need, []string{"audit:read", "audit:read_own"})
	}
}

// Every entry must name at least one permission: an empty list would satisfy
// the "is it in the map" check above while granting the route to everyone.
func (s *RoutePermsSuite) TestNoRouteHasAnEmptyPermissionList() {
	for route, need := range routePerms {
		assert.Assert(s.T(), len(need) > 0, "%s has no permissions and is effectively un-gated", route)
	}
}
```

Добавить импорт `"gotest.tools/v3/assert"` (уже есть) — `assert.DeepEqual` из того же пакета.

- [ ] **Step 11: Запустить тесты шлюза**

Run: `cd backend/services/gateway-service && go build ./... && go test ./... -v -run "Audit|RoutePerms"`
Expected: PASS.

- [ ] **Step 12: Проверить вживую**

```bash
cd /Users/vbncursed/programming/rosneft
docker compose up -d --build gateway
# Логин под пользователем с ролью viewer, затем:
# curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/audit | jq '.entries | length'
# curl -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/audit?actor=<чужой-uuid>" | jq '.entries[].actorId' | sort -u
```

Expected: вторая команда возвращает только собственный id — фильтр перезаписан, а не применён.

- [ ] **Step 13: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/
git commit -m "feat(gateway): scope the journal to a caller's own actions with audit:read_own"
```

---

### Task 11: Фронт — секция «Мои действия»

**Files:**
- Create: `frontend/src/audit/presentation/components/my-activity-section.tsx`
- Create: `frontend/src/audit/presentation/components/my-activity-section.spec.tsx`
- Modify: `frontend/src/routes/account.tsx`

**Interfaces:**
- Consumes: `useAuditLog(filters)` (существующий), `AuditTable` (существующий, принимает `entries` и необязательный `refs`), `EMPTY_FILTERS`, `can(principal, permission)`.
- Produces: компонент `MyActivitySection` без пропсов.

- [ ] **Step 1: Написать падающий тест**

Create `frontend/src/audit/presentation/components/my-activity-section.spec.tsx`:

```tsx
// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

const useCurrentUser = vi.fn();
vi.mock("@/auth/presentation/current-user-context", () => ({
  useCurrentUser: () => useCurrentUser(),
}));

const useAuditLog = vi.fn();
vi.mock("@/audit/application/use-audit-log", () => ({
  useAuditLog: (f: unknown) => useAuditLog(f),
}));

import MyActivitySection from "./my-activity-section";

const principal = (permissions: string[], isOwner = false) => ({
  id: "user-7", email: "a@b.c", username: "vbncursed", status: "active" as const,
  totpEnabled: false, roleSlugs: [], permissions, isOwner, onboardingToursSeen: [],
});

const log = (over = {}) => ({
  entries: [], refs: {}, isLoading: false, error: null,
  hasMore: false, loadMore: vi.fn(), isLoadingMore: false, ...over,
});

afterEach(() => {
  cleanup();
  useCurrentUser.mockReset();
  useAuditLog.mockReset();
});

describe("MyActivitySection", () => {
  it("stays hidden for a principal with no journal grant", () => {
    useCurrentUser.mockReturnValue(principal(["territory:read"]));
    useAuditLog.mockReturnValue(log());

    const { container } = render(<MyActivitySection />);

    expect(container.textContent).toBe("");
  });

  it("renders for a principal holding audit:read_own", () => {
    useCurrentUser.mockReturnValue(principal(["audit:read_own"]));
    useAuditLog.mockReturnValue(log({
      entries: [{
        id: 1, at: "2026-07-29T10:00:00Z", actorId: "user-7", actorLogin: "vbncursed",
        companyId: "c1", companyLogin: "owner", action: "placement.update",
        entity: "placement", entityId: "3", entityLabel: "pump-101",
        oldRow: null, newRow: { label: "pump-101" }, territorySlug: "", result: "ok",
      }],
    }));

    render(<MyActivitySection />);

    expect(screen.getByText("placement.update")).toBeTruthy();
  });

  it("renders for a Company Owner, whose audit:read is wider", () => {
    useCurrentUser.mockReturnValue(principal(["audit:read"]));
    useAuditLog.mockReturnValue(log());

    render(<MyActivitySection />);

    expect(screen.getByText(/My activity/i)).toBeTruthy();
  });

  it("surfaces a load failure instead of showing an empty history", () => {
    useCurrentUser.mockReturnValue(principal(["audit:read_own"]));
    useAuditLog.mockReturnValue(log({ error: new Error("gateway is down") }));

    render(<MyActivitySection />);

    expect(screen.getByText(/gateway is down/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd frontend && yarn test:spa src/audit/presentation/components/my-activity-section.spec.tsx`
Expected: FAIL — модуль `./my-activity-section` не найден.

- [ ] **Step 3: Реализовать компонент**

Create `frontend/src/audit/presentation/components/my-activity-section.tsx`:

```tsx
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import { useAuditLog } from "@/audit/application/use-audit-log";
import { EMPTY_FILTERS } from "@/audit/domain/audit-entry";
import AuditTable from "@/audit/presentation/components/audit-table";

// Секция «мои действия» на странице аккаунта. Фильтров нет намеренно: шлюз уже
// сузил выборку до самого пользователя, и панель фильтра по актору предлагала
// бы выбор из одного значения.
//
// Экспорта тоже нет — CSV остаётся за audit:read, это выгрузка истории всей
// компании.
export default function MyActivitySection() {
  const me = useCurrentUser();
  const { entries, refs, isLoading, error, hasMore, loadMore, isLoadingMore } =
    useAuditLog(EMPTY_FILTERS);

  // Гейт — UX, а не граница безопасности: настоящую проверку делает AuditScope
  // на шлюзе. Здесь он только убирает секцию, которая всё равно вернула бы 403.
  if (!can(me, "audit:read_own") && !can(me, "audit:read")) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <header>
        <h2 className="text-sm font-semibold tracking-tight">My activity</h2>
        <p className="mt-1 text-xs text-neutral-400">
          Everything recorded under your account, newest first.
        </p>
      </header>

      <div className="mt-4">
        {error ? (
          <p className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
            {error instanceof Error ? error.message : "Could not load your activity"}
          </p>
        ) : isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing recorded yet.</p>
        ) : (
          <AuditTable entries={entries} refs={refs} />
        )}
      </div>

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="rounded-md border border-white/10 px-4 py-1.5 text-xs text-neutral-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            {isLoadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Запустить тест, убедиться что проходит**

Run: `cd frontend && yarn test:spa src/audit/presentation/components/my-activity-section.spec.tsx`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Подключить к странице аккаунта**

Modify `frontend/src/routes/account.tsx` — добавить импорт и вставить секцию последней:

```tsx
import MyActivitySection from "@/audit/presentation/components/my-activity-section";
```

```tsx
        <ChangePasswordForm />
        <TwoFactorSection initiallyEnabled={p.totpEnabled} />
        <PasskeysSection />
        <MyActivitySection />
```

Ширину контейнера страницы поднять с `max-w-xl` до `max-w-3xl` — таблица журнала в `max-w-xl` уходит в горизонтальный скролл:

```tsx
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-16 sm:px-10">
```

- [ ] **Step 6: Прогнать линт и оба набора тестов**

Run: `cd frontend && yarn lint && yarn test && yarn test:spa`
Expected: PASS; `max-lines` не срабатывает — компонент около 60 строк.

- [ ] **Step 7: Проверить вживую**

```bash
cd frontend && yarn dev --port 3000
```

Зайти под пользователем с ролью `viewer`, открыть `/account`. Ожидаемо: секция «My activity» показывает только собственные действия. Под пользователем без обоих прав секция отсутствует.

- [ ] **Step 8: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/audit/presentation/components/my-activity-section.tsx \
        frontend/src/audit/presentation/components/my-activity-section.spec.tsx \
        frontend/src/routes/account.tsx
git commit -m "feat(account): show a user their own entries from the journal"
```

---

### Task 12: Документация

**Files:**
- Modify: `backend/services/audit-service/README.md`
- Modify: `CLAUDE.md`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: всё построенное в задачах 1–11.
- Produces: документация. Кода не меняет.

- [ ] **Step 1: Дописать README audit-service**

Modify `backend/services/audit-service/README.md` — добавить перед разделом `## Layout`:

```markdown
## Tamper evidence

The append-only trigger stops the application and every SQL client using DML.
It does not stop somebody who can `ALTER TABLE ... DISABLE TRIGGER`. For that
the service seals the journal periodically and witnesses the result outside the
database.

Every `AUDIT_CHECKPOINT_INTERVAL` (default `5m`) a tick folds the rows settled
since the previous tick into one SHA-256, chains it to the previous checkpoint,
and appends the result to `audit_checkpoint` — a table carrying the same
append-only triggers as the journal. The digest is then written twice: to the
service log under the key `audit: checkpoint`, and as one JSON line to
`AUDIT_DIGEST_FILE` on a volume that is not the database's.

**The file is the part that matters.** A chain stored only in Postgres protects
against nobody who can edit Postgres: the same credentials that rewrite the
journal recompute the chain. The copy on the other volume is what they would
also have to reach — so back it up separately from the database dump, or the
two share a fate and the evidence is worth nothing.

The digest is computed entirely in SQL (`pgcrypto`, already installed by the
auth migrations) with `SET LOCAL timezone = 'UTC'`, because jsonb renders
`timestamptz` in the session's zone and these containers run `Europe/Moscow`.

### Why the boundary is a watermark, not max(id)

`audit_log.id` comes from a sequence, and a sequence hands out ids at INSERT,
not at COMMIT. An id can therefore belong to a transaction nobody can see yet.
Digesting up to `max(id)` would skip such a row and then find it inside an
already-sealed range once it commits — indistinguishable, to `verify`, from a
forged insertion.

So each tick records `pg_sequence_last_value('audit_log_id_seq')` and the *next*
tick uses it as its boundary. Every transaction alive when that value was taken
has since committed or rolled back, so every id below it is settled.

This assumes the tick interval exceeds the longest write transaction. Mutations
here are single-statement upserts, so `5m` is generous. A longer transaction
produces a false alarm, never a missed forgery.

### Verifying

```bash
audit verify                                   # recompute the chain
audit verify --digest-file /var/audit/digests.jsonl  # and compare to the witness
```

Exits non-zero and names the first failing checkpoint. A checkpoint the witness
has not seen is not a failure — the file is appended after the row commits.

## Retention

The journal is kept **forever**. There is no cleanup job and no partitioning.

That is a decision, not an omission. Deleting rows requires the append-only
trigger out of the way, and the only way to reclaim space without disabling it
is partitioning — a migration that rebuilds the table carrying the strongest
guarantee in the system. Nobody has measured a problem worth that risk.

What exists instead:

- `audit_log_rows` and `audit_log_bytes`, published on the checkpoint tick.
- `AuditJournalGrowth` fires above 5 GB, which is the signal to revisit this.
- `audit export --before=2026-01-01 --out=archive.jsonl` streams old entries out.
  It deletes nothing; deciding to delete is a separate, deliberate act.

Upgrade path, when the alert fires: convert `audit_log` to monthly range
partitions, then `DETACH`/`DROP PARTITION` after exporting. `DROP PARTITION` is
DDL, so the row-level append-only trigger does not block it — which is exactly
why partitioning is the only honest way to implement retention here.

## Not captured

`territory_artifacts` and `model_artifacts` are deliberately absent from the
trigger list, and this is not a gap. The mesh-worker writes them with no human
actor. The human act — replacing a territory's source archive — is captured on
`territories.source_blob_hash`, because `UpsertTerritory` runs through
`pkg/audittx`. What the journal skips is only the conversion's own bookkeeping,
which the job records and the logs already cover.
```

Дополнить таблицу конфигурации:

```markdown
| `AUDIT_CHECKPOINT_INTERVAL` | `5m` | how often to seal a checkpoint; `0` disables |
| `AUDIT_DIGEST_FILE` | *(empty)* | append-only JSONL witness; empty disables it |
```

- [ ] **Step 2: Обновить CLAUDE.md**

Modify `CLAUDE.md` — в раздел про эндпоинты шлюза, к строке про `GET /api/audit`:

```markdown
- `GET /api/audit` — the change journal, cursor-paged over descending `id`. Two grants reach it: `audit:read` sees the whole company, `audit:read_own` sees only the caller's own actions (the gateway **overwrites** the `actor` parameter in that mode, it does not merge it). Root passes via the owner bypass. **The company scope comes from the session and is not a parameter.**
```

и добавить абзац в конец файла:

```markdown
## Audit journal tamper evidence

`audit-service` seals the journal every `AUDIT_CHECKPOINT_INTERVAL` (default 5m)
into `audit_checkpoint`: a SHA-256 over the rows settled since the last tick,
chained to the previous digest, computed entirely in SQL with
`SET LOCAL timezone = 'UTC'` (jsonb renders timestamps in the session zone, and
these containers run Europe/Moscow). Each digest is witnessed to
`AUDIT_DIGEST_FILE` on a volume separate from the database — that separation is
the whole point, since a chain living only in Postgres is recomputable by
anyone who can rewrite Postgres. Verify with `audit verify --digest-file …`.

The range boundary is `pg_sequence_last_value('audit_log_id_seq')` read one tick
earlier, never `max(id)`: the sequence hands out ids before commit, so `max(id)`
would skip a row held by an in-flight transaction and then flag it as forged
once it lands. Retention is deliberately "keep forever" — see
`backend/services/audit-service/README.md#retention` before proposing a cleanup job.
```

- [ ] **Step 3: Обновить backend/README.md**

Modify `backend/README.md` — в строку таблицы сервисов про `audit-service`:

```markdown
| [`audit-service`](services/audit-service/README.md) | Append-only change journal + capture triggers + checkpoint digests | gRPC `:9009` (internal)   |
```

- [ ] **Step 4: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add backend/services/audit-service/README.md CLAUDE.md backend/README.md
git commit -m "docs(audit): checkpoint digests, witness file, and the retention decision"
```

---

## Финальная проверка

- [ ] **Полный прогон**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
cd backend/services/audit-service && go test -tags=integration ./... && cd ../../..
cd frontend && yarn lint && yarn test && yarn test:spa && cd ..
docker compose up -d --build
sleep 30
docker compose exec audit /audit verify
docker compose exec prometheus promtool check rules /etc/prometheus/rules.yml
```

Expected: всё зелёное, `audit verify` печатает `verification passed`.

- [ ] **Открыть PR**

```bash
git push -u origin dev
gh pr create --base main --head dev \
  --title "feat(audit): checkpoint digests, own-actions scope, retention policy" \
  --body "$(cat <<'EOF'
Closes the four gaps the functionality audit raised against the change journal.

Two of them were misstated in the audit and the fix is a correction rather than
code: conversion artifacts are already covered through `territories.source_blob_hash`,
and a hash chain living in the same database defends against nobody who can edit
that database. What ships instead is a witness — periodic digests written to a
JSONL file on a volume separate from Postgres, plus `audit verify` to compare.

The range boundary comes from `pg_sequence_last_value` observed one tick earlier
rather than `max(id)`: the sequence hands out ids before commit, so `max(id)`
misses a row held by an in-flight transaction and flags it as forged once it lands.

Retention stays "keep forever" on purpose. Partitioning is the only way to delete
without breaking append-only, and that migration touches the strongest guarantee
in the system to solve a problem nobody has measured. A size gauge, an alert and
an export command close the gap; partitioning is recorded as the upgrade path.

Spec: `docs/superpowers/specs/2026-07-29-audit-hardening-design.md`
Plan: `docs/superpowers/plans/2026-07-29-audit-hardening.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
