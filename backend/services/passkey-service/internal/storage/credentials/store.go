// Package credentials is the PostgreSQL store for WebAuthn credentials.
package credentials

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// Store is the credentials persistence adapter.
type Store struct{ pool *pgxpool.Pool }

// New wraps a pgxpool.Pool.
func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const columns = `id, user_id, credential_id, public_key, sign_count, transports, aaguid, name, created_at, last_used_at`

// Create inserts a new credential.
func (s *Store) Create(ctx context.Context, c domain.Credential) error {
	const q = `INSERT INTO passkey_credentials
		(user_id, credential_id, public_key, sign_count, transports, aaguid, name)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`
	_, err := s.pool.Exec(ctx, q, c.UserID, c.CredentialID, c.PublicKey,
		int64(c.SignCount), strings.Join(c.Transports, ","), c.AAGUID, c.Name)
	if err != nil {
		return fmt.Errorf("credentials.Create: %w", err)
	}
	return nil
}

// ListByUser returns all of a user's credentials, newest first.
func (s *Store) ListByUser(ctx context.Context, userID string) ([]domain.Credential, error) {
	const q = `SELECT ` + columns + ` FROM passkey_credentials WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("credentials.ListByUser: %w", err)
	}
	defer rows.Close()
	var out []domain.Credential
	for rows.Next() {
		c, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// DeleteByCredentialID removes a credential scoped to its owner (defence in
// depth: a user can only delete their own).
func (s *Store) DeleteByCredentialID(ctx context.Context, userID string, credID []byte) error {
	const q = `DELETE FROM passkey_credentials WHERE user_id = $1 AND credential_id = $2`
	tag, err := s.pool.Exec(ctx, q, userID, credID)
	if err != nil {
		return fmt.Errorf("credentials.DeleteByCredentialID: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// UpdateSignCount persists the post-assertion counter and stamps last_used_at.
func (s *Store) UpdateSignCount(ctx context.Context, credID []byte, count uint32) error {
	const q = `UPDATE passkey_credentials SET sign_count = $2, last_used_at = now() WHERE credential_id = $1`
	if _, err := s.pool.Exec(ctx, q, credID, int64(count)); err != nil {
		return fmt.Errorf("credentials.UpdateSignCount: %w", err)
	}
	return nil
}

type scanner interface{ Scan(dst ...any) error }

func scan(r scanner) (domain.Credential, error) {
	var (
		c          domain.Credential
		signCount  int64
		transports string
		lastUsed   *time.Time
	)
	if err := r.Scan(&c.ID, &c.UserID, &c.CredentialID, &c.PublicKey, &signCount,
		&transports, &c.AAGUID, &c.Name, &c.CreatedAt, &lastUsed); err != nil {
		return domain.Credential{}, err
	}
	c.SignCount = uint32(signCount)
	if transports != "" {
		c.Transports = strings.Split(transports, ",")
	}
	c.LastUsedAt = lastUsed
	return c, nil
}
