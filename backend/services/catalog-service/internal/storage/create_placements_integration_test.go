//go:build integration

package storage_test

import (
	"fmt"
	"sync"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// batchOf is n placements of model on territory, the i-th at x = i+shift, so a
// second call with another shift is a different body under the same key.
func batchOf(territory, model string, n int, shift float64) []domain.Placement {
	out := make([]domain.Placement, n)
	for i := range n {
		out[i] = domain.Placement{
			TerritorySlug: territory, ModelSlug: model,
			Position: domain.Vec3{X: float64(i) + shift}, Scale: domain.Vec3{X: 1, Y: 1, Z: 1},
		}
	}
	return out
}

func idsOf(ps []domain.Placement) []int64 {
	out := make([]int64, len(ps))
	for i, p := range ps {
		out[i] = p.ID
	}
	return out
}

func (s *BatchSuite) countOn(territory string) int {
	listed, err := s.pg.ListPlacements(s.T().Context(), territory)
	assert.NilError(s.T(), err)
	return len(listed)
}

// A replay of a key answers the rows the first call created, in their order,
// and writes nothing: a dropped response followed by a retry places once.
func (s *BatchSuite) TestAReplayedKeyAnswersTheFirstBatchAndWritesNothing() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "idem-yard", s.admin)
	s.seedModel(ctx, "idem-pump")

	first, err := s.pg.CreatePlacements(ctx, "key-1", batchOf("idem-yard", "idem-pump", 3, 0))
	assert.NilError(s.T(), err)
	again, err := s.pg.CreatePlacements(ctx, "key-1", batchOf("idem-yard", "idem-pump", 3, 10))
	assert.NilError(s.T(), err)

	assert.DeepEqual(s.T(), idsOf(again), idsOf(first))
	assert.Equal(s.T(), again[2].Position.X, 2.0, "the stored rows, not the replay's body")
	assert.Equal(s.T(), again[0].TerritorySlug, "idem-yard")
	assert.Equal(s.T(), s.countOn("idem-yard"), 3)
}

// The key is scoped to its territory: the same key elsewhere is a new batch.
func (s *BatchSuite) TestAKeyIsNotSharedAcrossTerritories() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "idem-east", s.admin)
	s.seedTerritory(ctx, "idem-west", s.admin)
	s.seedModel(ctx, "idem-valve")

	east, err := s.pg.CreatePlacements(ctx, "shared", batchOf("idem-east", "idem-valve", 2, 0))
	assert.NilError(s.T(), err)
	west, err := s.pg.CreatePlacements(ctx, "shared", batchOf("idem-west", "idem-valve", 2, 0))
	assert.NilError(s.T(), err)

	assert.Equal(s.T(), west[0].TerritorySlug, "idem-west")
	assert.Assert(s.T(), west[0].ID != east[0].ID)
	assert.Equal(s.T(), s.countOn("idem-east"), 2)
	assert.Equal(s.T(), s.countOn("idem-west"), 2)
}

// A key reused for a batch of another size is not a retry of the first one.
func (s *BatchSuite) TestAKeyReusedForAnotherCountIsAConflict() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "idem-north", s.admin)
	s.seedModel(ctx, "idem-tank")

	_, err := s.pg.CreatePlacements(ctx, "key-n", batchOf("idem-north", "idem-tank", 2, 0))
	assert.NilError(s.T(), err)
	_, err = s.pg.CreatePlacements(ctx, "key-n", batchOf("idem-north", "idem-tank", 3, 0))
	assert.ErrorIs(s.T(), err, domain.ErrIdempotencyConflict)
	assert.Equal(s.T(), s.countOn("idem-north"), 2)
}

