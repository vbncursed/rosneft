package service_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

// PlacementGroupsSuite covers the gateway's guard in front of the catalog: an
// empty or oversized id list never costs an RPC. Titles and ids are the
// catalog's to judge; they come back as InvalidArgument or NotFound.
type PlacementGroupsSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	svc *service.Gateway
	ctx context.Context
}

func TestPlacementGroupsSuite(t *testing.T) { suite.Run(t, new(PlacementGroupsSuite)) }

func (s *PlacementGroupsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.svc = service.New(s.cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
}

func (s *PlacementGroupsSuite) TestBulkWritesAreBoundedBeforeTheCatalogIsAsked() {
	for _, ids := range [][]int64{nil, make([]int64, 1001)} {
		_, err := s.svc.SetPlacementsHidden(s.ctx, "yard", ids, true)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		_, err = s.svc.SetPlacementsGroup(s.ctx, "yard", ids, nil)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	}
}

func (s *PlacementGroupsSuite) TestBulkWritesReachTheCatalog() {
	s.cat.SetPlacementsHiddenMock.Expect(s.ctx, "yard", []int64{1, 2}, true).Return(2, nil)
	n, err := s.svc.SetPlacementsHidden(s.ctx, "yard", []int64{1, 2}, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)

	s.cat.SetPlacementsGroupMock.Expect(s.ctx, "yard", []int64{1}, new(int64(4))).Return(1, nil)
	n, err = s.svc.SetPlacementsGroup(s.ctx, "yard", []int64{1}, new(int64(4)))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}

func (s *PlacementGroupsSuite) TestGroupWritesReachTheCatalog() {
	north := domain.PlacementGroup{ID: 4, TerritorySlug: "yard", Title: "North"}
	s.cat.CreatePlacementGroupMock.Expect(s.ctx, "yard", "North").Return(north, nil)
	s.cat.RenamePlacementGroupMock.Expect(s.ctx, "yard", int64(4), "South").Return(north, nil)
	s.cat.DeletePlacementGroupMock.Expect(s.ctx, "yard", int64(4)).Return(domain.ErrPlacementGroupNotFound)

	got, err := s.svc.CreatePlacementGroup(s.ctx, "yard", "North")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, north)
	_, err = s.svc.RenamePlacementGroup(s.ctx, "yard", 4, "South")
	assert.NilError(s.T(), err)
	assert.ErrorIs(s.T(), s.svc.DeletePlacementGroup(s.ctx, "yard", 4), domain.ErrPlacementGroupNotFound)
}
