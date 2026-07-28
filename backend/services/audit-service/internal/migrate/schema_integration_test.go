//go:build integration

package migrate_test

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
)

// SchemaSuite exercises audit_capture() and the append-only guard against a
// real Postgres. The trigger logic is SQL, so nothing else in the repo can
// verify it — this is the only proof that the journal cannot be bypassed.
type SchemaSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
}

func TestSchemaSuite(t *testing.T) {
	suite.Run(t, new(SchemaSuite))
}

func (s *SchemaSuite) SetupSuite() {
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

func (s *SchemaSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// A subject table standing in for territories. The trigger is generic, so one
// fixture covers every attached table.
func (s *SchemaSuite) SetupTest() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		DROP TABLE IF EXISTS subjects;
		CREATE TABLE subjects (
			id            BIGSERIAL PRIMARY KEY,
			slug          TEXT NOT NULL,
			title         TEXT NOT NULL DEFAULT '',
			password_hash TEXT NOT NULL DEFAULT 'hunter2',
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
		);
		CREATE TRIGGER audit_subjects AFTER INSERT OR UPDATE OR DELETE ON subjects
			FOR EACH ROW EXECUTE FUNCTION audit_capture('subject', 'id', 'slug');`)
	assert.NilError(s.T(), err)
	s.truncateLog()
}

// truncateLog drops the append-only guard for the length of one statement.
// Only a test may do this — having to work around the guard is itself proof
// that the guard is real.
func (s *SchemaSuite) truncateLog() {
	_, err := s.pool.Exec(s.T().Context(), `
		ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_mutate;
		DELETE FROM audit_log;
		ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_mutate;`)
	assert.NilError(s.T(), err)
}

func (s *SchemaSuite) TestInsertIsCaptured() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `INSERT INTO subjects (slug, title) VALUES ('alpha', 'Alpha')`)
	assert.NilError(s.T(), err)

	var action, entity, label, entityID string
	var oldRow *string
	err = s.pool.QueryRow(ctx,
		`SELECT action, entity, entity_label, entity_id, old_row::text FROM audit_log`).
		Scan(&action, &entity, &label, &entityID, &oldRow)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), action, "subject.insert")
	assert.Equal(s.T(), entity, "subject")
	assert.Equal(s.T(), label, "alpha")
	assert.Equal(s.T(), entityID, "1")
	assert.Assert(s.T(), oldRow == nil)
}

func (s *SchemaSuite) TestSecretsAreRedacted() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `INSERT INTO subjects (slug) VALUES ('alpha')`)
	assert.NilError(s.T(), err)

	var newRow string
	err = s.pool.QueryRow(ctx, `SELECT new_row::text FROM audit_log`).Scan(&newRow)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !strings.Contains(newRow, "password_hash"))
	assert.Assert(s.T(), !strings.Contains(newRow, "hunter2"))
}

// An upsert with unchanged values still bumps updated_at. Without the guard the
// journal would fill with entries whose diff is empty.
func (s *SchemaSuite) TestUpdateTouchingOnlyUpdatedAtIsSkipped() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `INSERT INTO subjects (slug, title) VALUES ('alpha', 'Alpha')`)
	assert.NilError(s.T(), err)
	s.truncateLog()

	_, err = s.pool.Exec(ctx, `UPDATE subjects SET title = 'Alpha', updated_at = now() WHERE slug = 'alpha'`)
	assert.NilError(s.T(), err)

	var n int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT count(*) FROM audit_log`).Scan(&n))
	assert.Equal(s.T(), n, 0)
}

func (s *SchemaSuite) TestRealUpdateIsCaptured() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `INSERT INTO subjects (slug, title) VALUES ('alpha', 'Alpha')`)
	assert.NilError(s.T(), err)
	s.truncateLog()

	_, err = s.pool.Exec(ctx, `UPDATE subjects SET title = 'Beta' WHERE slug = 'alpha'`)
	assert.NilError(s.T(), err)

	var action, oldRow, newRow string
	err = s.pool.QueryRow(ctx,
		`SELECT action, old_row::text, new_row::text FROM audit_log`).
		Scan(&action, &oldRow, &newRow)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), action, "subject.update")
	assert.Assert(s.T(), strings.Contains(oldRow, "Alpha"))
	assert.Assert(s.T(), strings.Contains(newRow, "Beta"))
}

func (s *SchemaSuite) TestDeleteIsCaptured() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `INSERT INTO subjects (slug) VALUES ('alpha')`)
	assert.NilError(s.T(), err)
	s.truncateLog()

	_, err = s.pool.Exec(ctx, `DELETE FROM subjects WHERE slug = 'alpha'`)
	assert.NilError(s.T(), err)

	var action, label string
	var newRow *string
	err = s.pool.QueryRow(ctx,
		`SELECT action, entity_label, new_row::text FROM audit_log`).Scan(&action, &label, &newRow)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), action, "subject.delete")
	assert.Equal(s.T(), label, "alpha") // the label outlives the deleted row
	assert.Assert(s.T(), newRow == nil)
}

// The actor arrives as a transaction-local setting, exactly the way
// audittx.Run publishes it, and must not leak into the next transaction.
func (s *SchemaSuite) TestActorIsAttributedAndDoesNotLeak() {
	ctx := s.T().Context()
	tx, err := s.pool.Begin(ctx)
	assert.NilError(s.T(), err)
	_, err = tx.Exec(ctx,
		`SELECT set_config('app.actor_id', '11111111-1111-1111-1111-111111111111', true),
		        set_config('app.company_id', '22222222-2222-2222-2222-222222222222', true)`)
	assert.NilError(s.T(), err)
	_, err = tx.Exec(ctx, `INSERT INTO subjects (slug) VALUES ('alpha')`)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), tx.Commit(ctx))

	// Second write, no actor set — must not inherit the first one.
	_, err = s.pool.Exec(ctx, `INSERT INTO subjects (slug) VALUES ('beta')`)
	assert.NilError(s.T(), err)

	var withActor, withoutActor *string
	err = s.pool.QueryRow(ctx,
		`SELECT actor_id::text FROM audit_log WHERE entity_label = 'alpha'`).Scan(&withActor)
	assert.NilError(s.T(), err)
	err = s.pool.QueryRow(ctx,
		`SELECT actor_id::text FROM audit_log WHERE entity_label = 'beta'`).Scan(&withoutActor)
	assert.NilError(s.T(), err)

	assert.Assert(s.T(), withActor != nil)
	assert.Equal(s.T(), *withActor, "11111111-1111-1111-1111-111111111111")
	assert.Assert(s.T(), withoutActor == nil)
}

func (s *SchemaSuite) TestAuditLogRejectsUpdateDeleteAndTruncate() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `INSERT INTO subjects (slug) VALUES ('alpha')`)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx, `UPDATE audit_log SET action = 'tampered'`)
	assert.ErrorContains(s.T(), err, "append-only")

	_, err = s.pool.Exec(ctx, `DELETE FROM audit_log WHERE true`)
	assert.ErrorContains(s.T(), err, "append-only")

	_, err = s.pool.Exec(ctx, `TRUNCATE audit_log`)
	assert.ErrorContains(s.T(), err, "append-only")
}
