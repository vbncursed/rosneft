//go:build integration

package migrate_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/migrate"
)

// MeasurementPermissionsSuite pins 00017's seed: which system role holds which
// measurement grant is policy (spec M-2), and a typo in a slug list is a silent
// missing grant, not an error — only reading the tables back shows it.
type MeasurementPermissionsSuite struct{ pgSuite }

func TestMeasurementPermissionsSuite(t *testing.T) {
	suite.Run(t, new(MeasurementPermissionsSuite))
}

// grants lists "role permission" pairs for every measurement grant.
func (s *MeasurementPermissionsSuite) grants() []string { return s.grantsAt(s.T().Context()) }

func (s *MeasurementPermissionsSuite) grantsAt(ctx context.Context) []string {
	rows, err := s.pool.Query(ctx, `
		SELECT r.slug || ' ' || p.slug
		FROM role_permissions rp
		JOIN roles r       ON r.id = rp.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE p.slug LIKE 'measurement:%'
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

func (s *MeasurementPermissionsSuite) territoryWriteDescription() string {
	var d string
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT description FROM permissions WHERE slug = 'territory:write'`).Scan(&d))
	return d
}

func (s *MeasurementPermissionsSuite) TestSeedsTheGrantsPerRole() {
	assert.DeepEqual(s.T(), s.grants(), []string{
		"admin measurement:create",
		"admin measurement:delete",
		"admin measurement:read",
		"admin measurement:write",
		"editor measurement:create",
		"editor measurement:delete",
		"editor measurement:read",
		"editor measurement:write",
		"guest measurement:read",
		"owner measurement:read",
		"viewer measurement:read",
	})
}

func (s *MeasurementPermissionsSuite) TestTerritoryWriteNoLongerClaimsCreation() {
	assert.Equal(s.T(), s.territoryWriteDescription(), "update territories")
}

// Rolls back to 00016 (undoing everything after it, 00017 included); the
// cleanup rolls forward again even when an assertion
// fails, so the other tests never see the rolled-back state.
func (s *MeasurementPermissionsSuite) TestDownRemovesTheGrantsAndRestoresTheDescription() {
	ctx := s.T().Context()
	assert.NilError(s.T(), migrate.DownTo(ctx, s.dsn, 16))
	t := s.T()
	t.Cleanup(func() {
		// t.Context() is already cancelled when cleanups run.
		assert.NilError(t, migrate.Up(context.Background(), s.dsn))
		assert.Equal(t, len(s.grantsAt(context.Background())), 11)
	})

	assert.DeepEqual(s.T(), s.grants(), []string{})
	var perms int
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`SELECT count(*) FROM permissions WHERE slug LIKE 'measurement:%'`).Scan(&perms))
	assert.Equal(s.T(), perms, 0)
	assert.Equal(s.T(), s.territoryWriteDescription(), "create/update territories")
}
