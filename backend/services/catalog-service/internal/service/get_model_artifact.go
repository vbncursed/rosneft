package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetModelArtifact returns a single model artifact at the given LOD.
func (c *Catalog) GetModelArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	if slug == "" {
		return domain.Artifact{}, fmt.Errorf("service.GetModelArtifact: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.GetModelArtifact(ctx, slug, lod)
}
