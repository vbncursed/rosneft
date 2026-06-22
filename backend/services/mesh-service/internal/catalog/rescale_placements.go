package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// RescaleTerritoryPlacements asks the catalog to apply any pending rescale
// baseline for the territory now that the replacement mesh has converted —
// keeping existing placements 1:1 against the new normalization. The catalog
// no-ops when no baseline is pending.
func (c *Client) RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64) error {
	_, err := c.cc.RescaleTerritoryPlacements(ctx, &catalogv1.RescaleTerritoryPlacementsRequest{
		TerritorySlug: slug,
		NewSourceMax:  newMax,
	})
	if err != nil {
		return fmt.Errorf("catalog.RescaleTerritoryPlacements: %w", mapStatusErr(err, domain.ErrTargetNotFound))
	}
	return nil
}
