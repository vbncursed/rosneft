package httpapi

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

// gatewayWithoutCalls is the real service over mocks that expect nothing: a
// request the service refuses on its own answers without any backend call,
// and one that reached a backend would fail the controller.
func gatewayWithoutCalls(t *testing.T) *service.Gateway {
	mc := minimock.NewController(t)
	return service.New(mocks.NewCatalogMock(mc), mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
}

// A blank title is a 400, never a write: both PATCH routes, empty and
// whitespace-only alike.
func TestPatchWithABlankTitleIsABadRequest(t *testing.T) {
	for _, title := range []string{"", "   "} {
		t.Run("territory "+`"`+title+`"`, func(t *testing.T) {
			body := UpdateTerritoryJSONRequestBody{Title: new(title)}
			resp, err := New(gatewayWithoutCalls(t)).UpdateTerritory(t.Context(),
				UpdateTerritoryRequestObject{Slug: "yard", Body: &body})
			assert.NilError(t, err)
			_, ok := resp.(UpdateTerritory400JSONResponse)
			assert.Assert(t, ok, "got %T", resp)
		})
		t.Run("model "+`"`+title+`"`, func(t *testing.T) {
			body := UpdateModelJSONRequestBody{Title: new(title)}
			resp, err := New(gatewayWithoutCalls(t)).UpdateModel(t.Context(),
				UpdateModelRequestObject{Slug: "pump", Body: &body})
			assert.NilError(t, err)
			_, ok := resp.(UpdateModel400JSONResponse)
			assert.Assert(t, ok, "got %T", resp)
		})
	}
}
