//go:build integration

package migrate_test

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
)

// RollbackSuite proves the migrations can be undone once the capture triggers
// are live.
//
// This is the production-only failure mode: on a fresh database nothing depends
// on audit_capture(), so Down succeeds and looks fine. Attach the triggers
// first — which is what every real deployment does on boot — and Postgres
// refuses to drop the function, leaving manual SQL as the only way back.
type RollbackSuite struct {
	suite.Suite
	dsn  string
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
}

func TestRollbackSuite(t *testing.T) {
	suite.Run(t, new(RollbackSuite))
}

func (s *RollbackSuite) SetupTest() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:17-alpine",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr

	s.dsn, err = ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	s.pool, err = pgxpool.New(ctx, s.dsn)
	assert.NilError(s.T(), err)
}

func (s *RollbackSuite) TearDownTest() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// downAll rolls back every applied migration, one step at a time, the way an
// operator backing a release out would.
//
// The step count is read from the migrations directory rather than written as a
// literal. A hardcoded number silently stops covering the newest migration the
// moment one is added: the rollback still "passes" for the migrations it does
// reach, and the assertions below then fail somewhere unrelated — which is
// exactly how 00004 first surfaced here.
func (s *RollbackSuite) downAll(ctx context.Context) {
	entries, err := os.ReadDir("migrations")
	assert.NilError(s.T(), err)

	steps := 0
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			steps++
		}
	}
	assert.Assert(s.T(), steps > 0, "no migrations found to roll back")

	for range steps {
		assert.NilError(s.T(), migrate.Down(ctx, s.dsn))
	}
}

func (s *RollbackSuite) TestRollsBackWithTriggersAttached() {
	ctx := s.T().Context()

	// A stand-in for a business table, created before audit migrates — the
	// normal case on an existing deployment.
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE territories (
			id BIGSERIAL PRIMARY KEY,
			slug TEXT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), migrate.Up(ctx, s.dsn))

	var attached int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 1)

	// The whole point: this is what failed before the fix.
	s.downAll(ctx)

	var fns int
	err = s.pool.QueryRow(ctx,
		`SELECT count(*) FROM pg_proc WHERE proname IN ('audit_capture','audit_immutable','ensure_audit_triggers')`).Scan(&fns)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), fns, 0)

	var tbls int
	err = s.pool.QueryRow(ctx, `SELECT count(*) FROM pg_tables WHERE tablename = 'audit_log'`).Scan(&tbls)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), tbls, 0)

	// The business table must survive, and must be writable with no orphaned
	// trigger left pointing at a function that no longer exists.
	var trgs int
	err = s.pool.QueryRow(ctx,
		`SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
		 AND tgrelid = 'public.territories'::regclass`).Scan(&trgs)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), trgs, 0)

	_, err = s.pool.Exec(ctx, `INSERT INTO territories (slug) VALUES ('after-rollback')`)
	assert.NilError(s.T(), err)
}

// Re-applying after a rollback must work too: an operator who backs out and
// then rolls forward again should not need to touch the database by hand.
func (s *RollbackSuite) TestUpAgainAfterRollback() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE territories (
			id BIGSERIAL PRIMARY KEY,
			slug TEXT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), migrate.Up(ctx, s.dsn))
	var attached int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	s.downAll(ctx)

	assert.NilError(s.T(), migrate.Up(ctx, s.dsn))
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 1)

	_, err = s.pool.Exec(ctx, `INSERT INTO territories (slug) VALUES ('rolled-forward')`)
	assert.NilError(s.T(), err)

	var n int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT count(*) FROM audit_log`).Scan(&n))
	assert.Equal(s.T(), n, 1)
}
