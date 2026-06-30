package service

import (
	"context"
	"errors"
	"fmt"

	"golang.org/x/sync/errgroup"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// GetSceneBundle is the single-shot composition for the viewer page. It
// fans out four catalog calls in parallel — territory, territory artifacts,
// placements, and the model catalog — and stitches the result together.
//
// A missing LOD0 territory artifact is not an error: SceneBundle.Artifact
// is left nil so the frontend renders a "conversion pending" placeholder.
func (g *Gateway) GetSceneBundle(ctx context.Context, slug, scopeAdminID string) (domain.SceneBundle, error) {
	if slug == "" {
		return domain.SceneBundle{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}

	var (
		bundle     domain.SceneBundle
		territory  domain.Territory
		artifacts  []domain.Artifact
		placements []domain.Placement
		models     []domain.Model
		panoramas  []domain.Panorama
		documents  []domain.Document
	)

	gr, gctx := errgroup.WithContext(ctx)
	gr.Go(func() error {
		t, err := g.catalog.GetTerritory(gctx, slug, scopeAdminID)
		if err != nil {
			return err
		}
		territory = t
		return nil
	})
	gr.Go(func() error {
		a, err := g.catalog.ListTerritoryArtifacts(gctx, slug)
		if err != nil && !errors.Is(err, domain.ErrTerritoryNotFound) {
			return err
		}
		artifacts = a
		return nil
	})
	gr.Go(func() error {
		p, err := g.catalog.ListPlacements(gctx, slug)
		if err != nil && !errors.Is(err, domain.ErrTerritoryNotFound) {
			return err
		}
		placements = p
		return nil
	})
	gr.Go(func() error {
		m, err := g.catalog.ListModels(gctx)
		if err != nil {
			return err
		}
		models = m
		return nil
	})
	gr.Go(func() error {
		p, err := g.catalog.ListPanoramas(gctx, slug)
		if err != nil && !errors.Is(err, domain.ErrTerritoryNotFound) {
			return err
		}
		panoramas = p
		return nil
	})
	gr.Go(func() error {
		d, err := g.catalog.ListDocuments(gctx, slug)
		if err != nil && !errors.Is(err, domain.ErrTerritoryNotFound) {
			return err
		}
		documents = d
		return nil
	})
	if err := gr.Wait(); err != nil {
		return domain.SceneBundle{}, err
	}

	bundle.Territory = territory
	bundle.Placements = nilToEmptyPlacements(placements)
	bundle.Panoramas = nilToEmptyPanoramas(panoramas)
	bundle.Documents = nilToEmptyDocuments(documents)
	if a, ok := pickLOD0(artifacts); ok {
		a.LODs = lodChain(artifacts)
		bundle.Artifact = &a
	}
	bundle.ModelOptions = g.buildModelOptions(ctx, models)
	return bundle, nil
}

// pickLOD0 returns the LOD0 artifact from a catalog list, if present.
func pickLOD0(arts []domain.Artifact) (domain.Artifact, bool) {
	for _, a := range arts {
		if a.LOD == 0 {
			return a, true
		}
	}
	return domain.Artifact{}, false
}

// lodChain projects the full artifact list down to LOD descriptors for the
// viewer-side LOD picker.
func lodChain(arts []domain.Artifact) []domain.LodArtifact {
	out := make([]domain.LodArtifact, len(arts))
	for i, a := range arts {
		out[i] = domain.LodArtifact{
			LOD:      a.LOD,
			Hash:     a.Hash,
			Size:     a.Size,
			Vertices: a.Vertices,
			Faces:    a.Faces,
		}
	}
	return out
}

func nilToEmptyPlacements(in []domain.Placement) []domain.Placement {
	if in == nil {
		return []domain.Placement{}
	}
	return in
}

func nilToEmptyPanoramas(in []domain.Panorama) []domain.Panorama {
	if in == nil {
		return []domain.Panorama{}
	}
	return in
}

func nilToEmptyDocuments(in []domain.Document) []domain.Document {
	if in == nil {
		return []domain.Document{}
	}
	return in
}