// A batch that landed and later lost rows to deletes is still the batch the
// key names: a replay answers what remains, 201, and is no conflict.
func (s *BatchSuite) TestAReplayOfABatchThatLostRowsAnswersWhatRemains() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "idem-edited", s.admin)
	s.seedModel(ctx, "idem-edited-pump")

	first, err := s.pg.CreatePlacements(ctx, "key-e", batchOf("idem-edited", "idem-edited-pump", 3, 0))
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pg.DeletePlacement(ctx, "idem-edited", first[1].ID))

	again, err := s.pg.CreatePlacements(ctx, "key-e", batchOf("idem-edited", "idem-edited-pump", 3, 0))
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), idsOf(again), []int64{first[0].ID, first[2].ID})
	assert.Equal(s.T(), s.countOn("idem-edited"), 2)
}

// A batch that lost rows is still the size it landed at: a replay of another
// count — even one matching what remains — is a conflict, and writes nothing.
func (s *BatchSuite) TestAKeyReusedForAnotherCountOnABatchThatLostRowsIsAConflict() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "idem-shrunk", s.admin)
	s.seedModel(ctx, "idem-shrunk-pump")

	first, err := s.pg.CreatePlacements(ctx, "key-s", batchOf("idem-shrunk", "idem-shrunk-pump", 3, 0))
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pg.DeletePlacement(ctx, "idem-shrunk", first[1].ID))

	_, err = s.pg.CreatePlacements(ctx, "key-s", batchOf("idem-shrunk", "idem-shrunk-pump", 2, 0))
	assert.ErrorIs(s.T(), err, domain.ErrIdempotencyConflict)
	assert.Equal(s.T(), s.countOn("idem-shrunk"), 2)
}

// PlacementBatch is the replay read on its own, for the service to answer a
// stored batch before it validates anything against today's territory.
func (s *BatchSuite) TestPlacementBatchReadsWhatAKeyStored() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "idem-read", s.admin)
	s.seedModel(ctx, "idem-read-pump")

	none, err := s.pg.PlacementBatch(ctx, "idem-read", "key-r", 2)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), none == nil)

	first, err := s.pg.CreatePlacements(ctx, "key-r", batchOf("idem-read", "idem-read-pump", 2, 0))
	assert.NilError(s.T(), err)
	stored, err := s.pg.PlacementBatch(ctx, "idem-read", "key-r", 2)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), idsOf(stored), idsOf(first))
	_, err = s.pg.PlacementBatch(ctx, "idem-read", "key-r", 3)
	assert.ErrorIs(s.T(), err, domain.ErrIdempotencyConflict)
}

// Without a key every call is its own batch, as before.
func (s *BatchSuite) TestWithoutAKeyEveryCallWrites() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "idem-free", s.admin)
	s.seedModel(ctx, "idem-free-pump")

	for range 2 {
		_, err := s.pg.CreatePlacements(ctx, "", batchOf("idem-free", "idem-free-pump", 2, 0))
		assert.NilError(s.T(), err)
	}
	assert.Equal(s.T(), s.countOn("idem-free"), 4)
}

// Two requests racing on one key write one batch, and the loser answers the
// winner's rows rather than an error. Several rounds, so the pair really does
// collide inside the transaction and not only at the first SELECT.
func (s *BatchSuite) TestAConcurrentPairOnOneKeyWritesOneBatch() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "idem-race", s.admin)
	s.seedModel(ctx, "idem-race-pump")

	const rounds, size = 10, 5
	for round := range rounds {
		key := fmt.Sprintf("race-%d", round)
		var (
			wg    sync.WaitGroup
			start = make(chan struct{})
			got   [2][]domain.Placement
			errs  [2]error
		)
		for i := range 2 {
			wg.Go(func() {
				<-start
				got[i], errs[i] = s.pg.CreatePlacements(ctx, key, batchOf("idem-race", "idem-race-pump", size, 0))
			})
		}
		close(start)
		wg.Wait()

		assert.NilError(s.T(), errs[0])
		assert.NilError(s.T(), errs[1])
		assert.DeepEqual(s.T(), idsOf(got[0]), idsOf(got[1]))
	}
	assert.Equal(s.T(), s.countOn("idem-race"), rounds*size)
}
