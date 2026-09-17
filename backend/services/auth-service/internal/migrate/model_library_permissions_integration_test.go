//go:build integration

package migrate_test

import (
	"context"
	"slices"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/migrate"
)

// ModelLibraryPermissionsSuite pins 00018 (spec H-3): the model library is
// shared by every tenant, so only Root — through the owner bypass, not a role
// grant — may change it. A Company Owner holding model:delete could remove a
// model other companies use.
type ModelLibraryPermissionsSuite struct{ pgSuite }

func TestModelLibraryPermissionsSuite(t *testing.T) {
	suite.Run(t, new(ModelLibraryPermissionsSuite))
}

// grants lists "role permission" pairs of system roles for model grants.
func (s *ModelLibraryPermissionsSuite) grants(ctx context.Context) []string {
	return s.modelGrants(ctx, `r.is_system`)
}

// modelGrants lists "role permission" model-grant pairs of the roles matching
// roleFilter, a constant SQL predicate over r.
func (s *ModelLibraryPermissionsSuite) modelGrants(ctx context.Context, roleFilter string) []string {
	rows, err := s.pool.Query(ctx, `
		SELECT r.slug || ' ' || p.slug
		FROM role_permissions rp
		JOIN roles r       ON r.id = rp.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE p.slug LIKE 'model:%' AND `+roleFilter+`
		ORDER BY 1`)
	assert.NilError(s.T(), err)
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var pair string
		assert.NilError(s.T(), rows.Scan(&pair))
		out = append(out, pair)
	}
	assert.NilError(s.T(), rows.Err())
	return out
}

// Every system role still reads the library; none changes it.
func (s *ModelLibraryPermissionsSuite) TestSystemRolesOnlyReadTheLibrary() {
	assert.DeepEqual(s.T(), s.grants(s.T().Context()), []string{
		"admin model:read",
		"editor model:read",
		"guest model:read",
		"owner model:read",
		"viewer model:read",
	})
}

func (s *ModelLibraryPermissionsSuite) TestDownGivesTheCompanyOwnerDeleteBack() {
	ctx := s.T().Context()
	assert.NilError(s.T(), migrate.DownTo(ctx, s.dsn, 17))
	t := s.T()
	t.Cleanup(func() {
		// t.Context() is already cancelled when cleanups run.
		assert.NilError(t, migrate.Up(context.Background(), s.dsn))
	})

	assert.Assert(s.T(), slices.Contains(s.grants(ctx), "admin model:delete"))
}

// A Company Owner could hand model:delete to a custom role while they still
// held it. Such a role would keep the power 00018 takes from them, so tenant
// roles lose it too; a role Root made (no owner_admin_id) keeps what Root gave.
func (s *ModelLibraryPermissionsSuite) TestTenantRolesLoseTheGrantsRootRolesKeepThem() {
	ctx := s.T().Context()
	assert.NilError(s.T(), migrate.DownTo(ctx, s.dsn, 17))
	t := s.T()
	t.Cleanup(func() {
		bg := context.Background()
		assert.NilError(t, migrate.Up(bg, s.dsn))
		_, err := s.pool.Exec(bg, `DELETE FROM roles WHERE slug IN ('janitor', 'curator')`)
		assert.NilError(t, err)
		_, err = s.pool.Exec(bg, `DELETE FROM users WHERE username = 'tenant-owner'`)
		assert.NilError(t, err)
	})
	_, err := s.pool.Exec(ctx, `
		WITH owner AS (
			INSERT INTO users (email, username, password_hash)
			VALUES ('tenant@example.com', 'tenant-owner', 'x') RETURNING id
		), made AS (
			INSERT INTO roles (slug, title, owner_admin_id)
			SELECT 'janitor', 'Janitor', id FROM owner
			UNION ALL SELECT 'curator', 'Curator', NULL
			RETURNING id
		)
		INSERT INTO role_permissions (role_id, permission_id)
		SELECT made.id, p.id FROM made
		JOIN permissions p ON p.slug IN ('model:read', 'model:write', 'model:delete')`)
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), migrate.Up(ctx, s.dsn))

	got := s.modelGrants(ctx, `r.slug IN ('janitor', 'curator')`)
	assert.DeepEqual(s.T(), got, []string{
		"curator model:delete",
		"curator model:read",
		"curator model:write",
		"janitor model:read",
	})
}
