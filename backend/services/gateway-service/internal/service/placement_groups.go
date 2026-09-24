package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// maxBulkPlacementIDs mirrors the catalog's ceiling so an oversized list is a
// 400 before any round trip. The catalog still enforces it, and de-duplicates.
const maxBulkPlacementIDs = 1000

func checkBulkIDs(ids []int64) error {
	if len(ids) == 0 || len(ids) > maxBulkPlacementIDs {
		return fmt.Errorf("%w: a bulk update names 1 to %d placements, got %d",
			domain.ErrInvalidInput, maxBulkPlacementIDs, len(ids))
	}
	return nil
}

// SetPlacementsHidden hides or shows every placement in ids on territorySlug,
// all or none, and answers how many were written.
func (g *Gateway) SetPlacementsHidden(ctx context.Context, territorySlug string, ids []int64, hidden bool) (int, error) {
	if err := checkBulkIDs(ids); err != nil {
		return 0, err
	}
	return g.catalog.SetPlacementsHidden(ctx, territorySlug, ids, hidden)
}

// SetPlacementsGroup moves every placement in ids on territorySlug into
// groupID, or out of any group when it is nil, all or none.
func (g *Gateway) SetPlacementsGroup(ctx context.Context, territorySlug string, ids []int64, groupID *int64) (int, error) {
	if err := checkBulkIDs(ids); err != nil {
		return 0, err
	}
	return g.catalog.SetPlacementsGroup(ctx, territorySlug, ids, groupID)
}

// CreatePlacementGroup, RenamePlacementGroup and DeletePlacementGroup pass
// through: the catalog trims and bounds the title and scopes the id by
// territorySlug, the slug the route's gate checked.

func (g *Gateway) CreatePlacementGroup(ctx context.Context, territorySlug, title string) (domain.PlacementGroup, error) {
	return g.catalog.CreatePlacementGroup(ctx, territorySlug, title)
}

func (g *Gateway) RenamePlacementGroup(ctx context.Context, territorySlug string, id int64, title string) (domain.PlacementGroup, error) {
	return g.catalog.RenamePlacementGroup(ctx, territorySlug, id, title)
}

func (g *Gateway) DeletePlacementGroup(ctx context.Context, territorySlug string, id int64) error {
	return g.catalog.DeletePlacementGroup(ctx, territorySlug, id)
}
