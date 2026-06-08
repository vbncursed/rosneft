package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListPanoramas returns the panoramas anchored to a territory.
func (g *Gateway) ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	return g.catalog.ListPanoramas(ctx, territorySlug)
}

// CreatePanorama validates input and persists the panorama.
func (g *Gateway) CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	if p.TerritorySlug == "" {
		return domain.Panorama{}, fmt.Errorf("%w: territory slug is required", domain.ErrInvalidInput)
	}
	if p.Slug == "" {
		return domain.Panorama{}, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}
	if p.Title == "" {
		return domain.Panorama{}, fmt.Errorf("%w: title is required", domain.ErrInvalidInput)
	}
	if p.SourceBlobHash == "" {
		return domain.Panorama{}, fmt.Errorf("%w: source_blob_hash is required", domain.ErrInvalidInput)
	}
	return g.catalog.CreatePanorama(ctx, p)
}

// UpdatePanorama replaces title, position, and yaw offset.
func (g *Gateway) UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	if p.ID == 0 {
		return domain.Panorama{}, fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	if p.Title == "" {
		return domain.Panorama{}, fmt.Errorf("%w: title is required", domain.ErrInvalidInput)
	}
	return g.catalog.UpdatePanorama(ctx, p)
}

// DeletePanorama removes a panorama by ID.
func (g *Gateway) DeletePanorama(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return g.catalog.DeletePanorama(ctx, id)
}
