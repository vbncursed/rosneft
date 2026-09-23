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

func TestSetTerritoryRescaleBaselinePassesTheCenterThrough(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.SetTerritoryRescaleBaselineMock.
		Expect(t.Context(), "t1", 10.0, domain.Vec3{X: 7, Y: 1, Z: 2}).
		Return(nil)

	_, err := grpcapi.New(svc).SetTerritoryRescaleBaseline(t.Context(),
		&catalogv1.SetTerritoryRescaleBaselineRequest{
			TerritorySlug: "t1",
			SourceMax:     10,
			SourceCenter:  &catalogv1.Vec3{X: 7, Y: 1, Z: 2},
		})
	assert.NilError(t, err)
}

// A gateway built before the center existed sends none; reading that as the
// origin would shift every binding, so it is refused and the service untouched.
func TestSetTerritoryRescaleBaselineWithoutACenterIsInvalid(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	_, err := grpcapi.New(svc).SetTerritoryRescaleBaseline(t.Context(),
		&catalogv1.SetTerritoryRescaleBaselineRequest{TerritorySlug: "t1", SourceMax: 10})
	assert.Equal(t, status.Code(err), codes.InvalidArgument)
}
