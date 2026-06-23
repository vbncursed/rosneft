package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns every role with permission slugs.
func (s *Store) List(ctx context.Context) ([]domain.Role, error) {
	rows, err := s.pool.Query(ctx, `SELECT slug FROM roles ORDER BY slug`)
	if err != nil {
		return nil, fmt.Errorf("roles.List: %w", err)
	}
	slugs := make([]string, 0, 8)
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			rows.Close()
			return nil, fmt.Errorf("roles.List: scan: %w", err)
		}
		slugs = append(slugs, slug)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("roles.List: rows: %w", err)
	}
	out := make([]domain.Role, 0, len(slugs))
	for _, slug := range slugs {
		r, err := s.Get(ctx, slug)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}
