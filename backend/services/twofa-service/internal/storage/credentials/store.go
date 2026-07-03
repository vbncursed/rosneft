// Package credentials is the PostgreSQL store for twofa enrollment state.
package credentials

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Get returns the user's credential, or domain.ErrNotFound if unenrolled.
func (s *Store) Get(ctx context.Context, userID string) (domain.Credential, error) {
	const q = `SELECT user_id, secret, enabled FROM twofa_credentials WHERE user_id = $1`
	var c domain.Credential
	if err := s.pool.QueryRow(ctx, q, userID).Scan(&c.UserID, &c.Secret, &c.Enabled); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Credential{}, domain.ErrNotFound
		}
		return domain.Credential{}, fmt.Errorf("credentials.Get: %w", err)
	}
	return c, nil
}

// Set upserts the enabled flag + secret (nil secret clears it).
func (s *Store) Set(ctx context.Context, userID string, enabled bool, secret []byte) error {
	const q = `INSERT INTO twofa_credentials (user_id, secret, enabled)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET secret = $2, enabled = $3, updated_at = now()`
	if _, err := s.pool.Exec(ctx, q, userID, secret, enabled); err != nil {
		return fmt.Errorf("credentials.Set: %w", err)
	}
	return nil
}
