// Package recovery is the PostgreSQL store for one-time 2FA recovery codes.
package recovery

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Replace deletes the user's existing codes and inserts fresh hashes.
func (s *Store) Replace(ctx context.Context, userID string, hashes []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("recovery.Replace: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `DELETE FROM recovery_codes WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("recovery.Replace: clear: %w", err)
	}
	for _, h := range hashes {
		if _, err := tx.Exec(ctx, `INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1,$2)`, userID, h); err != nil {
			return fmt.Errorf("recovery.Replace: insert: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// List returns ids + hashes of the user's UNUSED codes (same index order).
func (s *Store) List(ctx context.Context, userID string) (ids, hashes []string, err error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`, userID)
	if err != nil {
		return nil, nil, fmt.Errorf("recovery.List: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, h string
		if err := rows.Scan(&id, &h); err != nil {
			return nil, nil, fmt.Errorf("recovery.List: scan: %w", err)
		}
		ids = append(ids, id)
		hashes = append(hashes, h)
	}
	return ids, hashes, rows.Err()
}

// MarkUsed stamps a code as consumed.
func (s *Store) MarkUsed(ctx context.Context, id string) error {
	if _, err := s.pool.Exec(ctx, `UPDATE recovery_codes SET used_at = now() WHERE id = $1`, id); err != nil {
		return fmt.Errorf("recovery.MarkUsed: %w", err)
	}
	return nil
}

// DeleteAll removes every code for a user (on 2FA disable).
func (s *Store) DeleteAll(ctx context.Context, userID string) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM recovery_codes WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("recovery.DeleteAll: %w", err)
	}
	return nil
}
