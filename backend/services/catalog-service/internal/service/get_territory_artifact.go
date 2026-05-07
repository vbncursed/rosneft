package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetTerritoryArtifact returns a single territory artifact at the given LOD.
func (c *Catalog) GetTerritoryArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	if slug == "" {
		return domain.Artifact{}, fmt.Errorf("service.GetTerritoryArtifact: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.GetTerritoryArtifact(ctx, slug, lod)
}
