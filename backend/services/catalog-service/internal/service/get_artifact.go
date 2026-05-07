package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetArtifact returns the artifact for (slug, lod).
func (c *Catalog) GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	if slug == "" {
		return domain.Artifact{}, fmt.Errorf("%w: project_slug is required", domain.ErrInvalidInput)
	}
	return c.repo.GetArtifact(ctx, slug, lod)
}
