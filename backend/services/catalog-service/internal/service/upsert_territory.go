package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertTerritory creates a territory; the name is the RPC's, which predates
// the partial edit. It never touches an existing row: edits go through
// UpdateTerritory. An empty slug is the usual case — the slug is generated from
// the title and resolved to a unique value. A non-empty slug is inserted as
// given, and a taken one is ErrSlugConflict (AlreadyExists), never renamed.
func (c *Catalog) UpsertTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error) {
	if err := validateBlobHash(t.SourceBlobHash, true); err != nil {
		return domain.Territory{}, fmt.Errorf("service.UpsertTerritory: %w", err)
	}
	if t.Slug != "" {
		return c.repo.CreateTerritory(ctx, t)
	}
	if t.Title == "" {
		return domain.Territory{}, fmt.Errorf("service.UpsertTerritory: %w: empty title", domain.ErrInvalidInput)
	}
	return resolveSlug(t.Title, "territory", func(s string) (domain.Territory, error) {
		t.Slug = s
		return c.repo.CreateTerritory(ctx, t)
	})
}
