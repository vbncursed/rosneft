package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertTerritory inserts or updates a territory.
func (c *Catalog) UpsertTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error) {
	if t.Slug == "" {
		return domain.Territory{}, fmt.Errorf("service.UpsertTerritory: %w: empty slug", domain.ErrInvalidInput)
	}
	if t.SourceBlobHash == "" {
		return domain.Territory{}, fmt.Errorf("service.UpsertTerritory: %w: empty source_blob_hash", domain.ErrInvalidInput)
	}
	return c.repo.UpsertTerritory(ctx, t)
}
