package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteTerritoryArtifacts clears a territory's LOD artifacts, resetting it to
// a pending state before a source-replacement re-conversion.
func (c *Catalog) DeleteTerritoryArtifacts(ctx context.Context, slug string) error {
	if slug == "" {
		return fmt.Errorf("service.DeleteTerritoryArtifacts: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.DeleteTerritoryArtifacts(ctx, slug)
}
