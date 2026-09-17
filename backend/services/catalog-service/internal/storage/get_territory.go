package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetTerritory returns a single territory by slug, with its placement count.
// When scopeAdminID is non-empty, the territory must be assigned to that
// admin or it reads as not found (empty scope = no check; covers Root and
// internal callers).
func (r *PG) GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error) {
	const q = `SELECT t.slug, t.title, t.description, t.source_blob_hash, t.external_panorama_url, t.created_at, t.updated_at,
       (SELECT COUNT(*) FROM placements p WHERE p.territory_id = t.id) AS placement_count
FROM territories t
WHERE t.slug = $1 AND ($2 = '' OR EXISTS (
    SELECT 1 FROM territory_assignments a
    WHERE a.territory_id = t.id AND a.admin_user_id = $2::uuid))`

	row := r.pool.QueryRow(ctx, q, slug, scopeAdminID)
	t, err := scanTerritoryListed(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Territory{}, domain.ErrTerritoryNotFound
		}
		return domain.Territory{}, fmt.Errorf("storage.GetTerritory: %w", err)
	}
	return t, nil
}
