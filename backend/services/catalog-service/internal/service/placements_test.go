package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

type PlacementsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestPlacementsSuite(t *testing.T) {
	suite.Run(t, new(PlacementsSuite))
}

func (s *PlacementsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
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
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateRejectsEmptyModelSlug() {
	p := validPlacement()
	p.ModelSlug = ""
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateAppliesDefaultScaleOnZeroVec() {
	p := validPlacement()
	p.Scale = domain.Vec3{} // all zero → defaultScale fills with {1,1,1}
	// Expect verifies the service forwarded the filled-in scale, not the zero vec.
	forwarded := validPlacement()
	s.repo.CreatePlacementMock.Expect(s.ctx, forwarded).Return(forwarded, nil)
	out, err := s.svc.CreatePlacement(s.ctx, p)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})
}

func (s *PlacementsSuite) TestCreatePreservesExplicitNonUnitScale() {
	p := validPlacement()
	p.Scale = domain.Vec3{X: 2, Y: 3, Z: 4}
	s.repo.CreatePlacementMock.Expect(s.ctx, p).Return(p, nil)
	out, err := s.svc.CreatePlacement(s.ctx, p)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.Scale, domain.Vec3{X: 2, Y: 3, Z: 4})
}

func (s *PlacementsSuite) TestCreateRejectsPartiallyZeroScale() {
	// Mixed input like {2, 0, 0} bypasses defaultScale (zero check is on the
	// whole Vec3) and falls into the positive-component validator.
	p := validPlacement()
	p.Scale = domain.Vec3{X: 2, Y: 0, Z: 0}
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateRejectsNegativeScale() {
	p := validPlacement()
	p.Scale = domain.Vec3{X: -1, Y: 1, Z: 1}
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateAssignsID() {
	forwarded := validPlacement()
	s.repo.CreatePlacementMock.Expect(s.ctx, forwarded).Return(domain.Placement{ID: 1}, nil)
	out, err := s.svc.CreatePlacement(s.ctx, validPlacement())
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), out.ID > 0)
}

func (s *PlacementsSuite) TestUpdateRejectsZeroID() {
	p := validPlacement()
	p.ID = 0
	_, err := s.svc.UpdatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestUpdateAppliesDefaultScaleOnZeroVec() {
	p := validPlacement()
	p.ID = 1
	p.Scale = domain.Vec3{}
	forwarded := p
	forwarded.Scale = domain.Vec3{X: 1, Y: 1, Z: 1}
	s.repo.UpdatePlacementMock.Expect(s.ctx, forwarded).Return(forwarded, nil)
	out, err := s.svc.UpdatePlacement(s.ctx, p)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})
}

func (s *PlacementsSuite) TestUpdateRejectsNegativeScale() {
	p := validPlacement()
	p.ID = 1
	p.Scale = domain.Vec3{X: -1, Y: 1, Z: 1}
	_, err := s.svc.UpdatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestUpdateReturnsNotFoundForUnknownID() {
	p := validPlacement()
	p.ID = 999
	s.repo.UpdatePlacementMock.Expect(s.ctx, p).Return(domain.Placement{}, domain.ErrPlacementNotFound)
	_, err := s.svc.UpdatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrPlacementNotFound))
}

func (s *PlacementsSuite) TestDeleteRejectsZeroID() {
	err := s.svc.DeletePlacement(s.ctx, 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestDeleteRejectsNegativeID() {
	err := s.svc.DeletePlacement(s.ctx, -1)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestDeleteReturnsNotFoundForUnknownID() {
	s.repo.DeletePlacementMock.Expect(s.ctx, int64(999)).Return(domain.ErrPlacementNotFound)
	err := s.svc.DeletePlacement(s.ctx, 999)
	assert.Assert(s.T(), errors.Is(err, domain.ErrPlacementNotFound))
}

func (s *PlacementsSuite) TestDeleteRemovesExisting() {
	s.repo.DeletePlacementMock.Expect(s.ctx, int64(1)).Return(nil)
	assert.NilError(s.T(), s.svc.DeletePlacement(s.ctx, 1))
}

func (s *PlacementsSuite) TestListRejectsEmptySlug() {
	_, err := s.svc.ListPlacements(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestListReturnsOnlyMatchingTerritory() {
	s.repo.ListPlacementsMock.Expect(s.ctx, "alpha").
		Return([]domain.Placement{{ID: 1, TerritorySlug: "alpha", ModelSlug: "m1"}}, nil)
	got, err := s.svc.ListPlacements(s.ctx, "alpha")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got, 1))
	assert.Equal(s.T(), got[0].TerritorySlug, "alpha")
}
