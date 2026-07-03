package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

type PlacementVisibilitySuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	svc *service.Gateway
	ctx context.Context
}

func TestPlacementVisibilitySuite(t *testing.T) {
	suite.Run(t, new(PlacementVisibilitySuite))
}

func (s *PlacementVisibilitySuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.svc = service.New(s.cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc), mocks.NewUploadMock(mc))
	s.ctx = s.T().Context()
}

func (s *PlacementVisibilitySuite) TestRejectsEmptySlug() {
	_, err := s.svc.SetPlacementVisibility(s.ctx, "", 1, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestRejectsZeroID() {
	_, err := s.svc.SetPlacementVisibility(s.ctx, "t1", 0, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementVisibilitySuite) TestDelegatesAndReturnsUpdated() {
	s.cat.SetPlacementVisibilityMock.Expect(s.ctx, "t1", int64(1), []int64{10, 11}).
		Return(domain.Placement{ID: 1, TerritorySlug: "t1", VisiblePanoramaIDs: []int64{10, 11}}, nil)
	out, err := s.svc.SetPlacementVisibility(s.ctx, "t1", 1, []int64{10, 11})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.VisiblePanoramaIDs, []int64{10, 11})
}

func (s *PlacementVisibilitySuite) TestUnknownPlacementNotFound() {
	s.cat.SetPlacementVisibilityMock.Expect(s.ctx, "t1", int64(999), []int64{10}).
		Return(domain.Placement{}, domain.ErrPlacementNotFound)
	_, err := s.svc.SetPlacementVisibility(s.ctx, "t1", 999, []int64{10})
	assert.Assert(s.T(), errors.Is(err, domain.ErrPlacementNotFound))
}
