package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// RescaleTerritoryPlacements asks the catalog to apply any pending rescale
// baseline for the territory now that the replacement mesh has converted —
// keeping existing placements, measurements and panoramas 1:1 against the new
// normalization. The catalog no-ops when no baseline is pending.
func (c *Client) RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) error {
	_, err := c.cc.RescaleTerritoryPlacements(ctx, &catalogv1.RescaleTerritoryPlacementsRequest{
		TerritorySlug:   slug,
		NewSourceMax:    newMax,
		NewSourceCenter: &catalogv1.Vec3{X: newCenter.X, Y: newCenter.Y, Z: newCenter.Z},
	})
	if err != nil {
		return fmt.Errorf("catalog.RescaleTerritoryPlacements: %w", mapStatusErr(err, domain.ErrTargetNotFound))
	}
	return nil
}
