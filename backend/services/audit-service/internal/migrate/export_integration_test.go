//go:build integration

package migrate_test

import (
	"context"
	"errors"
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

func (s *ExportSuite) SetupTest() {
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

func (s *ExportSuite) TearDownTest() {
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
