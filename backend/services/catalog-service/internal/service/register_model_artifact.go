package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RegisterModelArtifact records a converted GLB output for a model.
func (c *Catalog) RegisterModelArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error) {
	if err := validateArtifact(a); err != nil {
		return domain.Artifact{}, fmt.Errorf("service.RegisterModelArtifact: %w", err)
	}
	return c.repo.RegisterModelArtifact(ctx, a)
}
