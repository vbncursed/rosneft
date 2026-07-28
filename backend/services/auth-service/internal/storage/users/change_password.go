package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// ChangePassword sets a new password hash.
//
// Wrapped in audittx.Run so the change is attributed. audit_capture() redacts
// password_hash from both snapshots, so the journal records that the password
// changed and by whom, never the hash itself.
func (s *Store) ChangePassword(ctx context.Context, id, hash string) error {
	const q = `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id`

	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var got string
		return tx.QueryRow(ctx, q, id, hash).Scan(&got)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrUserNotFound
		}
		return fmt.Errorf("users.ChangePassword: %w", err)
	}
	return nil
}
