package users

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// ChangePassword sets a new password hash and stamps password_changed_at with
// the later of changedAt and the stored epoch + 1µs, and returns the stamp.
// changedAt was chosen by the service from a row read before the (slow) hash,
// so a concurrent change may have stamped something later meanwhile; GREATEST
// keeps the epoch from going backwards, which would revive sessions the
// other change had outdated. GREATEST ignores NULL, so a never-changed row
// takes changedAt. The service moves its caller's session to the returned
// stamp (see users.ChangePassword).
//
// The stamp is what reaches the journal. audit_capture() redacts password_hash
// and ignores updated_at, so without it the UPDATE compared equal and nothing
// was recorded. With it the trigger writes a user.update labelled with the
// target's email, carrying password_changed_at and never the hash; audittx.Run
// attributes it to the actor. That row is the success's only journal entry:
// the gateway records auth.password_change for failed attempts alone.
func (s *Store) ChangePassword(ctx context.Context, id, hash string, changedAt time.Time) (time.Time, error) {
	const q = `UPDATE users
		SET password_hash = $2,
		    password_changed_at = GREATEST(password_changed_at + interval '1 microsecond', $3),
		    updated_at = now()
		WHERE id = $1 RETURNING password_changed_at`

	var stamped time.Time
	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, q, id, hash, changedAt).Scan(&stamped)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return time.Time{}, domain.ErrUserNotFound
		}
		return time.Time{}, fmt.Errorf("users.ChangePassword: %w", err)
	}
	return stamped, nil
}
