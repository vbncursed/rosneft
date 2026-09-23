package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListPlacementGroups returns every group on a territory in id order, [] when
// there are none. An unknown territory is ErrTerritoryNotFound, not an empty
// list.
func (r *PG) ListPlacementGroups(ctx context.Context, territorySlug string) ([]domain.PlacementGroup, error) {
	if _, err := r.GetTerritory(ctx, territorySlug, ""); err != nil { // existence check; scoped at gateway
		return nil, err
	}
	rows, err := r.pool.Query(ctx, `SELECT `+placementGroupCols+`
		FROM placement_groups g JOIN territories t ON t.id = g.territory_id
		WHERE t.slug = $1
		ORDER BY g.id`, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListPlacementGroups: query: %w", err)
	}
	groups, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.PlacementGroup, error) {
		return scanPlacementGroup(row)
	})
	if err != nil {
		return nil, fmt.Errorf("storage.ListPlacementGroups: %w", err)
	}
	return groups, nil
}
