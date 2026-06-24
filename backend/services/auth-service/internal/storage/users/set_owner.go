package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetOwner flips the owner flag, returning the refreshed user.
func (s *Store) SetOwner(ctx context.Context, id string, isOwner bool) (domain.User, error) {
	const q = `UPDATE users SET is_owner = $2, updated_at = now() WHERE id = $1 RETURNING id`
	var got string
	if err := s.pool.QueryRow(ctx, q, id, isOwner).Scan(&got); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.SetOwner: %w", err)
	}
	return s.GetByID(ctx, id)
}
