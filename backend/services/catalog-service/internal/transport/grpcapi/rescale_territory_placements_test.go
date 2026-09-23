package grpcapi_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi/mocks"
)

func TestRescaleTerritoryPlacementsPassesTheCenterThrough(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.RescaleTerritoryPlacementsMock.
		Expect(t.Context(), "t1", 10.0, domain.Vec3{X: 7, Y: 1, Z: 2}).
		Return(3, nil)

	resp, err := grpcapi.New(svc).RescaleTerritoryPlacements(t.Context(),
		&catalogv1.RescaleTerritoryPlacementsRequest{
			TerritorySlug:   "t1",
			NewSourceMax:    10,
			NewSourceCenter: &catalogv1.Vec3{X: 7, Y: 1, Z: 2},
		})
	assert.NilError(t, err)
	assert.Equal(t, resp.GetUpdated(), uint32(3))
}

// A mesh-worker built before the center existed sends none; reading that as
// the origin would shift every binding, so it is refused and the service
// untouched — the job fails before LOD0 lands and the reconciler retries it.
func TestRescaleTerritoryPlacementsWithoutACenterIsInvalid(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	_, err := grpcapi.New(svc).RescaleTerritoryPlacements(t.Context(),
		&catalogv1.RescaleTerritoryPlacementsRequest{TerritorySlug: "t1", NewSourceMax: 10})
	assert.Equal(t, status.Code(err), codes.InvalidArgument)
}
