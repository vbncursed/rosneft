package service

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// GetSceneBundle aggregates everything the viewer page needs in a single
// round trip:
//
//   - the project itself (404 → propagate)
//   - its artifact chain (LOD0 + lower LODs); when no LOD0 exists the
//     conversion is still pending and we return a nil artifact
//   - placements on this project (always returned, possibly empty)
//   - asset options: every catalog project + its full LOD chain, suitable
//     for the placement-picker dropdown
//
// The fan-out runs in parallel via errgroup. Each project's LODs are
// fetched as one ListArtifacts call rather than per-LOD GetArtifact, so
// the cost is one round trip per project regardless of LOD count.
func (g *Gateway) GetSceneBundle(ctx context.Context, slug string) (domain.SceneBundle, error) {
	if slug == "" {
		return domain.SceneBundle{}, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}

	var (
		project    domain.Project
		artifacts  []domain.Artifact
		placements []domain.Placement
		projects   []domain.Project
	)

	eg, gctx := errgroup.WithContext(ctx)

	eg.Go(func() error {
		p, err := g.catalog.GetProject(gctx, slug)
		if err != nil {
			return err
		}
		project = p
		return nil
	})

	eg.Go(func() error {
		as, err := g.catalog.ListArtifacts(gctx, slug)
		if err != nil {
			return err
		}
		artifacts = as
		return nil
	})

	eg.Go(func() error {
		ps, err := g.catalog.ListPlacements(gctx, slug)
		if err != nil {
			return err
		}
		placements = ps
		return nil
	})

	eg.Go(func() error {
		ps, err := g.catalog.ListProjects(gctx)
		if err != nil {
			return err
		}
		projects = ps
		return nil
	})

	if err := eg.Wait(); err != nil {
		return domain.SceneBundle{}, err
	}

	options, err := g.buildAssetOptions(ctx, projects)
	if err != nil {
		return domain.SceneBundle{}, err
	}

	return domain.SceneBundle{
		Project:      project,
		Artifact:     pickLOD0WithChain(artifacts),
		Placements:   placements,
		AssetOptions: options,
	}, nil
}

// pickLOD0WithChain returns the LOD0 Artifact with its LODs slice filled in
// from all sibling LODs. Returns nil when no LOD0 exists yet (conversion
// pending). Lower LODs without a LOD0 sibling are ignored — the bbox /
// contentType metadata can only come from LOD0.
func pickLOD0WithChain(artifacts []domain.Artifact) *domain.Artifact {
	var lod0 *domain.Artifact
	for i := range artifacts {
		if artifacts[i].LOD == 0 {
			lod0 = &artifacts[i]
			break
		}
	}
	if lod0 == nil {
		return nil
	}
	out := *lod0
	out.LODs = lodChainFromArtifacts(artifacts)
	return &out
}
