package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// MarkTourSeen appends a tour id to the user's seen list. The service guards
// against appending a duplicate.
func (s *Store) MarkTourSeen(ctx context.Context, id, tour string) error {
	const q = `UPDATE users SET onboarding_tours_seen = array_append(onboarding_tours_seen, $2), updated_at = now() WHERE id = $1 RETURNING id`
	var got string
	if err := s.pool.QueryRow(ctx, q, id, tour).Scan(&got); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrUserNotFound
		}
		return fmt.Errorf("users.MarkTourSeen: %w", err)
	}
	return nil
}
