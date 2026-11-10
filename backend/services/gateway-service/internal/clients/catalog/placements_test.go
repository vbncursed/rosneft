// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"context"
	"errors"
	"testing"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

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
		out[i] = &catalogv1.Placement{
			Id:            int64(i + 1),
			TerritorySlug: in.GetTerritorySlug(),
			ModelSlug:     it.GetModelSlug(),
		}
	}
	return &catalogv1.CreatePlacementsResponse{Placements: out}, nil
}

type PlacementBatchSuite struct{ suite.Suite }

func TestPlacementBatchSuite(t *testing.T) { suite.Run(t, new(PlacementBatchSuite)) }

func (s *PlacementBatchSuite) TestTheBatchTravelsUnderItsTerritory() {
	cc := &placementBatchCC{}
	got, err := (&Client{cc: cc}).CreatePlacements(s.T().Context(), "yard", "retry-1", []domain.Placement{
		{ModelSlug: "pump", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}},
		{ModelSlug: "tank", Position: domain.Vec3{X: 2}, Scale: domain.Vec3{X: 1, Y: 1, Z: 1}},
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.got.GetTerritorySlug(), "yard")
	assert.Equal(s.T(), cc.got.GetIdempotencyKey(), "retry-1")
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
		{
			name: "a key reused for another batch", err: status.Error(codes.AlreadyExists, "idempotency key reused with a different batch"),
			want: domain.ErrIdempotencyConflict, msg: "idempotency key reused with a different batch",
		},
	} {
		s.Run(tc.name, func() {
			client := &Client{cc: refusingCC{err: tc.err}}
			_, err := client.CreatePlacements(s.T().Context(), "yard", "", []domain.Placement{{ModelSlug: "pump"}})
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
		CreatePlacements(s.T().Context(), "yard", "", []domain.Placement{{ModelSlug: "pump"}})
	assert.Assert(s.T(), !errors.Is(err, domain.ErrInvalidInput) && !errors.Is(err, domain.ErrModelNotFound) &&
		!errors.Is(err, domain.ErrTerritoryNotFound), "%v", err)
}

// An edit refused by the catalog reaches the browser in the catalog's words
// alone — not "catalog.SetPlacementVisibility: invalid input\nrpc error: …".
func (s *PlacementBatchSuite) TestAnEditRefusalCarriesTheCatalogsMessageAlone() {
	for _, tc := range []struct {
		name string
		err  error
		want error
	}{
		{
			name: "a panorama of another territory",
			err:  status.Error(codes.InvalidArgument, `invalid input: panorama 5 is not on territory "yard"`),
			want: domain.ErrInvalidInput,
		},
		{name: "an unknown placement", err: status.Error(codes.NotFound, "placement not found"), want: domain.ErrPlacementNotFound},
	} {
		s.Run(tc.name, func() {
			client := &Client{cc: refusingCC{err: tc.err}}
			msg := status.Convert(tc.err).Message()
			_, err := client.SetPlacementVisibility(s.T().Context(), "yard", 1, []int64{5})
			assert.ErrorIs(s.T(), err, tc.want)
			assert.Equal(s.T(), err.Error(), msg)
			_, err = client.UpdatePlacement(s.T().Context(), domain.Placement{ID: 1, TerritorySlug: "yard"})
			assert.ErrorIs(s.T(), err, tc.want)
			assert.Equal(s.T(), err.Error(), msg)
			err = client.DeletePlacement(s.T().Context(), "yard", 1)
			assert.ErrorIs(s.T(), err, tc.want)
			assert.Equal(s.T(), err.Error(), msg)
		})
	}
}

var (
	listStamp   = time.Date(2026, 2, 3, 4, 5, 6, 0, time.UTC)
	listUpdated = listStamp.Add(time.Hour)
)

func (s *CatalogListsSuite) TestListPlacements() {
	s.placements = []*catalogv1.Placement{
		{
			Id:                 9,
			TerritorySlug:      "yard",
			ModelSlug:          "pump",
			Position:           &catalogv1.Vec3{X: 3, Y: 4, Z: 5},
			Rotation:           &catalogv1.Vec3{X: 6, Y: 7, Z: 8},
			Scale:              &catalogv1.Vec3{X: 9, Y: 10, Z: 11},
			Label:              "north",
			CreatedAt:          timestamppb.New(listStamp),
			UpdatedAt:          timestamppb.New(listUpdated),
			VisiblePanoramaIds: []int64{12, 13},
			Hidden:             true,
			GroupId:            new(int64(14)),
		},
	}
	ctx := s.T().Context()
	got, err := s.cli.ListPlacements(ctx, "yard")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.method, catalogv1.CatalogService_ListPlacements_FullMethodName)
	assert.Assert(s.T(), s.ctx == ctx)
	assert.Equal(s.T(), s.request.(*catalogv1.ListPlacementsRequest).GetTerritorySlug(), "yard")
	assert.Equal(s.T(), len(got), 1)
	assert.Equal(s.T(), got[0].ID, int64(9))
	assert.Equal(s.T(), got[0].ModelSlug, "pump")
	assert.Equal(s.T(), got[0].TerritorySlug, "yard")
	assert.DeepEqual(s.T(), got[0].Position, domain.Vec3{X: 3, Y: 4, Z: 5})
	assert.DeepEqual(s.T(), got[0].Rotation, domain.Vec3{X: 6, Y: 7, Z: 8})
	assert.DeepEqual(s.T(), got[0].Scale, domain.Vec3{X: 9, Y: 10, Z: 11})
	assert.Equal(s.T(), got[0].Label, "north")
	assert.Assert(s.T(), got[0].CreatedAt.Equal(listStamp))
	assert.Assert(s.T(), got[0].UpdatedAt.Equal(listUpdated))
	assert.DeepEqual(s.T(), got[0].VisiblePanoramaIDs, []int64{12, 13})
	assert.DeepEqual(s.T(), got[0].GroupID, new(int64(14)))
	assert.Equal(s.T(), got[0].Hidden, true)
	for _, tc := range []struct {
		name        string
		cause, want error
	}{
		{"not found", status.Error(codes.NotFound, "missing"), domain.ErrTerritoryNotFound},
		{"unavailable", status.Error(codes.Unavailable, "offline"), nil},
	} {
		s.Run(tc.name, func() {
			s.err = tc.cause
			got, err := s.cli.ListPlacements(ctx, "yard")
			assert.Assert(s.T(), got == nil)
			assert.ErrorContains(s.T(), err, "catalog.ListPlacements:")
			if tc.want != nil {
				assert.ErrorIs(s.T(), err, tc.want)
			} else {
				assert.ErrorIs(s.T(), err, tc.cause)
			}
		})
	}
}
