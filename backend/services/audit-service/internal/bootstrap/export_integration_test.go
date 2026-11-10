//go:build integration

package bootstrap_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
)

type RunnersIntegrationSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	cfg  config.Config
}

func TestRunnersIntegrationSuite(t *testing.T) { suite.Run(t, new(RunnersIntegrationSuite)) }

func (s *RunnersIntegrationSuite) SetupSuite() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(
		ctx,
		"postgres:18.6",
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
	s.cfg.DBDSN = dsn
}

func (s *RunnersIntegrationSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *RunnersIntegrationSuite) TestRunExport() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `INSERT INTO audit_log (at, action, entity, result) VALUES
 ('2020-01-01T00:00:00Z', 'old', 'auth', 'ok'),
 ('2020-01-02T00:00:00Z', 'boundary', 'auth', 'ok'),
 ('2020-01-03T00:00:00Z', 'new', 'auth', 'ok')`)
	assert.NilError(s.T(), err)
	cfg := s.cfg
	cfg.ExportBefore = "2020-01-02T00:00:00Z"
	cfg.ExportOut = filepath.Join(s.T().TempDir(), "archive.jsonl")
	s.Run("existing archive is preserved", func() {
		assert.NilError(s.T(), os.WriteFile(cfg.ExportOut, []byte("original"), 0o600))
		err := bootstrap.RunExport(ctx, cfg)
		assert.Assert(s.T(), errors.Is(err, os.ErrExist))
		got, err := os.ReadFile(cfg.ExportOut)
		assert.NilError(s.T(), err)
		assert.Equal(s.T(), string(got), "original")
		assert.NilError(s.T(), os.Remove(cfg.ExportOut))
	})
	s.Run("new archive contains only earlier rows", func() {
		assert.NilError(s.T(), bootstrap.RunExport(ctx, cfg))
		info, err := os.Stat(cfg.ExportOut)
		assert.NilError(s.T(), err)
		assert.Equal(s.T(), info.Mode().Perm(), os.FileMode(0o600))
		f, err := os.Open(cfg.ExportOut)
		assert.NilError(s.T(), err)
		defer func() { assert.NilError(s.T(), f.Close()) }()
		dec := json.NewDecoder(f)
		var entry domain.Entry
		assert.NilError(s.T(), dec.Decode(&entry))
		assert.Equal(s.T(), entry.Action, "old")
		assert.ErrorIs(s.T(), dec.Decode(&entry), io.EOF)
		var count int
		assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT count(*) FROM audit_log`).Scan(&count))
		assert.Equal(s.T(), count, 3)
	})
}
