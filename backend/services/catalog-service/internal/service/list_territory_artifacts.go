package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListTerritoryArtifacts returns every artifact for a territory ordered by LOD.
func (c *Catalog) ListTerritoryArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	if slug == "" {
		return nil, fmt.Errorf("service.ListTerritoryArtifacts: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.ListTerritoryArtifacts(ctx, slug)
}
