package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Delete removes a non-system role. System roles are refused. A role still
// assigned to users fails on the user_roles FK (RESTRICT) — surfaced wrapped.
func (s *Store) Delete(ctx context.Context, slug string) error {
	var isSystem bool
	if err := s.pool.QueryRow(ctx, `SELECT is_system FROM roles WHERE slug = $1`, slug).Scan(&isSystem); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrRoleNotFound
		}
		return fmt.Errorf("roles.Delete: lookup: %w", err)
	}
	if isSystem {
		return domain.ErrSystemRole
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM roles WHERE slug = $1`, slug); err != nil {
		return fmt.Errorf("roles.Delete: %w", err)
	}
	return nil
}
