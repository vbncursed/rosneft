package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreatePlacementGroup adds a group titled title to territorySlug. An unknown
// territory is ErrTerritoryNotFound; a title placement_groups_title_len refuses
// is ErrInvalidInput.
//
// Wrapped in audittx.Run so the audit trigger can attribute the insert.
func (r *PG) CreatePlacementGroup(ctx context.Context, territorySlug, title string) (domain.PlacementGroup, error) {
	const q = `
		WITH g AS (
			INSERT INTO placement_groups AS g (territory_id, title)
			SELECT t.id, $2 FROM territories t WHERE t.slug = $1
			RETURNING ` + placementGroupReturning + `
		)
		SELECT ` + placementGroupCols + `
		FROM g JOIN territories t ON t.id = g.territory_id`

	var out domain.PlacementGroup
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var err error
		out, err = scanPlacementGroup(tx.QueryRow(ctx, q, territorySlug, title))
		return err
	})
	switch {
	case err == nil:
		return out, nil
	case errors.Is(err, pgx.ErrNoRows):
		return domain.PlacementGroup{}, domain.ErrTerritoryNotFound
	case isGroupTitleViolation(err):
		return domain.PlacementGroup{}, fmt.Errorf("storage.CreatePlacementGroup: %w: a group title is 1 to 120 characters", domain.ErrInvalidInput)
	}
	return domain.PlacementGroup{}, fmt.Errorf("storage.CreatePlacementGroup: %w", err)
}
