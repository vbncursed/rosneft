package httpapi

import (
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type SceneBundleConverterSuite struct{ suite.Suite }

func TestSceneBundleConverterSuite(t *testing.T) { suite.Run(t, new(SceneBundleConverterSuite)) }

func (s *SceneBundleConverterSuite) TestEmptyBundleKeepsRequiredArraysAndOmitsOptionals() {
	out := sceneBundleToAPI(domain.SceneBundle{})

	assert.Assert(s.T(), out.Placements != nil && len(out.Placements) == 0)
	assert.Assert(s.T(), out.ModelOptions != nil && len(out.ModelOptions) == 0)
	assert.Assert(s.T(), out.Measurements != nil && len(out.Measurements) == 0)
	assert.Assert(s.T(), out.PlacementGroups != nil && len(out.PlacementGroups) == 0)
	assert.Assert(s.T(), out.PanoramaPhases != nil)
	assert.Assert(s.T(), out.Artifact == nil)
	assert.Assert(s.T(), out.Panoramas == nil)
	assert.Assert(s.T(), out.Documents == nil)
}

func (s *SceneBundleConverterSuite) TestPlacementsKeepOrder() {
	out := sceneBundleToAPI(domain.SceneBundle{Placements: []domain.Placement{{ID: 7}, {ID: 3}}})

	assert.Equal(s.T(), len(out.Placements), 2)
	assert.Equal(s.T(), out.Placements[0].Id, int64(7))
	assert.Equal(s.T(), out.Placements[1].Id, int64(3))
}

func (s *SceneBundleConverterSuite) TestModelOptionOptionalFieldsOnlyWhenSet() {
	min, max := domain.Vec3{X: 1, Y: 2, Z: 3}, domain.Vec3{X: 4, Y: 5, Z: 6}
	lods := []domain.LodArtifact{{LOD: 0, Hash: "h0", Size: 10, Vertices: 3, Faces: 1}}
	out := sceneBundleToAPI(domain.SceneBundle{ModelOptions: []domain.AssetOption{
		{Slug: "bare", Title: "Bare"},
		{Slug: "full", Title: "Full", ThumbnailBlobHash: "thumb", BBoxMin: &min, BBoxMax: &max, LODs: lods},
	}})

	bare, full := out.ModelOptions[0], out.ModelOptions[1]
	assert.Equal(s.T(), bare.Slug+bare.Title, "bareBare")
	assert.Assert(s.T(), bare.ThumbnailBlobHash == nil && bare.BboxMin == nil && bare.BboxMax == nil)
	assert.Assert(s.T(), bare.Artifacts != nil && len(bare.Artifacts) == 0)
	assert.Equal(s.T(), *full.ThumbnailBlobHash, "thumb")
	assert.DeepEqual(s.T(), *full.BboxMin, Vec3{X: 1, Y: 2, Z: 3})
	assert.DeepEqual(s.T(), *full.BboxMax, Vec3{X: 4, Y: 5, Z: 6})
	assert.DeepEqual(s.T(), full.Artifacts, lodChainToAPI(lods))
}

func (s *SceneBundleConverterSuite) TestTerritoryArtifactCarriesItsChain() {
	a := domain.Artifact{Slug: "t", Hash: "h", Size: 5}

	out := sceneBundleToAPI(domain.SceneBundle{Artifact: &a})

	assert.DeepEqual(s.T(), *out.Artifact, artifactToAPI(a, true))
}

func (s *SceneBundleConverterSuite) TestPanoramasAndDocumentsAppearOnlyWhenPresent() {
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	pans := []domain.Panorama{{ID: 2, Phase: domain.PhasePrior}, {ID: 1, Phase: domain.PhasePrior, CreatedAt: at}}
	docs := []domain.Document{{ID: 9, Title: "pdf"}, {ID: 8, CreatedAt: at}}

	out := sceneBundleToAPI(domain.SceneBundle{Panoramas: pans, Documents: docs})

	assert.Equal(s.T(), len(*out.Panoramas), 2)
	assert.DeepEqual(s.T(), (*out.Panoramas)[0], panoramaToAPI(pans[0]))
	assert.DeepEqual(s.T(), (*out.Panoramas)[1], panoramaToAPI(pans[1]))
	assert.Equal(s.T(), len(*out.Documents), 2)
	assert.DeepEqual(s.T(), (*out.Documents)[0], documentToAPI(docs[0]))
	assert.DeepEqual(s.T(), (*out.Documents)[1], documentToAPI(docs[1]))
}
