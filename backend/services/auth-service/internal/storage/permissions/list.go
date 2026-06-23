package permissions

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns the full permission catalog.
func (s *Store) List(ctx context.Context) ([]domain.Permission, error) {
	rows, err := s.pool.Query(ctx, `SELECT slug, description FROM permissions ORDER BY slug`)
	if err != nil {
		return nil, fmt.Errorf("permissions.List: %w", err)
	}
	defer rows.Close()
	out := make([]domain.Permission, 0, 24)
	for rows.Next() {
		var p domain.Permission
		if err := rows.Scan(&p.Slug, &p.Description); err != nil {
			return nil, fmt.Errorf("permissions.List: scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
