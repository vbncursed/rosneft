package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// UpdateTitle renames a role. Refused for system roles and for roles outside
// the actor's group (see assertMutable). Wrapped in audittx.Run so the rename
// is attributed.
func (s *Store) UpdateTitle(ctx context.Context, slug, title, scopeAdminID string, allAccess bool) (domain.Role, error) {
	if err := s.assertMutable(ctx, slug, scopeAdminID, allAccess); err != nil {
		return domain.Role{}, err
	}
	const q = `UPDATE roles SET title = $2, updated_at = now() WHERE slug = $1 RETURNING id`

	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var id string
		return tx.QueryRow(ctx, q, slug, title).Scan(&id)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Role{}, domain.ErrRoleNotFound
		}
		return domain.Role{}, fmt.Errorf("roles.UpdateTitle: %w", err)
	}
	return s.Get(ctx, slug)
}
