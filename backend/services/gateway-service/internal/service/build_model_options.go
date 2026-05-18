package service

import (
	"context"
	"sync"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// buildModelOptions resolves every model's full LOD chain in parallel,
// fanning out one ListModelArtifacts call per model. The result is sorted
// in the same order as the input list (= catalog slug order).
//
// Errors from individual lookups are swallowed: a model whose conversion
// failed should still appear in the picker (greyed out, empty LODs) so the
// user can re-trigger it. The alternative — refusing to render the picker
// because one entry is broken — has worse UX.
func (g *Gateway) buildModelOptions(ctx context.Context, models []domain.Model) []domain.AssetOption {
	if len(models) == 0 {
		return []domain.AssetOption{}
	}
	options := make([]domain.AssetOption, len(models))

	var wg sync.WaitGroup
	for i, m := range models {
		wg.Go(func() {
			arts, _ := g.catalog.ListModelArtifacts(ctx, m.Slug)
			opt := domain.AssetOption{
				Slug:  m.Slug,
				Title: m.Title,
				LODs:  lodChain(arts),
			}
			// LOD0 carries the source mesh's original bbox — every
			// LOD shares the same world bounds, but ListModelArtifacts
			// guarantees nothing about ordering, so pick LOD0 explicitly.
			if lod0 := findLOD0(arts); lod0 != nil {
				opt.BBoxMin = &lod0.BBoxMin
				opt.BBoxMax = &lod0.BBoxMax
			}
			options[i] = opt
		})
	}
	wg.Wait()
	return options
}

func findLOD0(arts []domain.Artifact) *domain.Artifact {
	for i := range arts {
		if arts[i].LOD == 0 {
			return &arts[i]
		}
	}
	return nil
}
