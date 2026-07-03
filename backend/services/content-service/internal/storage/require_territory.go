package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// requireTerritory returns ErrTerritoryNotFound unless a territory with the
// given slug exists. content-service does not own territories; it only needs
// their existence to distinguish "no rows yet" from "no such territory"
// (per-admin scoping is enforced upstream in the gateway).
func (r *PG) requireTerritory(ctx context.Context, slug string) error {
	const q = `SELECT 1 FROM territories WHERE slug = $1`
	var one int
	if err := r.pool.QueryRow(ctx, q, slug).Scan(&one); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrTerritoryNotFound
		}
		return fmt.Errorf("storage.requireTerritory: %w", err)
	}
	return nil
}
