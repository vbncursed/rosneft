package service_test

import (
	"errors"
	"fmt"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// allPhasesShown is the three phases in bundle order, none hidden.
var allPhasesShown = []domain.PanoramaPhase{{Phase: "prior"}, {Phase: "current"}, {Phase: "post"}}

func (s *SceneBundleSuite) TestBundleCarriesThePanoramaPhaseFlags() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.con.ListPanoramaPhasesMock.Expect(minimock.AnyContext, "t1").Return([]domain.PanoramaPhase{
		{Phase: "prior"}, {Phase: "current", Hidden: true}, {Phase: "post"},
	}, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.PanoramaPhases, []domain.PanoramaPhase{
		{Phase: "prior"}, {Phase: "current", Hidden: true}, {Phase: "post"},
	})
}

// Content answers the three phases in order (storage.ListPanoramaPhases); the
// bundle carries them as they are.
func (s *SceneBundleSuite) TestBundleCarriesContentsPhasesAsAnswered() {
	answered := []domain.PanoramaPhase{{Phase: "prior"}, {Phase: "current", Hidden: true}, {Phase: "post"}}
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.con.ListPanoramaPhasesMock.Return(answered, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.PanoramaPhases, answered)
}

// A content-service without the RPC answers nothing: every phase is shown.
func (s *SceneBundleSuite) TestNoPhaseAnswerShowsEveryPhase() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.con.ListPanoramaPhasesMock.Return(nil, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.PanoramaPhases, allPhasesShown)
}

// Same rule as placements: the territory read owns the not-found answer.
func (s *SceneBundleSuite) TestMissingTerritoryLeavesThePhasesShown() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.con.ListPanoramaPhasesMock.Return(nil, fmt.Errorf("content.ListPanoramaPhases: %w", domain.ErrTerritoryNotFound))

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.PanoramaPhases, allPhasesShown)
}

func (s *SceneBundleSuite) TestPanoramaPhaseListErrorAbortsFanOut() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.con.ListPanoramaPhasesMock.Return(nil, errors.New("phases down"))

	_, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.ErrorContains(s.T(), err, "phases down")
}
