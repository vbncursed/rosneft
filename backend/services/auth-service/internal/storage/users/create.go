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
		if err := tx.QueryRow(ctx, ins, u.Email, u.Username, u.PasswordHash, u.CreatedBy, u.IsOwner).Scan(&id); err != nil {
			switch constraintOf(err) {
			case "users_email_key":
				return domain.ErrEmailTaken
			case "users_username_key":
				return domain.ErrUsernameTaken
			}
			return fmt.Errorf("users.Create: insert: %w", err)
		}
		return bindRoles(ctx, tx, id, u.RoleSlugs)
	})
	if err != nil {
		return domain.User{}, err
	}
	return s.GetByID(ctx, id)
}

// bindRoles resolves role slugs to ids and inserts user_roles rows. Unknown
// slug → ErrRoleNotFound (fails closed).
func bindRoles(ctx context.Context, tx pgx.Tx, userID string, slugs []string) error {
	for _, slug := range slugs {
		var roleID string
		if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE slug = $1`, slug).Scan(&roleID); err != nil {
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
