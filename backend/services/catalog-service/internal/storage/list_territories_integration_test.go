//go:build integration

package storage_test

import "gotest.tools/v3/assert"

func (s *BatchSuite) TestListTerritoriesRespectsAdminScope() {
	ctx := s.T().Context()
	admin := "44444444-4444-4444-4444-444444444444"
	other := "55555555-5555-5555-5555-555555555555"
	s.seedTerritory(ctx, "scope-a", admin)
	s.seedTerritory(ctx, "scope-b", other)
	s.seedTerritory(ctx, "scope-c", admin, other)
	for _, withArtifacts := range []bool{false, true} {
		got, err := s.pg.ListTerritories(ctx, admin, withArtifacts)
		assert.NilError(s.T(), err)
		slugs := make([]string, len(got))
		for i, territory := range got {
			slugs[i] = territory.Slug
		}
		assert.DeepEqual(s.T(), slugs, []string{"scope-a", "scope-c"})
	}
	got, err := s.pg.ListTerritories(ctx, "33333333-3333-3333-3333-333333333333", true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}
