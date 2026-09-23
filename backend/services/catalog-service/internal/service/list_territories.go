package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListTerritories returns territories visible to scopeAdminID (empty = all),
// each with its LOD chain when withArtifacts is set.
func (c *Catalog) ListTerritories(ctx context.Context, scopeAdminID string, withArtifacts bool) ([]domain.Territory, error) {
	return c.repo.ListTerritories(ctx, scopeAdminID, withArtifacts)
}
