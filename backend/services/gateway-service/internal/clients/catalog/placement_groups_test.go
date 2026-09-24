// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// groupCC records the last request of each hide/group call and answers with a
// fixed group or a fixed error.
type groupCC struct {
	catalogv1.CatalogServiceClient
	err    error
	hidden *catalogv1.SetPlacementsHiddenRequest
	moved  *catalogv1.SetPlacementsGroupRequest
	create *catalogv1.CreatePlacementGroupRequest
	rename *catalogv1.RenamePlacementGroupRequest
	del    *catalogv1.DeletePlacementGroupRequest
}

var wireGroup = &catalogv1.PlacementGroup{Id: 4, TerritorySlug: "yard", Title: "North"}

func (g *groupCC) SetPlacementsHidden(
	_ context.Context, in *catalogv1.SetPlacementsHiddenRequest, _ ...grpc.CallOption,
) (*catalogv1.SetPlacementsHiddenResponse, error) {
	g.hidden = in
	return &catalogv1.SetPlacementsHiddenResponse{Updated: 2}, g.err
}

func (g *groupCC) SetPlacementsGroup(
	_ context.Context, in *catalogv1.SetPlacementsGroupRequest, _ ...grpc.CallOption,
) (*catalogv1.SetPlacementsGroupResponse, error) {
	g.moved = in
	return &catalogv1.SetPlacementsGroupResponse{Updated: 1}, g.err
}

func (g *groupCC) CreatePlacementGroup(
	_ context.Context, in *catalogv1.CreatePlacementGroupRequest, _ ...grpc.CallOption,
) (*catalogv1.CreatePlacementGroupResponse, error) {
	g.create = in
	return &catalogv1.CreatePlacementGroupResponse{Group: wireGroup}, g.err
}

func (g *groupCC) RenamePlacementGroup(
	_ context.Context, in *catalogv1.RenamePlacementGroupRequest, _ ...grpc.CallOption,
) (*catalogv1.RenamePlacementGroupResponse, error) {
	g.rename = in
	return &catalogv1.RenamePlacementGroupResponse{Group: wireGroup}, g.err
}

func (g *groupCC) DeletePlacementGroup(
	_ context.Context, in *catalogv1.DeletePlacementGroupRequest, _ ...grpc.CallOption,
) (*catalogv1.DeletePlacementGroupResponse, error) {
	g.del = in
	return &catalogv1.DeletePlacementGroupResponse{}, g.err
}

func (g *groupCC) ListPlacementGroups(
	context.Context, *catalogv1.ListPlacementGroupsRequest, ...grpc.CallOption,
) (*catalogv1.ListPlacementGroupsResponse, error) {
	if g.err != nil {
		return nil, g.err
	}
	return &catalogv1.ListPlacementGroupsResponse{Groups: []*catalogv1.PlacementGroup{wireGroup}}, nil
}

type PlacementGroupsSuite struct{ suite.Suite }

func TestPlacementGroupsSuite(t *testing.T) { suite.Run(t, new(PlacementGroupsSuite)) }

func (s *PlacementGroupsSuite) TestBulkWritesTravelUnderTheTerritory() {
	cc := &groupCC{}
	c := &Client{cc: cc}
	ctx := s.T().Context()

	n, err := c.SetPlacementsHidden(ctx, "yard", []int64{1, 2}, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)
	assert.Equal(s.T(), cc.hidden.GetTerritorySlug(), "yard")
	assert.DeepEqual(s.T(), cc.hidden.GetIds(), []int64{1, 2})
	assert.Assert(s.T(), cc.hidden.GetHidden())

	_, err = c.SetPlacementsGroup(ctx, "yard", []int64{3}, new(int64(4)))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.moved.GetGroupId(), int64(4))

	_, err = c.SetPlacementsGroup(ctx, "yard", []int64{3}, nil)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cc.moved.GroupId == nil, "no group travels as an absent field")
}

