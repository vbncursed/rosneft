package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertModel creates a model; the name is the RPC's, which predates the
// partial edit. It never touches an existing row: edits go through
// UpdateModel. An empty slug is the usual case — the slug is generated from the
// title and resolved to a unique value. A non-empty slug is inserted as given,
// and a taken one is ErrSlugConflict (AlreadyExists), never renamed.
func (c *Catalog) UpsertModel(ctx context.Context, m domain.Model) (domain.Model, error) {
	if err := validateBlobHash(m.SourceBlobHash, true); err != nil {
		return domain.Model{}, fmt.Errorf("service.UpsertModel: %w", err)
	}
	if err := validateBlobHash(m.ThumbnailBlobHash, false); err != nil {
		return domain.Model{}, fmt.Errorf("service.UpsertModel: %w", err)
	}
	if m.Slug != "" {
		return c.repo.CreateModel(ctx, m)
	}
	if m.Title == "" {
		return domain.Model{}, fmt.Errorf("service.UpsertModel: %w: empty title", domain.ErrInvalidInput)
	}
	return resolveSlug(m.Title, "model", func(s string) (domain.Model, error) {
		m.Slug = s
		return c.repo.CreateModel(ctx, m)
	})
}
