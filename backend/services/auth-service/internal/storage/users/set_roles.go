package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetRoles replaces the user's role set with roleSlugs.
func (s *Store) SetRoles(ctx context.Context, id string, roleSlugs []string) (domain.User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("users.SetRoles: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, id); err != nil {
		return domain.User{}, fmt.Errorf("users.SetRoles: clear: %w", err)
	}
	if err := bindRoles(ctx, tx, id, roleSlugs); err != nil {
		return domain.User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.User{}, fmt.Errorf("users.SetRoles: commit: %w", err)
	}
	return s.GetByID(ctx, id)
}
