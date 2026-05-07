package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
)

type PlacementsSuite struct {
	suite.Suite
	repo *fakeRepo
	svc  *service.Catalog
}

func TestPlacementsSuite(t *testing.T) {
	suite.Run(t, new(PlacementsSuite))
}

func (s *PlacementsSuite) SetupTest() {
	s.repo = newFakeRepo()
	s.svc = service.New(s.repo)
}

// validPlacement returns a placement that passes service-layer validation.
// Tests start from this and tweak whichever field they want to exercise.
func validPlacement() domain.Placement {
	return domain.Placement{
		TerritorySlug: "t1",
		ModelSlug:     "m1",
		Scale:         domain.Vec3{X: 1, Y: 1, Z: 1},
	}
}

func (s *PlacementsSuite) TestCreateRejectsEmptyTerritorySlug() {
	p := validPlacement()
	p.TerritorySlug = ""
	_, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateRejectsEmptyModelSlug() {
	p := validPlacement()
	p.ModelSlug = ""
	_, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateAppliesDefaultScaleOnZeroVec() {
	p := validPlacement()
	p.Scale = domain.Vec3{} // all zero → defaultScale fills with {1,1,1}
	out, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})
	assert.DeepEqual(s.T(), s.repo.LastCreatePlacement.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})
}

func (s *PlacementsSuite) TestCreatePreservesExplicitNonUnitScale() {
	p := validPlacement()
	p.Scale = domain.Vec3{X: 2, Y: 3, Z: 4}
	out, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.Scale, domain.Vec3{X: 2, Y: 3, Z: 4})
}

func (s *PlacementsSuite) TestCreateRejectsPartiallyZeroScale() {
	// Mixed input like {2, 0, 0} bypasses defaultScale (zero check is on the
	// whole Vec3) and falls into the positive-component validator.
	p := validPlacement()
	p.Scale = domain.Vec3{X: 2, Y: 0, Z: 0}
	_, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateRejectsNegativeScale() {
	p := validPlacement()
	p.Scale = domain.Vec3{X: -1, Y: 1, Z: 1}
	_, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateAssignsID() {
	out, err := s.svc.CreatePlacement(s.T().Context(), validPlacement())
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), out.ID > 0)
}

func (s *PlacementsSuite) TestUpdateRejectsZeroID() {
	p := validPlacement()
	p.ID = 0
	_, err := s.svc.UpdatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestUpdateAppliesDefaultScaleOnZeroVec() {
	created, err := s.svc.CreatePlacement(s.T().Context(), validPlacement())
	assert.NilError(s.T(), err)

	created.Scale = domain.Vec3{}
	out, err := s.svc.UpdatePlacement(s.T().Context(), created)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})
}

func (s *PlacementsSuite) TestUpdateRejectsNegativeScale() {
	p := validPlacement()
	p.ID = 1
	p.Scale = domain.Vec3{X: -1, Y: 1, Z: 1}
	_, err := s.svc.UpdatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestUpdateReturnsNotFoundForUnknownID() {
	p := validPlacement()
	p.ID = 999
	_, err := s.svc.UpdatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrPlacementNotFound))
}

func (s *PlacementsSuite) TestDeleteRejectsZeroID() {
	err := s.svc.DeletePlacement(s.T().Context(), 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestDeleteRejectsNegativeID() {
	err := s.svc.DeletePlacement(s.T().Context(), -1)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestDeleteReturnsNotFoundForUnknownID() {
	err := s.svc.DeletePlacement(s.T().Context(), 999)
	assert.Assert(s.T(), errors.Is(err, domain.ErrPlacementNotFound))
}

func (s *PlacementsSuite) TestDeleteRemovesExisting() {
	created, err := s.svc.CreatePlacement(s.T().Context(), validPlacement())
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.svc.DeletePlacement(s.T().Context(), created.ID))

	got, err := s.svc.ListPlacements(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 0))
}

func (s *PlacementsSuite) TestListRejectsEmptySlug() {
	_, err := s.svc.ListPlacements(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestListReturnsOnlyMatchingTerritory() {
	ctx := s.T().Context()
	a := validPlacement()
	a.TerritorySlug = "alpha"
	b := validPlacement()
	b.TerritorySlug = "beta"
	_, err := s.svc.CreatePlacement(ctx, a)
	assert.NilError(s.T(), err)
	_, err = s.svc.CreatePlacement(ctx, b)
	assert.NilError(s.T(), err)

	got, err := s.svc.ListPlacements(ctx, "alpha")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 1))
	assert.Equal(s.T(), got[0].TerritorySlug, "alpha")
}
