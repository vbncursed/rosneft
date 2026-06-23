package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetTOTP sets the enabled flag and encrypted secret (nil secret clears it).
func (s *Store) SetTOTP(ctx context.Context, id string, enabled bool, secret []byte) error {
	const q = `UPDATE users SET totp_enabled = $2, totp_secret = $3, updated_at = now()
		WHERE id = $1 RETURNING id`
	var got string
	if err := s.pool.QueryRow(ctx, q, id, enabled, secret).Scan(&got); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrUserNotFound
		}
		return fmt.Errorf("users.SetTOTP: %w", err)
	}
	return nil
}
