package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertProject validates and persists a project. Slug and Title are required.
func (c *Catalog) UpsertProject(ctx context.Context, p domain.Project) (domain.Project, error) {
	if p.Slug == "" {
		return domain.Project{}, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}
	if p.Title == "" {
		return domain.Project{}, fmt.Errorf("%w: title is required", domain.ErrInvalidInput)
	}
	if p.SourceObjPath == "" {
		return domain.Project{}, fmt.Errorf("%w: source_obj_path is required", domain.ErrInvalidInput)
	}
	return c.repo.UpsertProject(ctx, p)
}
