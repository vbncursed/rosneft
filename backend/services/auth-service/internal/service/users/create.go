package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// Create validates input, hashes the password, and inserts the user, recording
// the actor as its creator (created_by).
func (s *Service) Create(ctx context.Context, actorID, email, username, plain string, roleSlugs []string) (domain.User, error) {
	if err := validate.Username(username); err != nil {
		return domain.User{}, err
	}
	if err := validate.Email(email); err != nil {
		return domain.User{}, err
	}
	if err := validate.Password(plain); err != nil {
		return domain.User{}, err
	}
	hash, err := password.Hash(plain)
	if err != nil {
		return domain.User{}, fmt.Errorf("users.Create: hash: %w", err)
	}
	owner := actorID
	return s.store.Create(ctx, domain.User{
		Email: email, Username: username, PasswordHash: hash,
		RoleSlugs: roleSlugs, CreatedBy: &owner,
	})
}
