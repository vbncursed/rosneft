// In-package test: the converters are unexported.
package catalog

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type ConvertersSuite struct{ suite.Suite }

func TestConvertersSuite(t *testing.T) { suite.Run(t, new(ConvertersSuite)) }

var wantLODs = []domain.LodArtifact{{LOD: 0, Hash: "h0", Size: 10, Vertices: 8, Faces: 12}, {LOD: 1, Hash: "h1", Size: 4}}

func (s *ConvertersSuite) TestATerritoryCarriesItsLODChain() {
	got := territoryFromProto(&catalogv1.Territory{Slug: "yard", Artifacts: []*catalogv1.TerritoryArtifact{
		{Lod: 0, Hash: "h0", Size: 10, Vertices: 8, Faces: 12}, {Lod: 1, Hash: "h1", Size: 4},
	}})
	assert.DeepEqual(s.T(), got.LODs, wantLODs)
}

func (s *ConvertersSuite) TestAModelCarriesItsLODChain() {
	got := modelFromProto(&catalogv1.Model{Slug: "pump", Artifacts: []*catalogv1.ModelArtifact{
		{Lod: 0, Hash: "h0", Size: 10, Vertices: 8, Faces: 12}, {Lod: 1, Hash: "h1", Size: 4},
	}})
	assert.DeepEqual(s.T(), got.LODs, wantLODs)
}

// The scene's model picker reads LOD0's bounds off the list, so the list must
// carry them — whatever order the chain arrives in — and none without a LOD0.
func (s *ConvertersSuite) TestAModelCarriesItsLOD0Bounds() {
	got := modelFromProto(&catalogv1.Model{Slug: "pump", Artifacts: []*catalogv1.ModelArtifact{
		{Lod: 1, BboxMin: &catalogv1.Vec3{X: 9}, BboxMax: &catalogv1.Vec3{X: 9}},
		{Lod: 0, BboxMin: &catalogv1.Vec3{X: -1, Y: -2, Z: -3}, BboxMax: &catalogv1.Vec3{X: 1, Y: 2, Z: 3}},
	}})
	assert.DeepEqual(s.T(), got.BBoxMin, &domain.Vec3{X: -1, Y: -2, Z: -3})
	assert.DeepEqual(s.T(), got.BBoxMax, &domain.Vec3{X: 1, Y: 2, Z: 3})

	bare := modelFromProto(&catalogv1.Model{Slug: "broken"})
	assert.Assert(s.T(), bare.BBoxMin == nil && bare.BBoxMax == nil)
}
