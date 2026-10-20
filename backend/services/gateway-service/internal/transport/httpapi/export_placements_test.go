package httpapi

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

type ExportPlacementsSuite struct{ suite.Suite }

func TestExportPlacementsSuite(t *testing.T) { suite.Run(t, new(ExportPlacementsSuite)) }

func lods(hash string) []domain.LodArtifact {
	return []domain.LodArtifact{{LOD: 1, Hash: hash + "-1"}, {LOD: 0, Hash: hash}}
}

func (s *ExportPlacementsSuite) bundle(ps ...domain.Placement) domain.SceneBundle {
	return domain.SceneBundle{
		Territory: domain.Territory{Slug: "ust-kut", Title: "Усть-Кут"},
		Artifact:  &domain.Artifact{Hash: "terr"},
		ModelOptions: []domain.AssetOption{
			{Slug: "tank", LODs: lods("tank")},
			{Slug: "pipe", LODs: lods("pipe")},
			{Slug: "raw"}, // not converted: no LODs
		},
		PlacementGroups: []domain.PlacementGroup{{ID: 1, Hidden: true}, {ID: 2}},
		Placements:      ps,
	}
}

func (s *ExportPlacementsSuite) TestTerritoryIsFirst() {
	got, skipped := exportPlacements(s.bundle())

	assert.Equal(s.T(), skipped, 0)
	assert.DeepEqual(s.T(), got, []glbexport.Placement{
		{Hash: "terr", Name: "Усть-Кут", Scale: [3]float64{1, 1, 1}},
	})
}

func (s *ExportPlacementsSuite) TestCopiesTransformAndUsesLOD0() {
	got, skipped := exportPlacements(s.bundle(domain.Placement{
		ID: 42, ModelSlug: "tank", Label: "Резервуар",
		Position: domain.Vec3{X: 1, Y: 2, Z: 3},
		Rotation: domain.Vec3{X: 0.1, Y: 0.2, Z: 0.3},
		Scale:    domain.Vec3{X: 4, Y: 5, Z: 6},
	}))

	assert.Equal(s.T(), skipped, 0)
	assert.Equal(s.T(), len(got), 2)
	assert.DeepEqual(s.T(), got[1], glbexport.Placement{
		Hash: "tank", Name: "Резервуар",
		Translation: [3]float64{1, 2, 3}, Rotation: [3]float64{0.1, 0.2, 0.3}, Scale: [3]float64{4, 5, 6},
	})
}

func (s *ExportPlacementsSuite) TestEmptyLabelFallsBackToSlugAndID() {
	got, _ := exportPlacements(s.bundle(domain.Placement{ID: 42, ModelSlug: "tank"}))

	assert.Equal(s.T(), got[1].Name, "tank-42")
}

func (s *ExportPlacementsSuite) TestHiddenIsLeftOut() {
	grp := func(id int64) *int64 { return &id }
	got, skipped := exportPlacements(s.bundle(
		domain.Placement{ID: 1, ModelSlug: "tank", Hidden: true},
		domain.Placement{ID: 2, ModelSlug: "tank", GroupID: grp(1)}, // hidden group
		domain.Placement{ID: 3, ModelSlug: "pipe", GroupID: grp(2)}, // visible group
	))

	assert.Equal(s.T(), skipped, 0)
	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[1].Name, "pipe-3")
}

// Review Focus 4: a group deleted between the two reads must not drop or crash.
func (s *ExportPlacementsSuite) TestUnknownGroupIsVisible() {
	gone := int64(99)
	got, _ := exportPlacements(s.bundle(domain.Placement{ID: 7, ModelSlug: "tank", GroupID: &gone}))

	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[1].Name, "tank-7")
}

func (s *ExportPlacementsSuite) TestModelWithoutLOD0IsSkippedAndCounted() {
	got, skipped := exportPlacements(s.bundle(
		domain.Placement{ID: 1, ModelSlug: "raw"},
		domain.Placement{ID: 2, ModelSlug: "unknown"},
		domain.Placement{ID: 3, ModelSlug: "tank"},
	))

	assert.Equal(s.T(), skipped, 2)
	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[1].Name, "tank-3")
}
