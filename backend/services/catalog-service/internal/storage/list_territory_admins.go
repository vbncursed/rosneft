package storage

import (
	"context"
	"fmt"
)

// ListTerritoryAdmins returns the admin ids assigned to each of slugs, in
// assignment order, the admin id breaking a tie so the answer is stable:
// GetTerritoryAdmins for a whole page in one query. A slug
// nobody is assigned to is absent, and so is an unknown one.
func (r *PG) ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error) {
	const q = `SELECT t.slug, a.admin_user_id::text
FROM territory_assignments a
JOIN territories t ON t.id = a.territory_id
WHERE t.slug = ANY($1)
ORDER BY a.created_at, a.admin_user_id`

	rows, err := r.pool.Query(ctx, q, slugs)
	if err != nil {
		return nil, fmt.Errorf("storage.ListTerritoryAdmins: query: %w", err)
	}
	defer rows.Close()

	out := make(map[string][]string, len(slugs))
	for rows.Next() {
		var slug, id string
		if err := rows.Scan(&slug, &id); err != nil {
			return nil, fmt.Errorf("storage.ListTerritoryAdmins: scan: %w", err)
		}
		out[slug] = append(out[slug], id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListTerritoryAdmins: iter: %w", err)
	}
	return out, nil
}
