//go:build integration

package migrate_test

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/migrate"
)

// pgSuite is a migrated Postgres per suite, shared by the seed suites here.
type pgSuite struct {
	suite.Suite
	dsn  string
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
}

func (s *pgSuite) SetupSuite() {
	ctx := s.T().Context()
	// postgres:18.6, matching docker-compose.yml's pin.
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr

	s.dsn, err = ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, s.dsn))

	s.pool, err = pgxpool.New(ctx, s.dsn)
	assert.NilError(s.T(), err)
}

func (s *pgSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}
