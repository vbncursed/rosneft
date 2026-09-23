package service_test

import (
	"errors"
	"fmt"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *SceneBundleSuite) TestBundleCarriesTheTerritorysPlacementGroups() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	groups := []domain.PlacementGroup{{ID: 4, TerritorySlug: "t1", Title: "North"}}
	s.cat.ListPlacementGroupsMock.Expect(minimock.AnyContext, "t1").Return(groups, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.PlacementGroups, groups)
}

// The client tells "no groups" from a broken bundle by [] versus null.
func (s *SceneBundleSuite) TestPlacementGroupsAreAlwaysASlice() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.PlacementGroups != nil)
	assert.Equal(s.T(), len(got.PlacementGroups), 0)
}

// Same rule as placements: the territory read owns the not-found answer.
func (s *SceneBundleSuite) TestMissingTerritoryLeavesPlacementGroupsEmpty() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.cat.ListPlacementGroupsMock.Return(nil, fmt.Errorf("catalog.ListPlacementGroups: %w", domain.ErrTerritoryNotFound))

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.PlacementGroups != nil)
}

func (s *SceneBundleSuite) TestPlacementGroupListErrorAbortsFanOut() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.cat.ListPlacementGroupsMock.Return(nil, errors.New("groups down"))

	_, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.ErrorContains(s.T(), err, "groups down")
}
