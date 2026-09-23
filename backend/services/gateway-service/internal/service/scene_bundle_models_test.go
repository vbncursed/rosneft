package service_test

import (
	"errors"
	"slices"

	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Model-options and fan-out-error tests for SceneBundleSuite (defined in
// scene_bundle_test.go).

// Each option is read off the model list — chain, LOD0 bounds, thumbnail — in
// the list's order, with no per-model artifact call (none is expected, so one
// would fail the controller).
func (s *SceneBundleSuite) TestModelOptionsCarryLODChainPerModel() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")
	assert.NilError(s.T(), err)
	m := sbModelsM1[0]
	assert.DeepEqual(s.T(), got.ModelOptions, []domain.AssetOption{{
		Slug: m.Slug, Title: m.Title, ThumbnailBlobHash: m.ThumbnailBlobHash,
		BBoxMin: m.BBoxMin, BBoxMax: m.BBoxMax, LODs: m.LODs,
	}})
}

func (s *SceneBundleSuite) TestModelOptionsKeepsModelsWithoutArtifacts() {
	// A failed-conversion model still appears in the picker (greyed out) so the
	// user can re-trigger it — the picker does NOT silently hide broken models.
	// Its chain is [] and its bounds absent, as when it was looked up alone.
	s.expectFanOut(sbTerr3LOD, append(slices.Clone(sbModelsM1), domain.Model{Slug: "m2", Title: "Broken"}), nil)
	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got.ModelOptions, 2))
	assert.DeepEqual(s.T(), got.ModelOptions[1], domain.AssetOption{Slug: "m2", Title: "Broken", LODs: []domain.LodArtifact{}})
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
	s.cat.ListMeasurementsMock.Return(nil, nil)
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
	s.cat.ListMeasurementsMock.Return(nil, nil)
	s.con.ListPanoramasMock.Return(nil, nil)
	s.con.ListDocumentsMock.Return(nil, nil)
	s.cat.ListModelsMock.Return(nil, errors.New("catalog down"))
	_, err := s.svc.GetSceneBundle(s.ctx, "t1", "")
	assert.ErrorContains(s.T(), err, "catalog down")
}
