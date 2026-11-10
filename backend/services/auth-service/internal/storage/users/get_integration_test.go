//go:build integration

package users_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *CreateSuite) TestGetByIdentifier() {
	u, err := s.create("Identity.Mixed@example.com", "Identity.Mixed")
	assert.NilError(s.T(), err)
	for _, tc := range []struct{ name, identifier string }{
		{"email", "Identity.Mixed@example.com"},
		{"username", "Identity.Mixed"},
		{"email case fold", "identity.mixed@EXAMPLE.COM"},
		{"username case fold", "identity.mixed"},
	} {
		s.Run(tc.name, func() {
			got, err := s.store.GetByIdentifier(s.T().Context(), tc.identifier)
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), got.ID, u.ID)
			assert.Equal(s.T(), got.Email, u.Email)
			assert.Equal(s.T(), got.Username, u.Username)
		})
	}
	s.Run("unknown", func() {
		got, err := s.store.GetByIdentifier(s.T().Context(), "identity-missing")
		assert.ErrorIs(s.T(), err, domain.ErrUserNotFound)
		assert.DeepEqual(s.T(), got, domain.User{})
	})
}
