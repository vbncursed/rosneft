package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RenamePlacementGroup retitles group id on territorySlug. The statement is
// scoped to the slug, so a group of another territory is
// ErrPlacementGroupNotFound exactly like an unknown id.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change.
func (r *PG) RenamePlacementGroup(ctx context.Context, territorySlug string, id int64, title string) (domain.PlacementGroup, error) {
	const q = `
		WITH g AS (
			UPDATE placement_groups g SET title = $3, updated_at = NOW()
			FROM territories t
			WHERE g.id = $2 AND g.territory_id = t.id AND t.slug = $1
			RETURNING ` + placementGroupReturning + `
		)
		SELECT ` + placementGroupCols + `
		FROM g JOIN territories t ON t.id = g.territory_id`

	var out domain.PlacementGroup
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var err error
		out, err = scanPlacementGroup(tx.QueryRow(ctx, q, territorySlug, id, title))
		return err
	})
	switch {
	case err == nil:
		return out, nil
	case errors.Is(err, pgx.ErrNoRows):
		return domain.PlacementGroup{}, domain.ErrPlacementGroupNotFound
	case isGroupTitleViolation(err):
		return domain.PlacementGroup{}, fmt.Errorf("storage.RenamePlacementGroup: %w: a group title is 1 to 120 characters", domain.ErrInvalidInput)
	}
	return domain.PlacementGroup{}, fmt.Errorf("storage.RenamePlacementGroup: %w", err)
}
