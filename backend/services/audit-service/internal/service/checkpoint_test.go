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
