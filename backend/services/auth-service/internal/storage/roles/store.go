// Package roles is the PostgreSQL store for roles and their permission bindings.
package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Get returns one role with its permission slugs.
func (s *Store) Get(ctx context.Context, slug string) (domain.Role, error) {
	const q = `SELECT slug, title, is_system, COALESCE(owner_admin_id::text, '') FROM roles WHERE slug = $1`
	var r domain.Role
	if err := s.pool.QueryRow(ctx, q, slug).Scan(&r.Slug, &r.Title, &r.IsSystem, &r.OwnerAdminID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Role{}, domain.ErrRoleNotFound
		}
		return domain.Role{}, fmt.Errorf("roles.Get: %w", err)
	}
	perms, err := s.permSlugs(ctx, slug)
	if err != nil {
		return domain.Role{}, err
	}
	r.PermissionSlugs = perms
	return r, nil
}

func (s *Store) permSlugs(ctx context.Context, slug string) ([]string, error) {
	const q = `SELECT p.slug FROM role_permissions rp
		JOIN roles r ON r.id = rp.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE r.slug = $1 ORDER BY p.slug`
	rows, err := s.pool.Query(ctx, q, slug)
	if err != nil {
		return nil, fmt.Errorf("roles.permSlugs: %w", err)
	}
	defer rows.Close()
	out := make([]string, 0, 8)
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, fmt.Errorf("roles.permSlugs: scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func isUnique(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == "23505"
}
