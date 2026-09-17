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
