package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetTerritoryAdmins replaces a territory's assigned-admin set with adminIDs.
func (r *PG) SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("storage.SetTerritoryAdmins: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var territoryID int64
	if err := tx.QueryRow(ctx, `SELECT id FROM territories WHERE slug = $1`, slug).Scan(&territoryID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrTerritoryNotFound
		}
		return fmt.Errorf("storage.SetTerritoryAdmins: territory id: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM territory_assignments WHERE territory_id = $1`, territoryID); err != nil {
		return fmt.Errorf("storage.SetTerritoryAdmins: clear: %w", err)
	}
	for _, adminID := range adminIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO territory_assignments (territory_id, admin_user_id) VALUES ($1, $2::uuid)
			 ON CONFLICT DO NOTHING`, territoryID, adminID); err != nil {
			return fmt.Errorf("storage.SetTerritoryAdmins: insert %q: %w", adminID, err)
		}
	}
	return tx.Commit(ctx)
}
