package users

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetStatus updates status and deleted_at, returning the refreshed user.
func (s *Store) SetStatus(ctx context.Context, id, status string, deletedAt *time.Time) (domain.User, error) {
	const q = `UPDATE users SET status = $2, deleted_at = $3, updated_at = now()
		WHERE id = $1 RETURNING id`
	var got string
	if err := s.pool.QueryRow(ctx, q, id, status, deletedAt).Scan(&got); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.SetStatus: %w", err)
	}
	return s.GetByID(ctx, id)
}

// CountAdmins counts non-deleted users holding the admin role. A non-empty
// excludeUserID is left out of the count (last-admin guard); empty counts all.
func (s *Store) CountAdmins(ctx context.Context, excludeUserID string) (int, error) {
	q := `SELECT count(DISTINCT ur.user_id)
		FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		JOIN users u ON u.id = ur.user_id
		WHERE r.slug = 'admin' AND u.status <> 'deleted'`
	args := []any{}
	if excludeUserID != "" {
		args = append(args, excludeUserID)
		q += " AND ur.user_id <> $1"
	}
	var n int
	if err := s.pool.QueryRow(ctx, q, args...).Scan(&n); err != nil {
		return 0, fmt.Errorf("users.CountAdmins: %w", err)
	}
	return n, nil
}
