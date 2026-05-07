package service

import (
	"context"
	"sync"

	"golang.org/x/sync/errgroup"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// assetOptionConcurrency caps parallel ListArtifacts lookups so a large
// catalog does not flood the catalog gRPC connection. 8 is comfortable for
// typical installations (10–100 projects); raise if catalog grows past that.
const assetOptionConcurrency = 8

// buildAssetOptions resolves the full LOD chain for every project in the
// catalog in parallel. Projects without successful conversion appear with
// an empty LODs slice — frontend can grey them out in the picker.
func (g *Gateway) buildAssetOptions(ctx context.Context, projects []domain.Project) ([]domain.AssetOption, error) {
	out := make([]domain.AssetOption, len(projects))
	for i, p := range projects {
		out[i] = domain.AssetOption{Slug: p.Slug, Title: p.Title}
	}

	eg, gctx := errgroup.WithContext(ctx)
	eg.SetLimit(assetOptionConcurrency)
	var mu sync.Mutex

	for i, p := range projects {
		eg.Go(func() error {
			arts, err := g.catalog.ListArtifacts(gctx, p.Slug)
			if err != nil {
				return err
			}
			chain := lodChainFromArtifacts(arts)
			mu.Lock()
			out[i].LODs = chain
			mu.Unlock()
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return nil, err
	}
	return out, nil
}
