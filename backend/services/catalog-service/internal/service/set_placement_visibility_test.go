package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

type PlacementVisibilitySuite struct {
	suite.Suite
	repo  *mocks.RepositoryMock
	svc   *service.Catalog
	ctx   context.Context
	panoIDs []int64
}

func TestPlacementVisibilitySuite(t *testing.T) {
	suite.Run(t, new(PlacementVisibilitySuite))
}

func (s *PlacementVisibilitySuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
	// Territory t1 has two panoramas; tests reference 10 and 11 as the valid set.
	s.panoIDs = []int64{10, 11}
}

func (s *PlacementVisibilitySuite) TestRejectsEmptyTerritorySlug() {
	_, err := s.svc.SetPlacementVisibility(s.ctx, "", 1, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestRejectsZeroPlacementID() {
	_, err := s.svc.SetPlacementVisibility(s.ctx, "t1", 0, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestRejectsPanoramaNotOnTerritory() {
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Return(s.panoIDs, nil)
	_, err := s.svc.SetPlacementVisibility(s.ctx, "t1", 1, []int64{999})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestUnknownTerritoryPropagates() {
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "ghost").Return(nil, domain.ErrTerritoryNotFound)
	_, err := s.svc.SetPlacementVisibility(s.ctx, "ghost", 1, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *PlacementVisibilitySuite) TestUnknownPlacementNotFound() {
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Return(s.panoIDs, nil)
	s.repo.SetPlacementVisibilityMock.Expect(s.ctx, "t1", int64(999), []int64{10}).
		Return(domain.Placement{}, domain.ErrPlacementNotFound)
	_, err := s.svc.SetPlacementVisibility(s.ctx, "t1", 999, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrPlacementNotFound))
}

func (s *PlacementVisibilitySuite) TestReplacesAllowlist() {
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Return(s.panoIDs, nil)
	s.repo.SetPlacementVisibilityMock.Expect(s.ctx, "t1", int64(1), []int64{10, 11}).
		Return(domain.Placement{ID: 1, TerritorySlug: "t1", VisiblePanoramaIDs: []int64{10, 11}}, nil)
	out, err := s.svc.SetPlacementVisibility(s.ctx, "t1", 1, []int64{10, 11})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.VisiblePanoramaIDs, []int64{10, 11})
}

func (s *PlacementVisibilitySuite) TestEmptyAllowlistClears() {
	s.repo.ListPanoramaIDsMock.Expect(s.ctx, "t1").Return(s.panoIDs, nil)
	s.repo.SetPlacementVisibilityMock.Expect(s.ctx, "t1", int64(1), []int64{}).
		Return(domain.Placement{ID: 1, TerritorySlug: "t1"}, nil)
	out, err := s.svc.SetPlacementVisibility(s.ctx, "t1", 1, []int64{})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), len(out.VisiblePanoramaIDs) == 0)
}
