package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListProjects returns every project, sorted by slug.
func (c *Catalog) ListProjects(ctx context.Context) ([]domain.Project, error) {
	return c.repo.ListProjects(ctx)
}
