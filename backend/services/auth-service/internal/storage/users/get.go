package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type rowScanner interface{ Scan(dst ...any) error }

func scanUser(r rowScanner) (domain.User, error) {
	var u domain.User
	err := r.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.Status,
		&u.CreatedAt, &u.UpdatedAt, &u.DeletedAt, &u.CreatedBy, &u.IsOwner)
	return u, err
}

// GetByID returns one user with roles + permissions hydrated.
func (s *Store) GetByID(ctx context.Context, id string) (domain.User, error) {
	const q = `SELECT ` + userColumns + ` FROM users u WHERE u.id = $1`
	u, err := scanUser(s.pool.QueryRow(ctx, q, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.GetByID: %w", err)
	}
	return s.hydrate(ctx, u)
}

// GetByIdentifier matches email OR username (citext = case-insensitive).
func (s *Store) GetByIdentifier(ctx context.Context, identifier string) (domain.User, error) {
	const q = `SELECT ` + userColumns + ` FROM users u WHERE u.email = $1 OR u.username = $1`
	u, err := scanUser(s.pool.QueryRow(ctx, q, identifier))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, fmt.Errorf("users.GetByIdentifier: %w", err)
	}
	return s.hydrate(ctx, u)
}

func (s *Store) hydrate(ctx context.Context, u domain.User) (domain.User, error) {
	roles, err := s.roleSlugs(ctx, u.ID)
	if err != nil {
		return domain.User{}, err
	}
	perms, err := s.Permissions(ctx, u.ID)
	if err != nil {
		return domain.User{}, err
	}
	u.RoleSlugs, u.Permissions = roles, perms
	return u, nil
}