func (s *PlacementGroupsSuite) TestGroupWritesAnswerTheGroup() {
	cc := &groupCC{}
	c := &Client{cc: cc}
	ctx := s.T().Context()

	g, err := c.CreatePlacementGroup(ctx, "yard", "North")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), g.ID, int64(4))
	assert.Equal(s.T(), g.Title, "North")
	assert.Equal(s.T(), cc.create.GetTerritorySlug(), "yard")

	_, err = c.RenamePlacementGroup(ctx, "yard", 4, "South")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.rename.GetId(), int64(4))
	assert.Equal(s.T(), cc.rename.GetTitle(), "South")

	assert.NilError(s.T(), c.DeletePlacementGroup(ctx, "yard", 4))
	assert.Equal(s.T(), cc.del.GetTerritorySlug(), "yard")
}

// A refusal reaches the browser in the catalog's words alone, and its sentinel
// is the one the message names: a group, a placement, or a bad input.
func (s *PlacementGroupsSuite) TestARefusalNamesWhatIsMissing() {
	for _, tc := range []struct {
		name string
		err  error
		want error
	}{
		{"an unknown group", status.Error(codes.NotFound, "placement group not found"), domain.ErrPlacementGroupNotFound},
		{"an unknown placement", status.Error(codes.NotFound, "placement not found"), domain.ErrPlacementNotFound},
		{"a blank title", status.Error(codes.InvalidArgument, "invalid input: a group title is 1 to 120 characters, got 0"), domain.ErrInvalidInput},
	} {
		s.Run(tc.name, func() {
			c := &Client{cc: &groupCC{err: tc.err}}
			msg := status.Convert(tc.err).Message()
			_, err := c.SetPlacementsGroup(s.T().Context(), "yard", []int64{1}, new(int64(4)))
			assert.ErrorIs(s.T(), err, tc.want)
			assert.Equal(s.T(), err.Error(), msg)
			_, err = c.RenamePlacementGroup(s.T().Context(), "yard", 4, "x")
			assert.ErrorIs(s.T(), err, tc.want)
			assert.Equal(s.T(), err.Error(), msg)
		})
	}
}

// A batch item naming a group of another territory is the group's 404, not
// the model's.
func (s *PlacementGroupsSuite) TestACreateIntoAForeignGroupIsGroupNotFound() {
	c := &Client{cc: refusingCC{err: status.Error(codes.NotFound, "item 1: placement group not found")}}
	_, err := c.CreatePlacements(s.T().Context(), "yard", "", []domain.Placement{{ModelSlug: "pump"}})
	assert.ErrorIs(s.T(), err, domain.ErrPlacementGroupNotFound)
	assert.Equal(s.T(), err.Error(), "item 1: placement group not found")
}

func (s *PlacementGroupsSuite) TestAPlacementCarriesHiddenAndItsGroup() {
	p := placementFromProto(&catalogv1.Placement{Id: 1, Hidden: true, GroupId: new(int64(4))})
	assert.Assert(s.T(), p.Hidden)
	assert.DeepEqual(s.T(), p.GroupID, new(int64(4)))
	assert.Assert(s.T(), placementFromProto(&catalogv1.Placement{Id: 2}).GroupID == nil)

	req := createPlacementRequest(domain.Placement{ModelSlug: "pump", GroupID: new(int64(4))})
	assert.Equal(s.T(), req.GetGroupId(), int64(4))
}

// A catalog that predates groups (a gateway deployed first, or a catalog
// rolled back) answers Unimplemented. The scene must still load, groupless.
func (s *PlacementGroupsSuite) TestListingOnACatalogWithoutGroupsIsNoGroups() {
	c := &Client{cc: &groupCC{err: status.Error(codes.Unimplemented, "unknown method ListPlacementGroups")}}
	groups, err := c.ListPlacementGroups(s.T().Context(), "yard")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(groups), 0)
}

func (s *PlacementGroupsSuite) TestAListingFailureOtherThanUnimplementedPassesThrough() {
	c := &Client{cc: &groupCC{err: status.Error(codes.Unavailable, "catalog down")}}
	_, err := c.ListPlacementGroups(s.T().Context(), "yard")
	assert.Equal(s.T(), status.Code(err), codes.Unavailable)
}
