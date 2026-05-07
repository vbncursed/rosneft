package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListModelArtifacts returns every artifact for a model ordered by LOD.
func (c *Catalog) ListModelArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	if slug == "" {
		return nil, fmt.Errorf("service.ListModelArtifacts: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.ListModelArtifacts(ctx, slug)
}
