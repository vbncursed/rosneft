package service_test

import (
	"context"
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

	// Keyed by checkpoint id (2), not by to_id (9).
	got, err := service.New(store).Verify(s.T().Context(), map[int64]string{2: "what-was-witnessed"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, false)
	assert.Equal(s.T(), got.FailedID, int64(2))
}

// Quiet intervals seal empty ranges, so from_id == to_id repeats while each
// digest still advances. The witness was first keyed by to_id, which collapsed
// these into one entry and made verify fail a journal nobody had touched — the
// fixture above hid it because every to_id there was distinct.
func (s *VerifySuite) TestRepeatedToIDAcrossQuietCheckpointsStillVerifies() {
	quiet := []domain.Checkpoint{
		{ID: 1, FromID: 0, ToID: 12, Watermark: 12, RowCount: 12, Digest: "sealed", PrevDigest: "seed"},
		{ID: 2, FromID: 12, ToID: 12, Watermark: 12, Digest: "quiet-a", PrevDigest: "sealed"},
		{ID: 3, FromID: 12, ToID: 12, Watermark: 12, Digest: "quiet-b", PrevDigest: "quiet-a"},
	}
	store := mocks.NewStoreMock(s.mc).
		ListCheckpointsMock.Return(quiet, nil).
		ComputeDigestMock.Set(func(_ context.Context, _, _ int64, prev string) (int32, int64, string, error) {
		switch prev {
		case "sealed":
			return 0, 12, "quiet-a", nil
		case "quiet-a":
			return 0, 12, "quiet-b", nil
		}
		return 0, 0, "unexpected", nil
	})

	witnessed := map[int64]string{1: "sealed", 2: "quiet-a", 3: "quiet-b"}

	got, err := service.New(store).Verify(s.T().Context(), witnessed)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, true, got.Reason)
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
