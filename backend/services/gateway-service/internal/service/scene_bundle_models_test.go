package service_test

import (
	"errors"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Model-options and fan-out-error tests for SceneBundleSuite (defined in
// scene_bundle_test.go).

func (s *SceneBundleSuite) TestModelOptionsCarryLODChainPerModel() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.expectModelArtsM1()
	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got.ModelOptions, 1))
	assert.Equal(s.T(), got.ModelOptions[0].Slug, "m1")
	assert.Assert(s.T(), cmp.Len(got.ModelOptions[0].LODs, 2))
}

func (s *SceneBundleSuite) TestModelOptionsKeepsModelsWithoutArtifacts() {
	// A failed-conversion model still appears in the picker (greyed out) so the
	// user can re-trigger it — the picker does NOT silently hide broken models.
	s.expectFanOut(sbTerr3LOD, []domain.Model{{Slug: "m1", Title: "Box"}, {Slug: "m2", Title: "Broken"}}, nil)
	s.expectModelArtsM1()
	s.cat.ListModelArtifactsMock.When(minimock.AnyContext, "m2").Then(nil, nil)
	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got.ModelOptions, 2))
	for _, opt := range got.ModelOptions {
		if opt.Slug == "m2" {
			assert.Assert(s.T(), cmp.Len(opt.LODs, 0))
		}
	}
}

func (s *SceneBundleSuite) TestModelOptionsEmptyWhenNoModels() {
	// No models → buildModelOptions returns [] without any per-model lookup.
	s.expectFanOut(sbTerr3LOD, nil, nil)
	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.ModelOptions != nil)
	assert.Assert(s.T(), cmp.Len(got.ModelOptions, 0))
}

func (s *SceneBundleSuite) TestArtifactListErrorOnNonNotFound() {
	// A real error (not NotFound) from ListTerritoryArtifacts aborts the fan-out
	// — a half-broken viewer is worse than the conversion-pending screen.
	s.cat.GetTerritoryMock.Return(domain.Territory{Slug: "t1"}, nil)
	s.cat.ListTerritoryArtifactsMock.Return(nil, errors.New("db down"))
	s.cat.ListPlacementsMock.Return(nil, nil)
	s.con.ListPanoramasMock.Return(nil, nil)
	s.con.ListDocumentsMock.Return(nil, nil)
	s.cat.ListModelsMock.Return(sbModelsM1, nil)
	_, err := s.svc.GetSceneBundle(s.ctx, "t1", "")
	assert.ErrorContains(s.T(), err, "db down")
}

func (s *SceneBundleSuite) TestModelListErrorAbortsFanOut() {
	s.cat.GetTerritoryMock.Return(domain.Territory{Slug: "t1"}, nil)
	s.cat.ListTerritoryArtifactsMock.Return(sbTerr3LOD, nil)
	s.cat.ListPlacementsMock.Return(nil, nil)
	s.con.ListPanoramasMock.Return(nil, nil)
	s.con.ListDocumentsMock.Return(nil, nil)
	s.cat.ListModelsMock.Return(nil, errors.New("catalog down"))
	_, err := s.svc.GetSceneBundle(s.ctx, "t1", "")
	assert.ErrorContains(s.T(), err, "catalog down")
}
