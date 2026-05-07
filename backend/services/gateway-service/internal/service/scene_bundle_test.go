package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// SceneBundleSuite covers the gateway's central aggregator. The fan-out
// uses errgroup, so most tests wire fakeCatalog with the right state and
// assert the stitched-together bundle.
type SceneBundleSuite struct {
	suite.Suite
	cat *fakeCatalog
	svc *service.Gateway
}

func TestSceneBundleSuite(t *testing.T) {
	suite.Run(t, new(SceneBundleSuite))
}

func (s *SceneBundleSuite) SetupTest() {
	s.cat = newFakeCatalog()
	s.svc = service.New(s.cat, newFakeMesh(), &fakeUpload{})

	// Pre-populate a territory with a 3-LOD chain and a model with 2 LODs.
	s.cat.territories["t1"] = domain.Territory{Slug: "t1", Title: "Site"}
	s.cat.terrArts["t1"] = []domain.Artifact{
		{Slug: "t1", LOD: 0, Hash: "t1-lod0", Size: 1000, Vertices: 1000, Faces: 500},
		{Slug: "t1", LOD: 1, Hash: "t1-lod1", Size: 500},
		{Slug: "t1", LOD: 2, Hash: "t1-lod2", Size: 250},
	}
	s.cat.models["m1"] = domain.Model{Slug: "m1", Title: "Box"}
	s.cat.modelArts["m1"] = []domain.Artifact{
		{Slug: "m1", LOD: 0, Hash: "m1-lod0"},
		{Slug: "m1", LOD: 1, Hash: "m1-lod1"},
	}
}

func (s *SceneBundleSuite) TestRejectsEmptySlug() {
	_, err := s.svc.GetSceneBundle(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *SceneBundleSuite) TestPropagatesTerritoryNotFound() {
	_, err := s.svc.GetSceneBundle(s.T().Context(), "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *SceneBundleSuite) TestReturnsTerritoryAndLOD0Artifact() {
	got, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Territory.Slug, "t1")
	assert.Assert(s.T(), got.Artifact != nil)
	assert.Equal(s.T(), got.Artifact.Hash, "t1-lod0")
}

func (s *SceneBundleSuite) TestArtifactCarriesFullLODChain() {
	got, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Artifact != nil)
	assert.Assert(s.T(), cmp.Len(got.Artifact.LODs, 3))
	assert.Equal(s.T(), got.Artifact.LODs[0].Hash, "t1-lod0")
	assert.Equal(s.T(), got.Artifact.LODs[2].Hash, "t1-lod2")
}

func (s *SceneBundleSuite) TestArtifactNilWhenLOD0Missing() {
	// Conversion is still pending: only LOD1 exists. The bundle must
	// return nil Artifact so the frontend renders the conversion-pending
	// placeholder rather than crash on a missing LOD0.
	s.cat.terrArts["t1"] = []domain.Artifact{{Slug: "t1", LOD: 1, Hash: "lod1"}}
	got, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Artifact == nil)
}

func (s *SceneBundleSuite) TestArtifactNilWhenNoArtifactsAtAll() {
	s.cat.terrArts["t1"] = nil
	got, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Artifact == nil)
}

func (s *SceneBundleSuite) TestPlacementsPreservedAndAlwaysSliceNotNil() {
	// Frontend distinguishes empty-slice (no placements yet) from null
	// (something broke). nilToEmptyPlacements ensures we always emit [].
	got, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Placements != nil)
	assert.Assert(s.T(), cmp.Len(got.Placements, 0))
}

func (s *SceneBundleSuite) TestPlacementsReturnsOnlyMatchingTerritory() {
	s.cat.placements[1] = domain.Placement{ID: 1, TerritorySlug: "t1", ModelSlug: "m1"}
	s.cat.placements[2] = domain.Placement{ID: 2, TerritorySlug: "other", ModelSlug: "m1"}

	got, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got.Placements, 1))
	assert.Equal(s.T(), got.Placements[0].ID, int64(1))
}

func (s *SceneBundleSuite) TestModelOptionsCarryLODChainPerModel() {
	got, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got.ModelOptions, 1))
	assert.Equal(s.T(), got.ModelOptions[0].Slug, "m1")
	assert.Assert(s.T(), cmp.Len(got.ModelOptions[0].LODs, 2))
}

func (s *SceneBundleSuite) TestModelOptionsKeepsModelsWithoutArtifacts() {
	// A failed-conversion model still appears in the picker (greyed out
	// on the frontend) so the user can re-trigger it. The picker does NOT
	// silently hide broken models.
	s.cat.models["m2"] = domain.Model{Slug: "m2", Title: "Broken"}
	got, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got.ModelOptions, 2))
	for _, opt := range got.ModelOptions {
		if opt.Slug == "m2" {
			assert.Assert(s.T(), cmp.Len(opt.LODs, 0))
		}
	}
}

func (s *SceneBundleSuite) TestModelOptionsEmptyWhenNoModels() {
	clear(s.cat.models)
	clear(s.cat.modelArts)
	got, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.ModelOptions != nil)
	assert.Assert(s.T(), cmp.Len(got.ModelOptions, 0))
}

func (s *SceneBundleSuite) TestArtifactListErrorOnNonNotFound() {
	// A real error from ListTerritoryArtifacts (not a NotFound) must
	// abort the fan-out — leaving the user without a partial bundle is
	// safer than rendering a half-broken viewer.
	s.cat.ErrListTerrArts = errors.New("db down")
	_, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.ErrorContains(s.T(), err, "db down")
}

func (s *SceneBundleSuite) TestModelListErrorAbortsFanOut() {
	s.cat.ErrListModels = errors.New("catalog down")
	_, err := s.svc.GetSceneBundle(s.T().Context(), "t1")
	assert.ErrorContains(s.T(), err, "catalog down")
}
