package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create inserts the user and binds the given role slugs in one transaction.
//
// audittx.Run supplies that transaction and publishes the actor, so the audit
// triggers on users and user_roles attribute both writes to whoever created the
// account. The old manual Begin is replaced rather than wrapped: a nested pgx
// transaction is a savepoint, which would scope the actor's SET LOCAL wrong.
func (s *Store) Create(ctx context.Context, u domain.User) (domain.User, error) {
	const ins = `INSERT INTO users (email, username, password_hash, status, created_by, is_owner)
		VALUES ($1, $2, $3, 'active', $4, $5) RETURNING id`

	var id string
	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, ins, u.Email, u.Username, u.PasswordHash, u.CreatedBy, u.IsOwner).
			Scan(&id); err != nil {
			return createError(err)
		}
		return bindRoles(ctx, tx, id, u.RoleSlugs)
	})
	if err != nil {
		return domain.User{}, err
	}
	return s.GetByID(ctx, id)
}

// createError maps a refused insert: either login constraint is the one
// neutral ErrLoginTaken, which does not say which of the two is taken.
func createError(err error) error {
	switch constraintOf(err) {
	case "users_email_key", "users_username_key":
		return domain.ErrLoginTaken
	}
	return fmt.Errorf("users.Create: insert: %w", err)
}

// bindRoles resolves role slugs to ids and inserts user_roles rows. A slug the
// user's tenant cannot see (a custom role of another company) or that does not
// exist → ErrRoleNotFound (fails closed). The tenant is the user's owning admin,
// as for roles.List; Root (empty owning admin) sees every role.
func bindRoles(ctx context.Context, tx pgx.Tx, userID string, slugs []string) error {
	if len(slugs) == 0 {
		return nil
	}
	tenant, err := resolveOwningAdmin(ctx, tx, userID)
	if err != nil {
		return err
	}
	for _, slug := range slugs {
		var roleID string
		if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE slug = $1
			AND (owner_admin_id IS NULL OR $2::text = '' OR owner_admin_id = NULLIF($2, '')::uuid)`,
			slug, tenant).Scan(&roleID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.ErrRoleNotFound
			}
			return fmt.Errorf("users.bindRoles: lookup %q: %w", slug, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
			userID, roleID); err != nil {
			return fmt.Errorf("users.bindRoles: insert: %w", err)
		}
	}
	return nil
}
