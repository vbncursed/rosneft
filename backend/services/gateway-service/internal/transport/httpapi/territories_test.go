package httpapi

import (
	"context"
	"errors"
	"fmt"
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

func (r territoryPatchRecorder) UpdateTerritory(
	_ context.Context,
	_ string,
	u domain.TerritoryUpdate,
) (domain.Territory, error) {
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

func (s *TerritoriesHandlerSuite) TestListTerritoryArtifacts() {
	stub := &listReadStub{}
	server := New(stub)
	resp, err := server.ListTerritoryArtifacts(s.T().Context(), ListTerritoryArtifactsRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), stub.slug, "yard")
	out, ok := resp.(ListTerritoryArtifacts200JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), len(out), 1)
	assert.Equal(s.T(), out[0].Slug, "yard")
	assert.Equal(s.T(), out[0].Lod, int32(2))
	assert.Equal(s.T(), out[0].Hash, "hash")
	assert.Equal(s.T(), out[0].Size, int64(42))
	assert.Equal(s.T(), out[0].ContentType, "model/gltf-binary")
	assert.DeepEqual(s.T(), out[0].Vertices, new(int64(43)))
	assert.DeepEqual(s.T(), out[0].Faces, new(int64(44)))
	assert.DeepEqual(s.T(), out[0].BboxMin, &Vec3{X: -1, Y: -2, Z: -3})
	assert.DeepEqual(s.T(), out[0].BboxMax, &Vec3{X: 4, Y: 5, Z: 6})
	assert.Assert(s.T(), out[0].CreatedAt.Equal(listStamp))
	assert.Assert(s.T(), out[0].Artifacts == nil)
	for _, tc := range []struct {
		name   string
		cause  error
		status int
	}{
		{"not found", domain.ErrTerritoryNotFound, 404},
		{"invalid", domain.ErrInvalidInput, 500},
		{"failure", errors.New("catalog down"), 500},
	} {
		s.Run(tc.name, func() {
			stub.err = tc.cause
			resp, err := server.ListTerritoryArtifacts(
				s.T().Context(),
				ListTerritoryArtifactsRequestObject{Slug: "yard"},
			)
			assert.NilError(s.T(), err)
			assert.Equal(
				s.T(),
				fmt.Sprintf("%T", resp),
				fmt.Sprintf("httpapi.ListTerritoryArtifacts%dJSONResponse", tc.status),
			)
		})
	}
}
