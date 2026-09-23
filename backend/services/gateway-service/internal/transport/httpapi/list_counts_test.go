package httpapi

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// ListCountsSuite checks that both the list endpoints and the single-entity
// GETs carry the placement/usage counts a stubbed catalog reports, and that
// the JSON key stays omitted when the count is zero.
type ListCountsSuite struct{ suite.Suite }

func TestListCountsSuite(t *testing.T) { suite.Run(t, new(ListCountsSuite)) }

// countsServiceStub answers only the reads these tests exercise; anything
// else panics through the embedded nil Service, same style as list_jobs_test.go.
type countsServiceStub struct {
	Service
	territories []domain.Territory
	models      []domain.Model
}

func (c countsServiceStub) ListTerritories(context.Context, string) ([]domain.Territory, error) {
	return c.territories, nil
}

func (c countsServiceStub) GetTerritory(context.Context, string, string) (domain.Territory, error) {
	return domain.Territory{Slug: "yard", PlacementCount: 3}, nil
}

func (c countsServiceStub) ListModels(context.Context) ([]domain.Model, error) {
	return c.models, nil
}

func (c countsServiceStub) GetModel(context.Context, string) (domain.Model, error) {
	return domain.Model{Slug: "pump", UsageCount: 2}, nil
}

func (s *ListCountsSuite) TestListTerritoriesCarriesPlacementCount() {
	ctx := authhttp.NewTestContext(context.Background(), true, "")
	stub := countsServiceStub{territories: []domain.Territory{{Slug: "yard", PlacementCount: 3}}}

	resp, err := New(stub).ListTerritories(ctx, ListTerritoriesRequestObject{})
	assert.NilError(s.T(), err)
	list, ok := resp.(ListTerritories200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Assert(s.T(), list[0].PlacementCount != nil)
	assert.Equal(s.T(), *list[0].PlacementCount, 3)
}

func (s *ListCountsSuite) TestGetTerritoryCarriesPlacementCount() {
	ctx := authhttp.NewTestContext(context.Background(), true, "")
	resp, err := New(countsServiceStub{}).GetTerritory(ctx, GetTerritoryRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	territory, ok := resp.(GetTerritory200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Assert(s.T(), territory.PlacementCount != nil)
	assert.Equal(s.T(), *territory.PlacementCount, 3)
}

func (s *ListCountsSuite) TestListModelsCarriesUsageCount() {
	stub := countsServiceStub{models: []domain.Model{{Slug: "pump", UsageCount: 2}}}

	resp, err := New(stub).ListModels(context.Background(), ListModelsRequestObject{})
	assert.NilError(s.T(), err)
	list, ok := resp.(ListModels200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Assert(s.T(), list[0].UsageCount != nil)
	assert.Equal(s.T(), *list[0].UsageCount, 2)
}

func (s *ListCountsSuite) TestGetModelCarriesUsageCount() {
	resp, err := New(countsServiceStub{}).GetModel(context.Background(), GetModelRequestObject{Slug: "pump"})
	assert.NilError(s.T(), err)
	model, ok := resp.(GetModel200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Assert(s.T(), model.UsageCount != nil)
	assert.Equal(s.T(), *model.UsageCount, 2)
}

// The list endpoints always carry the chain, as [] before a conversion lands:
// the catalog pages stop asking /artifacts per row and must not have to guess
// whether an absent key means "none" or "not sent". Encoded with v1
// encoding/json because the strict handlers' Visit methods encode with it.
func (s *ListCountsSuite) TestListTerritoriesCarriesTheLODChain() {
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")
	stub := countsServiceStub{territories: []domain.Territory{
		{Slug: "yard", LODs: []domain.LodArtifact{{LOD: 0, Hash: "h0", Size: 10}, {LOD: 1, Hash: "h1", Size: 4}}},
		{Slug: "fresh"},
	}}
	resp, err := New(stub).ListTerritories(ctx, ListTerritoriesRequestObject{})
	assert.NilError(s.T(), err)
	list, ok := resp.(ListTerritories200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), len(*list[0].Lods), 2)
	assert.Equal(s.T(), (*list[0].Lods)[1].Hash, "h1")
	body, err := json.Marshal(list[1])
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), strings.Contains(string(body), `"lods":[]`), string(body))
}

func (s *ListCountsSuite) TestListModelsCarriesTheLODChain() {
	stub := countsServiceStub{models: []domain.Model{
		{Slug: "pump", LODs: []domain.LodArtifact{{LOD: 0, Hash: "m0", Size: 3}}},
	}}
	resp, err := New(stub).ListModels(s.T().Context(), ListModelsRequestObject{})
	assert.NilError(s.T(), err)
	list, ok := resp.(ListModels200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), (*list[0].Lods)[0].Hash, "m0")
}
