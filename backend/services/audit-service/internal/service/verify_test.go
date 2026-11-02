package service_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
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

// seedDigest is what Checkpoint stores for the first tick: SHA-256 of "".
var seedDigest = func() string { h := sha256.Sum256(nil); return hex.EncodeToString(h[:]) }()

// Seed (id 1) plus one sealed range (id 2). The seed digests nothing, so verify
// must skip recomputing it and only check what follows.
func chain() []domain.Checkpoint {
	return []domain.Checkpoint{
		{ID: 1, FromID: 0, ToID: 0, Watermark: 10, Digest: seedDigest, PrevDigest: ""},
		{ID: 2, FromID: 0, ToID: 9, Watermark: 30, RowCount: 9, Digest: "good", PrevDigest: seedDigest},
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
		{ID: 1, Watermark: 12, Digest: seedDigest},
		{ID: 2, FromID: 0, ToID: 12, Watermark: 12, RowCount: 12, Digest: "sealed", PrevDigest: seedDigest},
		{ID: 3, FromID: 12, ToID: 12, Watermark: 12, Digest: "quiet-a", PrevDigest: "sealed"},
		{ID: 4, FromID: 12, ToID: 12, Watermark: 12, Digest: "quiet-b", PrevDigest: "quiet-a"},
	}
	store := mocks.NewStoreMock(s.mc).
		ListCheckpointsMock.Return(quiet, nil).
		ComputeDigestMock.Set(func(_ context.Context, _, _ int64, prev string) (int32, int64, string, error) {
		switch prev {
		case seedDigest:
			return 12, 12, "sealed", nil
		case "sealed":
			return 0, 12, "quiet-a", nil
		case "quiet-a":
			return 0, 12, "quiet-b", nil
		}
		return 0, 0, "unexpected", nil
	})

	witnessed := map[int64]string{1: seedDigest, 2: "sealed", 3: "quiet-a", 4: "quiet-b"}

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

// Someone with DISABLE TRIGGER deleted the journal's tail together with its
// newest checkpoints. What is left is a self-consistent chain; only the witness
// still remembers checkpoint 3.
func (s *VerifySuite) TestWitnessCheckpointMissingFromDatabaseIsCaught() {
	store := mocks.NewStoreMock(s.mc).
		ListCheckpointsMock.Return(chain(), nil).
		ComputeDigestMock.Return(9, 9, "good", nil)

	got, err := service.New(store).Verify(s.T().Context(),
		map[int64]string{1: seedDigest, 2: "good", 3: "sealed-then-deleted", 4: "also-deleted"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, false)
	assert.Equal(s.T(), got.FailedID, int64(3), "the first missing id is reported")
	assert.Assert(s.T(), strings.Contains(got.Reason, "database has no such checkpoint"), got.Reason)
}

// The whole checkpoint table was emptied.
func (s *VerifySuite) TestWitnessAgainstEmptyDatabaseIsCaught() {
	store := mocks.NewStoreMock(s.mc).ListCheckpointsMock.Return(nil, nil)

	got, err := service.New(store).Verify(s.T().Context(), map[int64]string{1: seedDigest})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, false)
	assert.Equal(s.T(), got.FailedID, int64(1))
}

// The seed digests nothing, but it is still compared with the witness.
func (s *VerifySuite) TestSeedWitnessDisagreementIsCaught() {
	store := mocks.NewStoreMock(s.mc).ListCheckpointsMock.Return(chain(), nil)

	got, err := service.New(store).Verify(s.T().Context(), map[int64]string{1: "other-seed"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, false)
	assert.Equal(s.T(), got.FailedID, int64(1))
	assert.Assert(s.T(), strings.Contains(got.Reason, "witness disagrees"), got.Reason)
}

// The seed has no range to recompute, but its digest is a constant, so a
// rewritten seed is caught without any witness.
func (s *VerifySuite) TestTamperedSeedDigestIsCaught() {
	forged := chain()
	forged[0].Digest = "forged"
	forged[1].PrevDigest = "forged" // chain relinked to match

	store := mocks.NewStoreMock(s.mc).ListCheckpointsMock.Return(forged, nil)

	got, err := service.New(store).Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, false)
	assert.Equal(s.T(), got.FailedID, int64(1))
}

// A witness older than the database (it was restored from backup, or the
// service ran a while without it) knows fewer checkpoints than exist. Fine.
func (s *VerifySuite) TestOlderWitnessThanDatabaseIsNotAFailure() {
	store := mocks.NewStoreMock(s.mc).
		ListCheckpointsMock.Return(chain(), nil).
		ComputeDigestMock.Return(9, 9, "good", nil)

	got, err := service.New(store).Verify(s.T().Context(), map[int64]string{1: seedDigest})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, true, got.Reason)
}

// verify runs Verify over store and returns the result, failing on an error.
func (s *VerifySuite) verify(store *mocks.StoreMock, witnessed map[int64]string) domain.VerifyResult {
	got, err := service.New(store).Verify(s.T().Context(), witnessed)
	assert.NilError(s.T(), err)
	return got
}

