// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
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
