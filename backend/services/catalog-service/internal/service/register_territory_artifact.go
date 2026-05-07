package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RegisterTerritoryArtifact records a converted GLB output for a territory.
func (c *Catalog) RegisterTerritoryArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error) {
	if err := validateArtifact(a); err != nil {
		return domain.Artifact{}, fmt.Errorf("service.RegisterTerritoryArtifact: %w", err)
	}
	return c.repo.RegisterTerritoryArtifact(ctx, a)
}
