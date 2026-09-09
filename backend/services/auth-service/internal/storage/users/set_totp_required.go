package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetTOTPRequired flips the second-factor policy on one account and returns the
// refreshed user. Wrapped in audittx.Run so the change is attributed, exactly
// as freezing is.
func (s *Store) SetTOTPRequired(ctx context.Context, id string, required bool) (domain.User, error) {
	const q = `UPDATE users SET totp_required = $2, updated_at = now()
		WHERE id = $1 RETURNING id`

	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var got string
		return tx.QueryRow(ctx, q, id, required).Scan(&got)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.SetTOTPRequired: %w", err)
	}
	return s.GetByID(ctx, id)
}
