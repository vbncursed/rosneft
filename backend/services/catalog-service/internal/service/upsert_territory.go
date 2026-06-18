package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertTerritory creates or updates a territory. An empty slug is the
// create signal: the slug is generated from the title and resolved to a
// unique value. A non-empty slug is the update path (read-modify-write),
// which upserts the row as-is.
func (c *Catalog) UpsertTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error) {
	if t.SourceBlobHash == "" {
		return domain.Territory{}, fmt.Errorf("service.UpsertTerritory: %w: empty source_blob_hash", domain.ErrInvalidInput)
	}
	if t.Slug != "" {
		return c.repo.UpsertTerritory(ctx, t)
	}
	if t.Title == "" {
		return domain.Territory{}, fmt.Errorf("service.UpsertTerritory: %w: empty title", domain.ErrInvalidInput)
	}
	return resolveSlug(t.Title, "territory", func(s string) (domain.Territory, error) {
		t.Slug = s
		return c.repo.CreateTerritory(ctx, t)
	})
}
