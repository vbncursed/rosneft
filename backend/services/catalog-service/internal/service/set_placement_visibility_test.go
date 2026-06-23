package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
)

type PlacementVisibilitySuite struct {
	suite.Suite
	repo *fakeRepo
	svc  *service.Catalog
}

func TestPlacementVisibilitySuite(t *testing.T) {
	suite.Run(t, new(PlacementVisibilitySuite))
}

func (s *PlacementVisibilitySuite) SetupTest() {
	s.repo = newFakeRepo()
	s.svc = service.New(s.repo)
	// A territory with two panoramas and one placement.
	s.repo.territories["t1"] = domain.Territory{Slug: "t1"}
	s.repo.panoramas[10] = domain.Panorama{ID: 10, TerritorySlug: "t1"}
	s.repo.panoramas[11] = domain.Panorama{ID: 11, TerritorySlug: "t1"}
	s.repo.placements[1] = domain.Placement{ID: 1, TerritorySlug: "t1", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}}
}

func (s *PlacementVisibilitySuite) TestRejectsEmptyTerritorySlug() {
	_, err := s.svc.SetPlacementVisibility(s.T().Context(), "", 1, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestRejectsZeroPlacementID() {
	_, err := s.svc.SetPlacementVisibility(s.T().Context(), "t1", 0, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestRejectsPanoramaNotOnTerritory() {
	_, err := s.svc.SetPlacementVisibility(s.T().Context(), "t1", 1, []int64{999})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestUnknownTerritoryPropagates() {
	_, err := s.svc.SetPlacementVisibility(s.T().Context(), "ghost", 1, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *PlacementVisibilitySuite) TestUnknownPlacementNotFound() {
	_, err := s.svc.SetPlacementVisibility(s.T().Context(), "t1", 999, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrPlacementNotFound))
}

func (s *PlacementVisibilitySuite) TestReplacesAllowlist() {
	out, err := s.svc.SetPlacementVisibility(s.T().Context(), "t1", 1, []int64{10, 11})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.VisiblePanoramaIDs, []int64{10, 11})
	assert.DeepEqual(s.T(), s.repo.placements[1].VisiblePanoramaIDs, []int64{10, 11})
}

func (s *PlacementVisibilitySuite) TestEmptyAllowlistClears() {
	_, err := s.svc.SetPlacementVisibility(s.T().Context(), "t1", 1, []int64{10})
	assert.NilError(s.T(), err)
	out, err := s.svc.SetPlacementVisibility(s.T().Context(), "t1", 1, []int64{})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), len(out.VisiblePanoramaIDs) == 0)
}
