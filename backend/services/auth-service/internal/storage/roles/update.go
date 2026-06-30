package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// UpdateTitle renames a role. System roles are immutable (defined by
// migrations) and refused, mirroring Delete/SetPermissions.
func (s *Store) UpdateTitle(ctx context.Context, slug, title string) (domain.Role, error) {
	existing, err := s.Get(ctx, slug)
	if err != nil {
		return domain.Role{}, err
	}
	if existing.IsSystem {
		return domain.Role{}, domain.ErrSystemRole
	}
	const q = `UPDATE roles SET title = $2, updated_at = now() WHERE slug = $1 RETURNING id`
	var id string
	if err := s.pool.QueryRow(ctx, q, slug, title).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Role{}, domain.ErrRoleNotFound
		}
		return domain.Role{}, fmt.Errorf("roles.UpdateTitle: %w", err)
	}
	return s.Get(ctx, slug)
}
