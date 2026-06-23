package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create inserts the user and binds the given role slugs in one transaction.
func (s *Store) Create(ctx context.Context, u domain.User) (domain.User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("users.Create: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	const ins = `INSERT INTO users (email, username, password_hash, status)
		VALUES ($1, $2, $3, 'active') RETURNING id`
	var id string
	if err := tx.QueryRow(ctx, ins, u.Email, u.Username, u.PasswordHash).Scan(&id); err != nil {
		switch constraintOf(err) {
		case "users_email_key":
			return domain.User{}, domain.ErrEmailTaken
		case "users_username_key":
			return domain.User{}, domain.ErrUsernameTaken
		}
		return domain.User{}, fmt.Errorf("users.Create: insert: %w", err)
	}
	if err := bindRoles(ctx, tx, id, u.RoleSlugs); err != nil {
		return domain.User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.User{}, fmt.Errorf("users.Create: commit: %w", err)
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
