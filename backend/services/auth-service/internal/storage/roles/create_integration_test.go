//go:build integration

package roles_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create is all or nothing: an unknown permission must not leave an empty role
// holding the slug (which would answer the retry with ErrRoleSlugTaken).
func (s *UpdateSuite) TestCreateWithAnUnknownPermissionLeavesNoRole() {
	ctx := s.T().Context()

	_, err := s.store.Create(ctx, domain.Role{
		Slug: "half-made", Title: "Half made", PermissionSlugs: []string{"territory:read", "no:such"},
	})
	assert.ErrorIs(s.T(), err, domain.ErrPermissionUnknown)

	_, err = s.store.Get(ctx, "half-made")
	assert.ErrorIs(s.T(), err, domain.ErrRoleNotFound)

	got, err := s.store.Create(ctx, domain.Role{
		Slug: "half-made", Title: "Half made", PermissionSlugs: []string{"territory:read"},
	})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.PermissionSlugs, []string{"territory:read"})
}
