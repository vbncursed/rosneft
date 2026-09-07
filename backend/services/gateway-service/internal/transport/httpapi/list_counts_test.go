package httpapi

import (
	"context"
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
