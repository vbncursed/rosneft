//go:build integration

package roles_test

import (
	"errors"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *UpdateSuite) TestListVisibilityAndPermissions() {
	ctx := s.T().Context()
	var owner, foreign string
	err := s.pool.QueryRow(ctx, `INSERT INTO users (email, username, password_hash)
 VALUES ('list-owner@x', 'list-owner', 'h') RETURNING id`).Scan(&owner)
	assert.NilError(s.T(), err)
	err = s.pool.QueryRow(ctx, `INSERT INTO users (email, username, password_hash)
 VALUES ('list-foreign@x', 'list-foreign', 'h') RETURNING id`).Scan(&foreign)
	assert.NilError(s.T(), err)

	baseline, err := s.store.List(ctx, "", false)
	assert.NilError(s.T(), err)
	global := domain.Role{Slug: "list-global", Title: "Global", PermissionSlugs: []string{"territory:read"}}
	own := domain.Role{
		Slug: "list-own", Title: "Own", OwnerAdminID: owner,
		PermissionSlugs: []string{"territory:write", "territory:read"},
	}
	other := domain.Role{Slug: "list-other", Title: "Other", OwnerAdminID: foreign}
	for _, role := range []domain.Role{global, own, other} {
		_, err = s.store.Create(ctx, role)
		assert.NilError(s.T(), err)
	}
	own.PermissionSlugs = []string{"territory:read", "territory:write"}
	other.PermissionSlugs = []string{}
	expected := func(extra ...domain.Role) []domain.Role {
		result := append(slices.Clone(baseline), extra...)
		slices.SortFunc(result, func(a, b domain.Role) int { return strings.Compare(a.Slug, b.Slug) })
		return result
	}
	s.Run("root sees all", func() {
		got, err := s.store.List(ctx, "", true)
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), got, expected(global, own, other))
	})
	s.Run("tenant sees global and own", func() {
		got, err := s.store.List(ctx, owner, false)
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), got, expected(global, own))
	})
	s.Run("invalid scope is a PostgreSQL UUID error", func() {
		_, err := s.store.List(ctx, "not-a-uuid", false)
		pgErr, ok := errors.AsType[*pgconn.PgError](err)
		assert.Assert(s.T(), ok)
		assert.Equal(s.T(), pgErr.Code, "22P02")
	})
}
