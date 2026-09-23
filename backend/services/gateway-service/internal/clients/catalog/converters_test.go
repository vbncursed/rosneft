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
