package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreatePanorama validates the input and persists the panorama. Slug and
// source_blob_hash are immutable after creation, so they're only collected
// here. Position defaults to the origin and yaw_offset to 0 if not set.
func (c *Catalog) CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	if p.TerritorySlug == "" {
		return domain.Panorama{}, fmt.Errorf("service.CreatePanorama: %w: territory_slug is required", domain.ErrInvalidInput)
	}
	if p.Slug == "" {
		return domain.Panorama{}, fmt.Errorf("service.CreatePanorama: %w: slug is required", domain.ErrInvalidInput)
	}
	if p.Title == "" {
		return domain.Panorama{}, fmt.Errorf("service.CreatePanorama: %w: title is required", domain.ErrInvalidInput)
	}
	if p.SourceBlobHash == "" {
		return domain.Panorama{}, fmt.Errorf("service.CreatePanorama: %w: source_blob_hash is required", domain.ErrInvalidInput)
	}
	return c.repo.CreatePanorama(ctx, p)
}
