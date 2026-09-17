// Package credentials is the PostgreSQL store for twofa enrollment state.
package credentials

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Get returns the user's credential, or domain.ErrNotFound if unenrolled.
func (s *Store) Get(ctx context.Context, userID string) (domain.Credential, error) {
	const q = `SELECT user_id, secret, enabled, enabled_at FROM twofa_credentials WHERE user_id = $1`
	var c domain.Credential
	var enabledAt *time.Time
	if err := s.pool.QueryRow(ctx, q, userID).Scan(&c.UserID, &c.Secret, &c.Enabled, &enabledAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Credential{}, domain.ErrNotFound
		}
		return domain.Credential{}, fmt.Errorf("credentials.Get: %w", err)
	}
	if enabledAt != nil {
		c.EnabledAt = *enabledAt
	}
	return c, nil
}

// EnabledFor returns the subset of userIDs whose 2FA is switched on. An id with
// no row and an id with a row that has enabled = false are both simply absent:
// to a caller asking "is 2FA on", unenrolled and disabled are one answer.
func (s *Store) EnabledFor(ctx context.Context, userIDs []string) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	const q = `SELECT user_id FROM twofa_credentials WHERE user_id = ANY($1) AND enabled`
	rows, err := s.pool.Query(ctx, q, userIDs)
	if err != nil {
		return nil, fmt.Errorf("credentials.EnabledFor: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("credentials.EnabledFor: %w", err)
		}
		out = append(out, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("credentials.EnabledFor: %w", err)
	}
	return out, nil
}

// Set upserts the enabled flag + secret (nil secret clears it).
//
// enabled_at is derived here rather than passed in, so every write path gets
// the same rule for free: turning 2FA on stamps the moment unless one is
// already recorded (regenerating recovery codes must not move the enrolment
// date), and turning it off clears it.
func (s *Store) Set(ctx context.Context, userID string, enabled bool, secret []byte) error {
	const q = `INSERT INTO twofa_credentials (user_id, secret, enabled, enabled_at)
		VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END)
		ON CONFLICT (user_id) DO UPDATE SET
			secret = $2,
			enabled = $3,
			enabled_at = CASE WHEN $3 THEN COALESCE(twofa_credentials.enabled_at, now()) ELSE NULL END,
			updated_at = now()`
	if _, err := s.pool.Exec(ctx, q, userID, secret, enabled); err != nil {
		return fmt.Errorf("credentials.Set: %w", err)
	}
	return nil
}
