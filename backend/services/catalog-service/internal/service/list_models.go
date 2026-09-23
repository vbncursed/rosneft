package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListModels returns every model in the catalog, each with its LOD chain when
// withArtifacts is set.
func (c *Catalog) ListModels(ctx context.Context, withArtifacts bool) ([]domain.Model, error) {
	return c.repo.ListModels(ctx, withArtifacts)
}
