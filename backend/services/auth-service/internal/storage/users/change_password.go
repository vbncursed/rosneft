package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// ChangePassword sets a new password hash and stamps password_changed_at.
//
// The stamp is what reaches the journal. audit_capture() redacts password_hash
// and ignores updated_at, so without it the UPDATE compared equal and nothing
// was recorded. With it the trigger writes a user.update labelled with the
// target's email, carrying password_changed_at and never the hash; audittx.Run
// attributes it to the actor. That row is the success's only journal entry:
// the gateway records auth.password_change for failed attempts alone.
func (s *Store) ChangePassword(ctx context.Context, id, hash string) error {
	const q = `UPDATE users
		SET password_hash = $2, password_changed_at = now(), updated_at = now()
		WHERE id = $1 RETURNING id`

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
