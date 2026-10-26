package service_test

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *SceneBundleSuite) TestBundleCarriesTheTerritorysZones() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	saved := []domain.Zone{{
		ID: 7, Title: "Camp", Corners: []domain.Vec3{{X: 1}, {X: 2}, {X: 3}, {X: 4}},
		Tags: []domain.ModelTag{{Slug: "camp", Title: "Camp & accommodation"}},
	}}
	s.cat.ListZonesMock.Expect(minimock.AnyContext, "t1").Return(saved, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.Zones, saved)
}

// The client tells "no zones" from a broken bundle by [] versus null.
func (s *SceneBundleSuite) TestSceneBundleCarriesEmptyZones() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Zones != nil)
	raw, err := json.Marshal(got.Zones)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), string(raw), "[]")
}

// The territory read owns the not-found answer; a list racing a delete must
// not turn it into something else.
func (s *SceneBundleSuite) TestMissingTerritoryLeavesZonesEmpty() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.cat.ListZonesMock.Return(nil, fmt.Errorf("catalog.ListZones: %w", domain.ErrTerritoryNotFound))

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Zones != nil)
}

func (s *SceneBundleSuite) TestZoneListErrorAbortsFanOut() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.cat.ListZonesMock.Return(nil, errors.New("zones down"))

	_, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.ErrorContains(s.T(), err, "zones down")
}

func (s *SceneBundleSuite) TestModelOptionsCarryTheirTag() {
	tag := domain.ModelTag{Slug: "camp", Title: "Camp & accommodation"}
	s.expectFanOut(sbTerr3LOD, []domain.Model{{Slug: "m1", Title: "Cabin", Tag: tag}}, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.ModelOptions[0].Tag, tag)
}

func (s *SceneBundleSuite) TestDocumentsCarryTheirCalibration() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	cal := &domain.Calibration{Page: 1, Points: []domain.CalibrationPoint{{PDF: domain.Vec2{X: 1, Y: 2}}}}
	s.con.ListDocumentsMock.Return([]domain.Document{{ID: 1, Calibration: cal}, {ID: 2}}, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.Documents[0].Calibration, cal)
	assert.Assert(s.T(), got.Documents[1].Calibration == nil)
}
