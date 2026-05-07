package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListArtifacts returns every artifact for a project, ordered by LOD ascending.
func (c *Catalog) ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	if slug == "" {
		return nil, fmt.Errorf("%w: project_slug is required", domain.ErrInvalidInput)
	}
	return c.repo.ListArtifacts(ctx, slug)
}
