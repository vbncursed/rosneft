//go:build integration

package roles_test

import (
	"context"

	"gotest.tools/v3/assert"
)

func (s *UpdateSuite) TestResolveLabels() {
	ctx := s.T().Context()
	var roleID, fallbackID, permissionID string
	err := s.pool.QueryRow(ctx, `INSERT INTO roles (slug, title) VALUES ('label-title', 'Human title') RETURNING id`).
		Scan(&roleID)
	assert.NilError(s.T(), err)
	err = s.pool.QueryRow(ctx, `INSERT INTO roles (slug, title) VALUES ('label-fallback', '') RETURNING id`).
		Scan(&fallbackID)
	assert.NilError(s.T(), err)
	err = s.pool.QueryRow(ctx, `SELECT id FROM permissions WHERE slug = 'territory:read'`).Scan(&permissionID)
	assert.NilError(s.T(), err)
	s.Run("resolves known IDs and ignores unknown values", func() {
		got, err := s.store.ResolveLabels(ctx, map[string][]string{
			"role":       {roleID, fallbackID, "00000000-0000-0000-0000-000000000000", "not-a-uuid"},
			"permission": {permissionID}, "other": {roleID},
		})
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), got, map[string]string{
			"role:" + roleID: "Human title", "role:" + fallbackID: "label-fallback",
			"permission:" + permissionID: "territory:read",
		})
	})
	s.Run("empty input", func() {
		got, err := s.store.ResolveLabels(ctx, nil)
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), got, map[string]string{})
	})
	s.Run("cancelled query returns an error", func() {
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		_, err := s.store.ResolveLabels(cancelled, map[string][]string{"role": {roleID}})
		assert.ErrorIs(s.T(), err, context.Canceled)
	})
}
