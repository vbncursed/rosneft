package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// ChangePassword sets a new password hash.
func (s *Store) ChangePassword(ctx context.Context, id, hash string) error {
	const q = `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id`
	var got string
	if err := s.pool.QueryRow(ctx, q, id, hash).Scan(&got); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrUserNotFound
		}
		return fmt.Errorf("users.ChangePassword: %w", err)
	}
	return nil
}
