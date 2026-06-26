package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListDocuments returns the documents attached to a territory.
func (c *Catalog) ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("service.ListDocuments: %w: territory_slug is required", domain.ErrInvalidInput)
	}
	return c.repo.ListDocuments(ctx, territorySlug)
}
