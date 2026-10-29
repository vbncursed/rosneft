package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create inserts a non-system role with the given permission slugs, stamped
// with the creating group's owner_admin_id (empty = global, for Root).
//
// One audittx.Run transaction holds the role and its grants, so an unknown
// permission rolls the role back instead of leaving an empty one holding the
// slug, and the audit triggers attribute both writes to the creator.
func (s *Store) Create(ctx context.Context, r domain.Role) (domain.Role, error) {
	const q = `INSERT INTO roles (slug, title, is_system, owner_admin_id)
		VALUES ($1, $2, FALSE, NULLIF($3, '')::uuid) RETURNING id`

	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var id string
		if err := tx.QueryRow(ctx, q, r.Slug, r.Title, r.OwnerAdminID).Scan(&id); err != nil {
			return err
		}
		return writePermissions(ctx, tx, id, r.PermissionSlugs)
	})
	if err != nil {
		if isUnique(err) {
			return domain.Role{}, domain.ErrRoleSlugTaken
		}
		if errors.Is(err, domain.ErrPermissionUnknown) {
			return domain.Role{}, err
		}
		return domain.Role{}, fmt.Errorf("roles.Create: %w", err)
	}
	return s.Get(ctx, r.Slug)
}
