package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteModel removes a model by slug. Returns ErrInvalidInput if the model
// is still referenced by placements.
func (c *Catalog) DeleteModel(ctx context.Context, slug string) error {
	if slug == "" {
		return fmt.Errorf("service.DeleteModel: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.DeleteModel(ctx, slug)
}
