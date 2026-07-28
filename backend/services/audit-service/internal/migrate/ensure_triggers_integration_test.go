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

// EnsureTriggersSuite proves attachment is ordering-free: audit-service can
// migrate before catalog/auth/content exist, the missing tables are skipped,
// and a later run picks them up. Without that the fresh-install boot order
// would decide whether the journal captures anything at all.
type EnsureTriggersSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
}

func TestEnsureTriggersSuite(t *testing.T) {
	suite.Run(t, new(EnsureTriggersSuite))
}

func (s *EnsureTriggersSuite) SetupSuite() {
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

func (s *EnsureTriggersSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// Each test starts from "audit has migrated, nobody else has". Dropping the
// table drops its trigger with it.
func (s *EnsureTriggersSuite) SetupTest() {
	_, err := s.pool.Exec(s.T().Context(), `DROP TABLE IF EXISTS territories`)
	assert.NilError(s.T(), err)
}

func (s *EnsureTriggersSuite) TestSkipsMissingTablesThenAttachesLater() {
	ctx := s.T().Context()

	// No business tables yet — must be a no-op, not an error.
	var attached int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 0)

	// catalog migrates afterwards.
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE territories (
			id BIGSERIAL PRIMARY KEY,
			slug TEXT NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 1)

	// The trigger is live and carries the right entity name.
	_, err = s.pool.Exec(ctx, `INSERT INTO territories (slug) VALUES ('alpha')`)
	assert.NilError(s.T(), err)

	var action, label string
	err = s.pool.QueryRow(ctx,
		`SELECT action, entity_label FROM audit_log WHERE entity = 'territory'`).Scan(&action, &label)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), action, "territory.insert")
	assert.Equal(s.T(), label, "alpha")
}

func (s *EnsureTriggersSuite) TestIsIdempotent() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE territories (
			id BIGSERIAL PRIMARY KEY,
			slug TEXT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	assert.NilError(s.T(), err)

	var first, second int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&first))
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&second))

	assert.Equal(s.T(), first, 1)
	assert.Equal(s.T(), second, 0)

	// Re-running must not have doubled the trigger, which would double-log.
	var triggers int
	err = s.pool.QueryRow(ctx,
		`SELECT count(*) FROM pg_trigger
		 WHERE tgrelid = 'public.territories'::regclass AND NOT tgisinternal`).Scan(&triggers)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), triggers, 1)
}
