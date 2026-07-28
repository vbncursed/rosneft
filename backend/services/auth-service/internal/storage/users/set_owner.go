package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetOwner flips the owner flag, returning the refreshed user.
//
// Wrapped in audittx.Run: granting Root is the single highest-privilege change
// in the system, so it must never land in the journal unattributed.
func (s *Store) SetOwner(ctx context.Context, id string, isOwner bool) (domain.User, error) {
	const q = `UPDATE users SET is_owner = $2, updated_at = now() WHERE id = $1 RETURNING id`

	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var got string
		return tx.QueryRow(ctx, q, id, isOwner).Scan(&got)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.SetOwner: %w", err)
	}
	return s.GetByID(ctx, id)
}
