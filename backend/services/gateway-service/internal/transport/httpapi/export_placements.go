package httpapi

import (
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

// exportPlacements turns a scene bundle into what the viewer draws: the
// territory first (identity transform, named by its title), then every placement
// that is neither hidden itself nor in a hidden group, at its model's LOD 0.
// A placement whose model has no LOD 0 is left out and counted in skipped.
//
// A group id the bundle does not list (deleted between the reads) counts as
// visible: the viewer draws a placement it cannot find a group for.
//
// For variantCompatible the hashes are the plain copies; a blob without one
// has Hash "" and the caller refuses the export instead of shipping a
// compressed blob under the compatible name.
//
// The caller has checked b.Artifact is non-nil.
func exportPlacements(b domain.SceneBundle, v exportVariant) (placements []glbexport.Placement, skipped int) {
	hiddenGroup := make(map[int64]bool, len(b.PlacementGroups))
	for _, g := range b.PlacementGroups {
		hiddenGroup[g.ID] = g.Hidden
	}
	lod0 := make(map[string]string, len(b.ModelOptions))
	for _, m := range b.ModelOptions {
		for _, l := range m.LODs {
			if l.LOD == 0 {
				lod0[m.Slug] = v.pick(l.Hash, l.PlainHash)
			}
		}
	}

	placements = append(placements, glbexport.Placement{
		Hash: v.pick(b.Artifact.Hash, b.Artifact.PlainHash), Name: b.Territory.Title, Scale: [3]float64{1, 1, 1},
	})
	for _, p := range b.Placements {
		if p.Hidden || (p.GroupID != nil && hiddenGroup[*p.GroupID]) {
			continue
		}
		hash, ok := lod0[p.ModelSlug]
		if !ok {
			skipped++
			continue
		}
		name := p.Label
		if name == "" {
			name = fmt.Sprintf("%s-%d", p.ModelSlug, p.ID)
		}
		placements = append(placements, glbexport.Placement{
			Hash:        hash,
			Name:        name,
			Translation: [3]float64{p.Position.X, p.Position.Y, p.Position.Z},
			Rotation:    [3]float64{p.Rotation.X, p.Rotation.Y, p.Rotation.Z},
			Scale:       [3]float64{p.Scale.X, p.Scale.Y, p.Scale.Z},
		})
	}
	return placements, skipped
}
