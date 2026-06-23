package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

type PlacementVisibilitySuite struct {
	suite.Suite
	cat *fakeCatalog
	svc *service.Gateway
}

func TestPlacementVisibilitySuite(t *testing.T) {
	suite.Run(t, new(PlacementVisibilitySuite))
}

func (s *PlacementVisibilitySuite) SetupTest() {
	s.cat = newFakeCatalog()
	s.svc = service.New(s.cat, newFakeMesh(), &fakeUpload{})
	s.cat.placements[1] = domain.Placement{ID: 1, TerritorySlug: "t1"}
}

func (s *PlacementVisibilitySuite) TestRejectsEmptySlug() {
	_, err := s.svc.SetPlacementVisibility(s.T().Context(), "", 1, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestRejectsZeroID() {
	_, err := s.svc.SetPlacementVisibility(s.T().Context(), "t1", 0, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestDelegatesAndReturnsUpdated() {
	out, err := s.svc.SetPlacementVisibility(s.T().Context(), "t1", 1, []int64{10, 11})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.VisiblePanoramaIDs, []int64{10, 11})
}

func (s *PlacementVisibilitySuite) TestUnknownPlacementNotFound() {
	_, err := s.svc.SetPlacementVisibility(s.T().Context(), "t1", 999, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrPlacementNotFound))
}
