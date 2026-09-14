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
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
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
