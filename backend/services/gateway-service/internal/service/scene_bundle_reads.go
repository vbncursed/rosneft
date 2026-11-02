package service

import (
	"context"
	"errors"

	"golang.org/x/sync/errgroup"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// sceneReads is what the scene bundle's parallel reads bring back.
type sceneReads struct {
	territory  domain.Territory
	artifacts  []domain.Artifact
	placements []domain.Placement
	models     []domain.Model
	panoramas  []domain.Panorama
	documents  []domain.Document
	measures   []domain.Measurement
	groups     []domain.PlacementGroup
	phases     []domain.PanoramaPhase
}

// readScene runs every read of the bundle in parallel; the first failure
// cancels the rest. Only the territory read and the model catalog treat a
// "territory not found" answer as an error — the territory read owns it.
func (g *Gateway) readScene(ctx context.Context, slug, scopeAdminID string) (sceneReads, error) {
	var d sceneReads
	gr, gctx := errgroup.WithContext(ctx)
	gr.Go(func() error {
		t, err := g.catalog.GetTerritory(gctx, slug, scopeAdminID)
		if err != nil {
			return err
		}
		d.territory = t
		return nil
	})
	gr.Go(tolerant(&d.artifacts, func() ([]domain.Artifact, error) {
		return g.catalog.ListTerritoryArtifacts(gctx, slug)
	}))
	gr.Go(tolerant(&d.placements, func() ([]domain.Placement, error) {
		return g.catalog.ListPlacements(gctx, slug)
	}))
	gr.Go(tolerant(&d.measures, func() ([]domain.Measurement, error) {
		return g.catalog.ListMeasurements(gctx, slug)
	}))
	gr.Go(tolerant(&d.groups, func() ([]domain.PlacementGroup, error) {
		return g.catalog.ListPlacementGroups(gctx, slug)
	}))
	gr.Go(func() error {
		m, err := g.catalog.ListModels(gctx, true)
		if err != nil {
			return err
		}
		d.models = m
		return nil
	})
	gr.Go(tolerant(&d.panoramas, func() ([]domain.Panorama, error) {
		return g.content.ListPanoramas(gctx, slug)
	}))
	gr.Go(tolerant(&d.phases, func() ([]domain.PanoramaPhase, error) {
		return g.content.ListPanoramaPhases(gctx, slug)
	}))
	gr.Go(tolerant(&d.documents, func() ([]domain.Document, error) {
		return g.content.ListDocuments(gctx, slug)
	}))
	if err := gr.Wait(); err != nil {
		return sceneReads{}, err
	}
	return d, nil
}

// tolerant adapts a list read for errgroup: the list lands in *dst, and a
// "territory not found" answer is not a failure.
func tolerant[T any](dst *[]T, list func() ([]T, error)) func() error {
	return func() error {
		v, err := list()
		if err != nil && !errors.Is(err, domain.ErrTerritoryNotFound) {
			return err
		}
		*dst = v
		return nil
	}
}
