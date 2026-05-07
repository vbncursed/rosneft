package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetModel returns a single model by slug.
func (c *Catalog) GetModel(ctx context.Context, slug string) (domain.Model, error) {
	if slug == "" {
		return domain.Model{}, fmt.Errorf("service.GetModel: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.GetModel(ctx, slug)
}
