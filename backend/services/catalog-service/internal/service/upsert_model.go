package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertModel inserts or updates a model.
func (c *Catalog) UpsertModel(ctx context.Context, m domain.Model) (domain.Model, error) {
	if m.Slug == "" {
		return domain.Model{}, fmt.Errorf("service.UpsertModel: %w: empty slug", domain.ErrInvalidInput)
	}
	if m.SourceBlobHash == "" {
		return domain.Model{}, fmt.Errorf("service.UpsertModel: %w: empty source_blob_hash", domain.ErrInvalidInput)
	}
	return c.repo.UpsertModel(ctx, m)
}
