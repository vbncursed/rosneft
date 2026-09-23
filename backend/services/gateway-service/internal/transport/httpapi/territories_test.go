package httpapi

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// territoryPatchRecorder captures the patch UpdateTerritory hands the service.
type territoryPatchRecorder struct {
	Service
	got *domain.TerritoryUpdate
}

func (r territoryPatchRecorder) UpdateTerritory(_ context.Context, _ string, u domain.TerritoryUpdate) (domain.Territory, error) {
	*r.got = u
	return domain.Territory{Slug: "yard"}, nil
}

type TerritoriesHandlerSuite struct{ suite.Suite }

func TestTerritoriesHandlerSuite(t *testing.T) { suite.Run(t, new(TerritoriesHandlerSuite)) }

func (s *TerritoriesHandlerSuite) TestUpdateForwardsTitleAndDescription() {
	var got domain.TerritoryUpdate
	body := UpdateTerritoryJSONRequestBody{Title: new("Yard"), Description: new("North pad")}

	resp, err := New(territoryPatchRecorder{got: &got}).UpdateTerritory(s.T().Context(),
		UpdateTerritoryRequestObject{Slug: "yard", Body: &body})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, domain.TerritoryUpdate{Title: new("Yard"), Description: new("North pad")})
	_, ok := resp.(UpdateTerritory200JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
}
