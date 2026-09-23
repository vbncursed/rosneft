// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type placementBatchCC struct {
	catalogv1.CatalogServiceClient
	got *catalogv1.CreatePlacementsRequest
}

func (p *placementBatchCC) CreatePlacements(
	_ context.Context, in *catalogv1.CreatePlacementsRequest, _ ...grpc.CallOption,
) (*catalogv1.CreatePlacementsResponse, error) {
	p.got = in
	out := make([]*catalogv1.Placement, len(in.GetItems()))
	for i, it := range in.GetItems() {
		out[i] = &catalogv1.Placement{Id: int64(i + 1), TerritorySlug: in.GetTerritorySlug(), ModelSlug: it.GetModelSlug()}
	}
	return &catalogv1.CreatePlacementsResponse{Placements: out}, nil
}

type PlacementBatchSuite struct{ suite.Suite }

func TestPlacementBatchSuite(t *testing.T) { suite.Run(t, new(PlacementBatchSuite)) }

func (s *PlacementBatchSuite) TestTheBatchTravelsUnderItsTerritory() {
	cc := &placementBatchCC{}
	got, err := (&Client{cc: cc}).CreatePlacements(s.T().Context(), "yard", []domain.Placement{
		{ModelSlug: "pump", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}},
		{ModelSlug: "tank", Position: domain.Vec3{X: 2}, Scale: domain.Vec3{X: 1, Y: 1, Z: 1}},
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.got.GetTerritorySlug(), "yard")
	assert.Equal(s.T(), cc.got.GetItems()[1].GetPosition().GetX(), 2.0)
	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[1].ModelSlug, "tank")
}

// A refused create reaches the browser as the catalog's own message ("item 2:
// model not found"), never the gRPC framing, and carries the sentinel the
// handler maps to a status. Anything else stays an internal error.
func (s *PlacementBatchSuite) TestARefusalCarriesTheCatalogsMessageAlone() {
	for _, tc := range []struct {
		name string
		err  error
		want error
		msg  string
	}{
		{
			name: "an unknown model in a batch", err: status.Error(codes.NotFound, "item 2: model not found"),
			want: domain.ErrModelNotFound, msg: "item 2: model not found",
		},
		{
			name: "an unknown territory", err: status.Error(codes.NotFound, "territory not found"),
			want: domain.ErrTerritoryNotFound, msg: "territory not found",
		},
		{
			name: "a refused item", err: status.Error(codes.InvalidArgument, "item 0: invalid input: scale must be positive"),
			want: domain.ErrInvalidInput, msg: "item 0: invalid input: scale must be positive",
		},
	} {
		s.Run(tc.name, func() {
			client := &Client{cc: refusingCC{err: tc.err}}
			_, err := client.CreatePlacements(s.T().Context(), "yard", []domain.Placement{{ModelSlug: "pump"}})
			assert.ErrorIs(s.T(), err, tc.want)
			assert.Equal(s.T(), err.Error(), tc.msg)
			_, err = client.CreatePlacement(s.T().Context(), domain.Placement{TerritorySlug: "yard", ModelSlug: "pump"})
			assert.ErrorIs(s.T(), err, tc.want)
			assert.Equal(s.T(), err.Error(), tc.msg)
		})
	}
}

func (s *PlacementBatchSuite) TestAnInternalFailureIsNoRefusal() {
	_, err := (&Client{cc: refusingCC{err: status.Error(codes.Internal, "db down")}}).
		CreatePlacements(s.T().Context(), "yard", []domain.Placement{{ModelSlug: "pump"}})
	assert.Assert(s.T(), !errors.Is(err, domain.ErrInvalidInput) && !errors.Is(err, domain.ErrModelNotFound) &&
		!errors.Is(err, domain.ErrTerritoryNotFound), "%v", err)
}
