package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdateTerritory writes only the fields the patch carries. A source hash, when
// sent, must be a real one: the column is never empty.
func (c *Catalog) UpdateTerritory(ctx context.Context, slug string, p domain.TerritoryPatch) (domain.Territory, error) {
	if err := validatePatch(slug, p.Title); err != nil {
		return domain.Territory{}, fmt.Errorf("service.UpdateTerritory: %w", err)
	}
	if p.SourceBlobHash != nil {
		if err := validateBlobHash(*p.SourceBlobHash, true); err != nil {
			return domain.Territory{}, fmt.Errorf("service.UpdateTerritory: %w", err)
		}
	}
	return c.repo.UpdateTerritory(ctx, slug, p)
}
