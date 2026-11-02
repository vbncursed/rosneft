//go:build integration

package migrate_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/migrate"
)

// ZonePermissionSuite pins 00020's seed: which system role holds zone:write is
// policy (spec §8), and a typo in a slug list is a silent missing grant, not an
// error — only reading the tables back shows it.
type ZonePermissionSuite struct{ pgSuite }

func TestZonePermissionSuite(t *testing.T) {
	suite.Run(t, new(ZonePermissionSuite))
}

// grants lists "role permission" pairs for zone:write.
func (s *ZonePermissionSuite) grants() []string { return s.grantsAt(s.T().Context()) }

func (s *ZonePermissionSuite) grantsAt(ctx context.Context) []string {
	rows, err := s.pool.Query(ctx, `
		SELECT r.slug || ' ' || p.slug
		FROM role_permissions rp
		JOIN roles r       ON r.id = rp.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE p.slug = 'zone:write'
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

func (s *ZonePermissionSuite) TestZoneWriteHeldByAdminAndEditorOnly() {
	assert.DeepEqual(s.T(), s.grants(), []string{
		"admin zone:write",
		"editor zone:write",
	})

	var d string
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT description FROM permissions WHERE slug = 'zone:write'`).Scan(&d))
	assert.Equal(s.T(), d, "create, change and delete site zones and calibrate site plans")
}

// Rolls back to 00019 (undoing 00020 only); the cleanup rolls forward again
// even when an assertion fails, so the other tests never see the rolled-back
// state.
func (s *ZonePermissionSuite) TestDownRemovesZoneWrite() {
	ctx := s.T().Context()
	assert.NilError(s.T(), migrate.DownTo(ctx, s.dsn, 19))
	t := s.T()
	t.Cleanup(func() {
		// t.Context() is already cancelled when cleanups run.
		assert.NilError(t, migrate.Up(context.Background(), s.dsn))
		assert.Equal(t, len(s.grantsAt(context.Background())), 2)
	})

	assert.DeepEqual(s.T(), s.grants(), []string{})
	var perms int
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`SELECT count(*) FROM permissions WHERE slug = 'zone:write'`).Scan(&perms))
	assert.Equal(s.T(), perms, 0)
}
