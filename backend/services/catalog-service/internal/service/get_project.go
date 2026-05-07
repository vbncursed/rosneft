package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetProject returns a project by slug.
func (c *Catalog) GetProject(ctx context.Context, slug string) (domain.Project, error) {
	if slug == "" {
		return domain.Project{}, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}
	return c.repo.GetProject(ctx, slug)
}
