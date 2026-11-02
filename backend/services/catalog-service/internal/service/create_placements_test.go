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

func (s *PlacementsSuite) TestCreateBatchSizeRefusalNamesTheCount() {
	_, err := s.svc.CreatePlacements(s.ctx, "t1", "", nil)
	assert.ErrorContains(
		s.T(),
		err,
		"service.CreatePlacements: invalid input: a batch holds 1 to 100 placements, got 0",
	)
	_, err = s.svc.CreatePlacements(s.ctx, "t1", "", make([]domain.Placement, 101))
	assert.ErrorContains(s.T(), err, "a batch holds 1 to 100 placements, got 101")
}

// Exactly 100 is the largest batch; nothing is looked up for a size refusal.
func (s *PlacementsSuite) TestCreateBatchAcceptsExactlyTheMaximum() {
	items := make([]domain.Placement, 100)
	for i := range items {
		items[i] = validPlacement()
	}
	s.repo.CreatePlacementsMock.Expect(s.ctx, "", items).Return(items, nil)

	out, err := s.svc.CreatePlacements(s.ctx, "t1", "", items)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 100)
}

// A bad item is reported with its position, first one wins, and it is judged
// before the idempotency lookup (the strict repo mock has no expectation).
func (s *PlacementsSuite) TestCreateBatchItemErrorCarriesIndexBeforeAnyLookup() {
	noModel := validPlacement()
	noModel.ModelSlug = ""
	badScale := validPlacement()
	badScale.Scale = domain.Vec3{X: 1, Y: -1, Z: 1}

	_, err := s.svc.CreatePlacements(
		s.ctx, "t1", "retry-1", []domain.Placement{validPlacement(), badScale, noModel},
	)

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	item, ok := errors.AsType[domain.ItemError](err)
	assert.Assert(s.T(), ok, "got %v", err)
	assert.Equal(s.T(), item.Index, 1)
	assert.ErrorContains(
		s.T(),
		err,
		"service.CreatePlacements: item 1: invalid input: scale components must be positive",
	)
}

func (s *PlacementsSuite) TestCreateBatchItemWithoutModelIsRefusedByIndex() {
	noModel := validPlacement()
	noModel.ModelSlug = ""

	_, err := s.svc.CreatePlacements(s.ctx, "t1", "", []domain.Placement{noModel})

	item, ok := errors.AsType[domain.ItemError](err)
	assert.Assert(s.T(), ok, "got %v", err)
	assert.Equal(s.T(), item.Index, 0)
	assert.ErrorContains(s.T(), err, "model_slug are required")
}

// An empty territory slug fails the same way: every item is pinned to it.
func (s *PlacementsSuite) TestCreateBatchEmptyTerritorySlugIsRefusedAsItemZero() {
	_, err := s.svc.CreatePlacements(s.ctx, "", "", []domain.Placement{validPlacement()})

	item, ok := errors.AsType[domain.ItemError](err)
	assert.Assert(s.T(), ok, "got %v", err)
	assert.Equal(s.T(), item.Index, 0)
}

func (s *PlacementsSuite) TestCreateBatchLookupFailureIsReturnedRaw() {
	boom := errors.New("db down")
	s.repo.PlacementBatchMock.Return(nil, boom)

	out, err := s.svc.CreatePlacements(s.ctx, "t1", "retry-1", []domain.Placement{validPlacement()})
	assert.Equal(s.T(), err, boom)
	assert.Assert(s.T(), out == nil)
}

// Any non-nil stored answer ends the call, even an empty one.
func (s *PlacementsSuite) TestCreateBatchEmptyStoredAnswerIsStillAReplay() {
	stored := []domain.Placement{}
	s.repo.PlacementBatchMock.Return(stored, nil)

	out, err := s.svc.CreatePlacements(s.ctx, "t1", "retry-1", []domain.Placement{validPlacement()})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), out != nil && len(out) == 0)
}

func (s *PlacementsSuite) TestCreateBatchPanoramaRefusalNamesIdAndTerritory() {
	a := validPlacement()
	a.VisiblePanoramaIDs = []int64{9}
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Return([]int64{1}, nil)

	_, err := s.svc.CreatePlacements(s.ctx, "t1", "", []domain.Placement{a})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(
		s.T(), err, `service.CreatePlacements: invalid input: panorama 9 is not on territory "t1"`,
	)
}

// The same panorama named by every copy is checked, and only looked up, once;
// the allowlists reach storage untouched.
func (s *PlacementsSuite) TestCreateBatchSharedPanoramaPassesAndReachesStorage() {
	a, b := validPlacement(), validPlacement()
	a.VisiblePanoramaIDs, b.VisiblePanoramaIDs = []int64{4, 5}, []int64{5, 4}
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Times(1).Return([]int64{4, 5, 6}, nil)
	s.repo.CreatePlacementsMock.Expect(s.ctx, "k", []domain.Placement{a, b}).Return([]domain.Placement{a, b}, nil)
	s.repo.PlacementBatchMock.Expect(s.ctx, "t1", "k", 2).Return(nil, nil)

	_, err := s.svc.CreatePlacements(s.ctx, "t1", "k", []domain.Placement{a, b})
	assert.NilError(s.T(), err)
}

func (s *PlacementsSuite) TestCreateBatchUnknownTerritoryFromPanoramaLookup() {
	a := validPlacement()
	a.VisiblePanoramaIDs = []int64{1}
	s.repo.ListPanoramaIDsMock.Return(nil, domain.ErrTerritoryNotFound)

	_, err := s.svc.CreatePlacements(s.ctx, "t1", "", []domain.Placement{a})
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
	assert.ErrorContains(s.T(), err, "service.CreatePlacements: ")
}

func (s *PlacementsSuite) TestCreateBatchStorageErrorIsReturnedRaw() {
	boom := errors.New("tx failed")
	want := []domain.Placement{validPlacement()}
	s.repo.CreatePlacementsMock.Expect(s.ctx, "", want).Return(nil, boom)

	out, err := s.svc.CreatePlacements(s.ctx, "t1", "", want)
	assert.Equal(s.T(), err, boom)
	assert.Assert(s.T(), out == nil)
}

// The pre-existing mismatch is storage's call (ErrIdempotencyConflict from
// PlacementBatch above); a stored batch that is nil with no error falls through
// to a write and answers what storage answers.
func (s *PlacementsSuite) TestCreateBatchKeyedMissWritesAndReturnsStorageRows() {
	want := []domain.Placement{validPlacement()}
	created := []domain.Placement{{ID: 7, TerritorySlug: "t1", ModelSlug: "m1"}}
	s.repo.PlacementBatchMock.Expect(s.ctx, "t1", "k", 1).Return(nil, nil)
	s.repo.CreatePlacementsMock.Expect(s.ctx, "k", want).Return(created, nil)

	out, err := s.svc.CreatePlacements(s.ctx, "t1", "k", want)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out, created)
}
