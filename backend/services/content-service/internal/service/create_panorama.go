package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// CreatePanorama validates the input and persists the panorama. The slug is
// generated from the title and resolved to a value unique within the
// territory. source_blob_hash is immutable after creation. Position defaults
// to the origin and yaw_offset to 0 if not set.
func (c *Content) CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	if p.TerritorySlug == "" {
		return domain.Panorama{}, fmt.Errorf("service.CreatePanorama: %w: territory_slug is required", domain.ErrInvalidInput)
	}
	if p.Title == "" {
		return domain.Panorama{}, fmt.Errorf("service.CreatePanorama: %w: title is required", domain.ErrInvalidInput)
	}
	if p.SourceBlobHash == "" {
		return domain.Panorama{}, fmt.Errorf("service.CreatePanorama: %w: source_blob_hash is required", domain.ErrInvalidInput)
	}
	return resolveSlug(p.Title, "panorama", func(s string) (domain.Panorama, error) {
		p.Slug = s
		return c.repo.CreatePanorama(ctx, p)
	})
}
