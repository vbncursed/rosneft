package service_test

import (
	"errors"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

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

func (s *PlacementsSuite) TestCreateRejectsPanoramaFromAnotherTerritory() {
	p := validPlacement()
	p.VisiblePanoramaIDs = []int64{999}
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Return([]int64{10}, nil)
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateAcceptsPanoramaOnTheSameTerritory() {
	p := validPlacement()
	p.VisiblePanoramaIDs = []int64{10}
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Return([]int64{10}, nil)
	s.repo.CreatePlacementMock.Expect(s.ctx, p).Return(p, nil)
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.NilError(s.T(), err)
}

func (s *PlacementsSuite) TestCreateAssignsID() {
	forwarded := validPlacement()
	s.repo.CreatePlacementMock.Expect(s.ctx, forwarded).Return(domain.Placement{ID: 1}, nil)
	out, err := s.svc.CreatePlacement(s.ctx, validPlacement())
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), out.ID > 0)
}
