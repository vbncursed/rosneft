package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdateModel writes only the fields the patch carries. An empty thumbnail
// hash is "no thumbnail" and clears it.
func (c *Catalog) UpdateModel(ctx context.Context, slug string, p domain.ModelPatch) (domain.Model, error) {
	if err := validatePatch(slug, p.Title); err != nil {
		return domain.Model{}, fmt.Errorf("service.UpdateModel: %w", err)
	}
	if p.ThumbnailBlobHash != nil {
		if err := validateBlobHash(*p.ThumbnailBlobHash, false); err != nil {
			return domain.Model{}, fmt.Errorf("service.UpdateModel: %w", err)
		}
	}
	return c.repo.UpdateModel(ctx, slug, p)
}
