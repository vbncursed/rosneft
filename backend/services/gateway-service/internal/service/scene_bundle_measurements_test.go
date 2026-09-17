package service_test

import (
	"errors"
	"fmt"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *SceneBundleSuite) TestBundleCarriesTheTerritorysMeasurements() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.expectModelArtsM1()
	saved := []domain.Measurement{{
		ID: 4, TerritorySlug: "t1", Closed: true,
		Points: []domain.Vec3{{X: 1}, {Y: 1}, {Z: 1}},
	}}
	s.cat.ListMeasurementsMock.Expect(minimock.AnyContext, "t1").Return(saved, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.Measurements, saved)
}

// The client tells "no measurements" from a broken bundle by [] versus null.
func (s *SceneBundleSuite) TestMeasurementsAreAlwaysASlice() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.expectModelArtsM1()

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Measurements != nil)
	assert.Equal(s.T(), len(got.Measurements), 0)
}

// Same rule as placements: the territory read owns the not-found answer, and a
// list racing a delete must not turn it into something else.
func (s *SceneBundleSuite) TestMissingTerritoryLeavesMeasurementsEmpty() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.expectModelArtsM1()
	s.cat.ListMeasurementsMock.Return(nil, fmt.Errorf("catalog.ListMeasurements: %w", domain.ErrTerritoryNotFound))

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Measurements != nil)
}

func (s *SceneBundleSuite) TestMeasurementListErrorAbortsFanOut() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.cat.ListMeasurementsMock.Return(nil, errors.New("measurements down"))

	_, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.ErrorContains(s.T(), err, "measurements down")
}
