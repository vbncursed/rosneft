package service_test

import (
	"errors"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Every item lands on the batch's territory, whatever it carried: the gateway
// gate checked that territory and no other.
func (s *PlacementsSuite) TestCreateBatchPinsEveryItemToTheTerritory() {
	stray := validPlacement()
	stray.TerritorySlug = "someone-elses"
	stray.Scale = domain.Vec3{}
	want := []domain.Placement{validPlacement(), validPlacement()}
	s.repo.CreatePlacementsMock.Expect(s.ctx, "", want).Return(want, nil)

	out, err := s.svc.CreatePlacements(s.ctx, "t1", "", []domain.Placement{stray, validPlacement()})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
}

// A key nothing is stored under yet rides to storage, which checks again
// inside the transaction that writes — that is what settles a race.
func (s *PlacementsSuite) TestCreateBatchHandsANewKeyToStorage() {
	want := []domain.Placement{validPlacement()}
	s.repo.PlacementBatchMock.Expect(s.ctx, "t1", "retry-1", 1).Return(nil, nil)
	s.repo.CreatePlacementsMock.Expect(s.ctx, "retry-1", want).Return(want, nil)

	_, err := s.svc.CreatePlacements(s.ctx, "t1", "retry-1", want)
	assert.NilError(s.T(), err)
}

// A replay answers the batch as stored before anything is checked against the
// territory as it is now: a panorama of the batch deleted since must not turn
// the retry of a batch that landed into a 400. No panorama lookup, no write.
func (s *PlacementsSuite) TestCreateBatchAnswersAStoredBatchBeforeCheckingPanoramas() {
	item := validPlacement()
	item.VisiblePanoramaIDs = []int64{9}
	stored := []domain.Placement{{ID: 41, TerritorySlug: "t1", ModelSlug: "m1"}}
	s.repo.PlacementBatchMock.Expect(s.ctx, "t1", "retry-1", 1).Return(stored, nil)

	out, err := s.svc.CreatePlacements(s.ctx, "t1", "retry-1", []domain.Placement{item})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out, stored)
}

func (s *PlacementsSuite) TestCreateBatchPassesAKeyConflictOn() {
	s.repo.PlacementBatchMock.Return(nil, domain.ErrIdempotencyConflict)

	_, err := s.svc.CreatePlacements(s.ctx, "t1", "retry-1", []domain.Placement{validPlacement()})
	assert.ErrorIs(s.T(), err, domain.ErrIdempotencyConflict)
}

func (s *PlacementsSuite) TestCreateBatchRejectsAnEmptyOrOversizedBatch() {
	_, err := s.svc.CreatePlacements(s.ctx, "t1", "", nil)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, err = s.svc.CreatePlacements(s.ctx, "t1", "", make([]domain.Placement, 101))
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateBatchRejectsABadItem() {
	bad := validPlacement()
	bad.Scale = domain.Vec3{X: 2, Y: 0, Z: 0}
	_, err := s.svc.CreatePlacements(s.ctx, "t1", "", []domain.Placement{validPlacement(), bad})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

// One allowlist lookup for the whole batch, not one per item.
func (s *PlacementsSuite) TestCreateBatchChecksPanoramasOnce() {
	a, b := validPlacement(), validPlacement()
	a.VisiblePanoramaIDs, b.VisiblePanoramaIDs = []int64{1}, []int64{2}
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Times(1).Return([]int64{1, 2}, nil)
	s.repo.CreatePlacementsMock.Expect(s.ctx, "", []domain.Placement{a, b}).Return([]domain.Placement{a, b}, nil)

	_, err := s.svc.CreatePlacements(s.ctx, "t1", "", []domain.Placement{a, b})
	assert.NilError(s.T(), err)
}

func (s *PlacementsSuite) TestCreateBatchRejectsAPanoramaOfAnotherTerritory() {
	a := validPlacement()
	a.VisiblePanoramaIDs = []int64{9}
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Return([]int64{1}, nil)

	_, err := s.svc.CreatePlacements(s.ctx, "t1", "", []domain.Placement{a})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
