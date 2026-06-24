package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

// SceneBundleSuite covers the gateway's central aggregator. The fan-out runs
// under errgroup, so the parallel catalog calls receive a derived context —
// expectations use .Return()/AnyContext to stay context-agnostic.
type SceneBundleSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	svc *service.Gateway
	ctx context.Context
}

func TestSceneBundleSuite(t *testing.T) {
	suite.Run(t, new(SceneBundleSuite))
}

func (s *SceneBundleSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.svc = service.New(s.cat, mocks.NewMeshMock(mc), mocks.NewUploadMock(mc))
	s.ctx = s.T().Context()
}

// A territory with a 3-LOD chain; a model m1 with 2 LODs.
var (
	sbTerr3LOD = []domain.Artifact{
		{Slug: "t1", LOD: 0, Hash: "t1-lod0", Size: 1000, Vertices: 1000, Faces: 500},
		{Slug: "t1", LOD: 1, Hash: "t1-lod1", Size: 500},
		{Slug: "t1", LOD: 2, Hash: "t1-lod2", Size: 250},
	}
	sbModelsM1 = []domain.Model{{Slug: "m1", Title: "Box"}}
)

// expectFanOut wires the five parallel catalog reads of GetSceneBundle.
func (s *SceneBundleSuite) expectFanOut(terrArts []domain.Artifact, models []domain.Model, placements []domain.Placement) {
	s.cat.GetTerritoryMock.Return(domain.Territory{Slug: "t1", Title: "Site"}, nil)
	s.cat.ListTerritoryArtifactsMock.Return(terrArts, nil)
	s.cat.ListPlacementsMock.Return(placements, nil)
	s.cat.ListPanoramasMock.Return(nil, nil)
	s.cat.ListModelsMock.Return(models, nil)
}

// expectModelArtsM1 answers the per-model artifact lookup for m1.
func (s *SceneBundleSuite) expectModelArtsM1() {
	s.cat.ListModelArtifactsMock.When(minimock.AnyContext, "m1").Then([]domain.Artifact{
		{Slug: "m1", LOD: 0, Hash: "m1-lod0"},
		{Slug: "m1", LOD: 1, Hash: "m1-lod1"},
	}, nil)
}

func (s *SceneBundleSuite) TestRejectsEmptySlug() {
	_, err := s.svc.GetSceneBundle(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *SceneBundleSuite) TestPropagatesTerritoryNotFound() {
	s.cat.GetTerritoryMock.Return(domain.Territory{}, domain.ErrTerritoryNotFound)
	s.cat.ListTerritoryArtifactsMock.Return(nil, nil)
	s.cat.ListPlacementsMock.Return(nil, nil)
	s.cat.ListPanoramasMock.Return(nil, nil)
	s.cat.ListModelsMock.Return(nil, nil)
	_, err := s.svc.GetSceneBundle(s.ctx, "missing")
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *SceneBundleSuite) TestReturnsTerritoryAndLOD0Artifact() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.expectModelArtsM1()
	got, err := s.svc.GetSceneBundle(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Territory.Slug, "t1")
	assert.Assert(s.T(), got.Artifact != nil)
	assert.Equal(s.T(), got.Artifact.Hash, "t1-lod0")
}

func (s *SceneBundleSuite) TestArtifactCarriesFullLODChain() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.expectModelArtsM1()
	got, err := s.svc.GetSceneBundle(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Artifact != nil)
	assert.Assert(s.T(), cmp.Len(got.Artifact.LODs, 3))
	assert.Equal(s.T(), got.Artifact.LODs[0].Hash, "t1-lod0")
	assert.Equal(s.T(), got.Artifact.LODs[2].Hash, "t1-lod2")
}

func (s *SceneBundleSuite) TestArtifactNilWhenLOD0Missing() {
	// Conversion still pending: only LOD1 exists → nil Artifact so the frontend
	// renders the conversion-pending placeholder instead of crashing.
	s.expectFanOut([]domain.Artifact{{Slug: "t1", LOD: 1, Hash: "lod1"}}, sbModelsM1, nil)
	s.expectModelArtsM1()
	got, err := s.svc.GetSceneBundle(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Artifact == nil)
}

func (s *SceneBundleSuite) TestArtifactNilWhenNoArtifactsAtAll() {
	s.expectFanOut(nil, sbModelsM1, nil)
	s.expectModelArtsM1()
	got, err := s.svc.GetSceneBundle(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Artifact == nil)
}

func (s *SceneBundleSuite) TestPlacementsPreservedAndAlwaysSliceNotNil() {
	// Frontend distinguishes empty-slice (no placements) from null (broken).
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.expectModelArtsM1()
	got, err := s.svc.GetSceneBundle(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Placements != nil)
	assert.Assert(s.T(), cmp.Len(got.Placements, 0))
}

func (s *SceneBundleSuite) TestPlacementsReturnsOnlyMatchingTerritory() {
	// The catalog returns only the territory's placements; the gateway forwards.
	s.expectFanOut(sbTerr3LOD, sbModelsM1, []domain.Placement{{ID: 1, TerritorySlug: "t1", ModelSlug: "m1"}})
	s.expectModelArtsM1()
	got, err := s.svc.GetSceneBundle(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cmp.Len(got.Placements, 1))
	assert.Equal(s.T(), got.Placements[0].ID, int64(1))
}
