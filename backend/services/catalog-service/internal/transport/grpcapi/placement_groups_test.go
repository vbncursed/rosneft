package grpcapi_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi/mocks"
)

type PlacementGroupsSuite struct {
	suite.Suite
	svc *mocks.ServiceMock
	srv *grpcapi.Server
	ctx context.Context
}

func TestPlacementGroupsSuite(t *testing.T) { suite.Run(t, new(PlacementGroupsSuite)) }

func (s *PlacementGroupsSuite) SetupTest() {
	s.svc = mocks.NewServiceMock(minimock.NewController(s.T()))
	s.srv = grpcapi.New(s.svc)
	s.ctx = s.T().Context()
}

var north = domain.PlacementGroup{ID: 4, TerritorySlug: "t1", Title: "North"}

func (s *PlacementGroupsSuite) TestBulkWritesForwardTheRequestAndCount() {
	s.svc.SetPlacementsHiddenMock.Expect(s.ctx, "t1", []int64{1, 2}, true).Return(2, nil)
	hidden, err := s.srv.SetPlacementsHidden(s.ctx, &catalogv1.SetPlacementsHiddenRequest{
		TerritorySlug: "t1", Ids: []int64{1, 2}, Hidden: true,
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), hidden.GetUpdated(), uint32(2))

	s.svc.SetPlacementsGroupMock.Expect(s.ctx, "t1", []int64{1}, new(int64(4))).Return(1, nil)
	moved, err := s.srv.SetPlacementsGroup(s.ctx, &catalogv1.SetPlacementsGroupRequest{
		TerritorySlug: "t1", Ids: []int64{1}, GroupId: new(int64(4)),
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), moved.GetUpdated(), uint32(1))
}

// An absent group_id is "no group": it reaches the service as nil, not as 0.
func (s *PlacementGroupsSuite) TestAnAbsentGroupIsNoGroup() {
	s.svc.SetPlacementsGroupMock.Expect(s.ctx, "t1", []int64{1}, nil).Return(1, nil)
	_, err := s.srv.SetPlacementsGroup(s.ctx, &catalogv1.SetPlacementsGroupRequest{TerritorySlug: "t1", Ids: []int64{1}})
	assert.NilError(s.T(), err)
}

func (s *PlacementGroupsSuite) TestGroupWritesAnswerTheGroup() {
	s.svc.CreatePlacementGroupMock.Expect(s.ctx, "t1", "North").Return(north, nil)
	created, err := s.srv.CreatePlacementGroup(s.ctx, &catalogv1.CreatePlacementGroupRequest{TerritorySlug: "t1", Title: "North"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), created.GetGroup().GetId(), int64(4))
	assert.Equal(s.T(), created.GetGroup().GetTerritorySlug(), "t1")
	assert.Equal(s.T(), created.GetGroup().GetTitle(), "North")

	s.svc.RenamePlacementGroupMock.Expect(s.ctx, "t1", int64(4), "South").
		Return(domain.PlacementGroup{ID: 4, TerritorySlug: "t1", Title: "South"}, nil)
	renamed, err := s.srv.RenamePlacementGroup(s.ctx, &catalogv1.RenamePlacementGroupRequest{TerritorySlug: "t1", Id: 4, Title: "South"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), renamed.GetGroup().GetTitle(), "South")

	s.svc.ListPlacementGroupsMock.Expect(s.ctx, "t1").Return([]domain.PlacementGroup{north}, nil)
	listed, err := s.srv.ListPlacementGroups(s.ctx, &catalogv1.ListPlacementGroupsRequest{TerritorySlug: "t1"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(listed.GetGroups()), 1)

	s.svc.DeletePlacementGroupMock.Expect(s.ctx, "t1", int64(4)).Return(nil)
	_, err = s.srv.DeletePlacementGroup(s.ctx, &catalogv1.DeletePlacementGroupRequest{TerritorySlug: "t1", Id: 4})
	assert.NilError(s.T(), err)
}

// The gateway puts the message in the browser's 404 body, so it starts at the
// sentinel; a batch item keeps its index.
func (s *PlacementGroupsSuite) TestAForeignGroupIsNotFound() {
	s.svc.RenamePlacementGroupMock.Return(domain.PlacementGroup{}, domain.ErrPlacementGroupNotFound)
	_, err := s.srv.RenamePlacementGroup(s.ctx, &catalogv1.RenamePlacementGroupRequest{TerritorySlug: "t2", Id: 4, Title: "x"})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
	assert.Equal(s.T(), status.Convert(err).Message(), "placement group not found")

	s.svc.CreatePlacementsMock.Return(nil, fmt.Errorf("service.CreatePlacements: %w",
		domain.ItemError{Index: 1, Err: domain.ErrPlacementGroupNotFound}))
	_, err = s.srv.CreatePlacements(s.ctx, &catalogv1.CreatePlacementsRequest{TerritorySlug: "t1"})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
	assert.Equal(s.T(), status.Convert(err).Message(), "item 1: placement group not found")
}

func (s *PlacementGroupsSuite) TestAPlacementCarriesHiddenAndItsGroup() {
	s.svc.ListPlacementsMock.Expect(s.ctx, "t1").Return([]domain.Placement{
		{ID: 1, Hidden: true, GroupID: new(int64(4))},
		{ID: 2},
	}, nil)
	out, err := s.srv.ListPlacements(s.ctx, &catalogv1.ListPlacementsRequest{TerritorySlug: "t1"})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), out.GetPlacements()[0].GetHidden())
	assert.Equal(s.T(), out.GetPlacements()[0].GetGroupId(), int64(4))
	assert.Assert(s.T(), out.GetPlacements()[1].GroupId == nil, "no group is an absent field, not 0")
}

func (s *PlacementGroupsSuite) TestACreateCarriesItsGroup() {
	s.svc.CreatePlacementMock.
		Expect(s.ctx, domain.Placement{TerritorySlug: "t1", ModelSlug: "pump", GroupID: new(int64(4))}).
		Return(domain.Placement{ID: 9, GroupID: new(int64(4))}, nil)
	out, err := s.srv.CreatePlacement(s.ctx, &catalogv1.CreatePlacementRequest{
		TerritorySlug: "t1", ModelSlug: "pump", GroupId: new(int64(4)),
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.GetPlacement().GetGroupId(), int64(4))
}
