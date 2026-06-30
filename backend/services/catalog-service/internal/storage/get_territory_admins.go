package storage

import (
	"context"
	"fmt"
)

// GetTerritoryAdmins returns the admin user ids assigned to a territory.
func (r *PG) GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error) {
	const q = `SELECT a.admin_user_id::text
FROM territory_assignments a
JOIN territories t ON t.id = a.territory_id
WHERE t.slug = $1
ORDER BY a.created_at`

	rows, err := r.pool.Query(ctx, q, slug)
	if err != nil {
		return nil, fmt.Errorf("storage.GetTerritoryAdmins: query: %w", err)
	}
	defer rows.Close()

	out := make([]string, 0, 8)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("storage.GetTerritoryAdmins: scan: %w", err)
		}
		out = append(out, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.GetTerritoryAdmins: iter: %w", err)
	}
	return out, nil
}
