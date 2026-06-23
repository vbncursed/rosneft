package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// UpdateTitle renames a role (allowed on system roles too).
func (s *Store) UpdateTitle(ctx context.Context, slug, title string) (domain.Role, error) {
	const q = `UPDATE roles SET title = $2, updated_at = now() WHERE slug = $1 RETURNING id`
	var id string
	if err := s.pool.QueryRow(ctx, q, slug, title).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Role{}, domain.ErrRoleNotFound
		}
		return domain.Role{}, fmt.Errorf("roles.UpdateTitle: %w", err)
	}
	return s.Get(ctx, slug)
}
