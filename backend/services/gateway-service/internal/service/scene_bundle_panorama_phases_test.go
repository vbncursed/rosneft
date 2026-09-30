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

// Spec: always three, prior → current → post, whatever content answered —
// rows missing, out of order, unknown, or none at all.
func (s *SceneBundleSuite) TestPanoramaPhasesAreAlwaysTheThreeInOrder() {
	for _, tc := range []struct {
		name   string
		stored []domain.PanoramaPhase
		want   []domain.PanoramaPhase
	}{
		{name: "none stored", stored: nil, want: allPhasesShown},
		{
			name:   "one hidden, out of order",
			stored: []domain.PanoramaPhase{{Phase: "post", Hidden: true}, {Phase: "prior"}},
			want:   []domain.PanoramaPhase{{Phase: "prior"}, {Phase: "current"}, {Phase: "post", Hidden: true}},
		},
		{name: "an unknown row is dropped", stored: []domain.PanoramaPhase{{Phase: "during", Hidden: true}}, want: allPhasesShown},
	} {
		s.Run(tc.name, func() {
			s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
			s.con.ListPanoramaPhasesMock.Return(tc.stored, nil)

			got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

			assert.NilError(s.T(), err)
			assert.DeepEqual(s.T(), got.PanoramaPhases, tc.want)
		})
	}
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
