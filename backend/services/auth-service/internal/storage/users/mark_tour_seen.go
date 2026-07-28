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
//
// Deliberately NOT wrapped in audittx.Run, unlike every other write in this
// package. It touches only onboarding_tours_seen and updated_at, both on
// audit_capture()'s ignore list, so the trigger drops the write and there is no
// journal entry to attribute — the transaction would buy a round trip and
// nothing else. Dismissing a first-run tooltip is UI state, not an editorial
// change. Add the wrapper if this ever writes a column that matters.
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