// The reported id and message of every failure, word for word.
func (s *VerifySuite) TestFailureReportsExactIDAndReason() {
	tampered := chain()
	tampered[0].Digest = "forged"
	tampered[1].PrevDigest = "forged"
	relinked := chain()
	relinked[1].PrevDigest = "unrelated"
	cases := []struct {
		name      string
		list      []domain.Checkpoint
		computed  string
		witnessed map[int64]string
		id        int64
		reason    string
	}{
		{
			name: "broken link", list: relinked,
			id:     2,
			reason: `chain broken: prev_digest "unrelated" does not match checkpoint 1 digest "` + seedDigest + `"`,
		},
		{
			name: "edited rows", list: chain(), computed: "different", id: 2,
			reason: `rows in (0, 9] no longer digest to "good" (got "different")`,
		},
		{
			name: "forged seed", list: tampered, id: 1,
			reason: `rows in (0, 0] no longer digest to "forged" (got "` + seedDigest + `")`,
		},
		{
			name: "witness disagrees", list: chain(), computed: "good", witnessed: map[int64]string{2: "other"}, id: 2,
			reason: `witness disagrees at checkpoint 2: file has "other", database has "good"`,
		},
		{
			name: "seed witness disagrees", list: chain(), witnessed: map[int64]string{1: "other"}, id: 1,
			reason: `witness disagrees at checkpoint 1: file has "other", database has "` + seedDigest + `"`,
		},
		{
			name: "digest is judged before the witness", list: chain(), computed: "different",
			witnessed: map[int64]string{2: "other"}, id: 2,
			reason: `rows in (0, 9] no longer digest to "good" (got "different")`,
		},
		{
			name:      "lowest missing witnessed id",
			list:      chain(),
			computed:  "good",
			witnessed: map[int64]string{9: "x", 7: "y", 3: "z", 2: "good"},
			id:        3,
			reason:    "witness records checkpoint 3 but the database has no such checkpoint: the journal tail was removed",
		},
		{
			name:      "witness against empty database",
			list:      nil,
			witnessed: map[int64]string{4: "x"},
			id:        4,
			reason:    "witness records checkpoint 4 but the database has no such checkpoint: the journal tail was removed",
		},
	}
	for _, c := range cases {
		store := mocks.NewStoreMock(s.mc).ListCheckpointsMock.Return(c.list, nil)
		if c.computed != "" {
			store.ComputeDigestMock.Return(9, 9, c.computed, nil)
		}
		got := s.verify(store, c.witnessed)
		assert.Equal(s.T(), got.OK, false, c.name)
		assert.Equal(s.T(), got.FailedID, c.id, c.name)
		assert.Equal(s.T(), got.Reason, c.reason, c.name)
		assert.Equal(s.T(), got.Checked, len(c.list), c.name)
	}
}

// The first failure stops the walk: a later checkpoint is never recomputed.
func (s *VerifySuite) TestFirstFailureStopsTheWalk() {
	list := append(chain(), domain.Checkpoint{ID: 3, FromID: 9, ToID: 12, Digest: "d3", PrevDigest: "good"})
	store := mocks.NewStoreMock(s.mc).ListCheckpointsMock.Return(list, nil).
		ComputeDigestMock.Return(9, 9, "different", nil)

	got := s.verify(store, nil)

	assert.Equal(s.T(), got.FailedID, int64(2))
	assert.Equal(s.T(), store.ComputeDigestAfterCounter(), uint64(1))
}

// Each non-seed checkpoint is recomputed over its own range and prev digest;
// the seed is never recomputed.
func (s *VerifySuite) TestRecomputesOverEachCheckpointsRange() {
	list := append(chain(), domain.Checkpoint{ID: 3, FromID: 9, ToID: 12, Digest: "d3", PrevDigest: "good"})
	ctx := s.T().Context()
	store := mocks.NewStoreMock(s.mc).ListCheckpointsMock.Return(list, nil)
	store.ComputeDigestMock.Set(func(_ context.Context, from, to int64, prev string) (int32, int64, string, error) {
		switch {
		case from == 0 && to == 9 && prev == seedDigest:
			return 9, 9, "good", nil
		case from == 9 && to == 12 && prev == "good":
			return 3, 12, "d3", nil
		}
		s.T().Errorf("unexpected ComputeDigest(%d, %d, %q)", from, to, prev)
		return 0, 0, "", nil
	})

	got, err := service.New(store).Verify(ctx, map[int64]string{3: "d3"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OK, true, got.Reason)
	assert.Equal(s.T(), got.Checked, 3)
	assert.Equal(s.T(), store.ComputeDigestAfterCounter(), uint64(2))
}

func (s *VerifySuite) TestListCheckpointsErrorIsReturned() {
	boom := errors.New("db down")
	store := mocks.NewStoreMock(s.mc).ListCheckpointsMock.Return(nil, boom)

	got, err := service.New(store).Verify(s.T().Context(), nil)

	assert.Equal(s.T(), err, boom)
	assert.DeepEqual(s.T(), got, domain.VerifyResult{})
}

func (s *VerifySuite) TestComputeDigestErrorIsWrappedWithCheckpointID() {
	boom := errors.New("db down")
	store := mocks.NewStoreMock(s.mc).ListCheckpointsMock.Return(chain(), nil).
		ComputeDigestMock.Return(0, 0, "", boom)

	got, err := service.New(store).Verify(s.T().Context(), nil)

	assert.ErrorIs(s.T(), err, boom)
	assert.Equal(s.T(), err.Error(), "audit.Verify: checkpoint 2: db down")
	assert.DeepEqual(s.T(), got, domain.VerifyResult{})
}
