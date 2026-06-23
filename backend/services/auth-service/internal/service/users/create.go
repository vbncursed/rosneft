package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

// Create validates input, hashes the password, and inserts the user.
func (s *Service) Create(ctx context.Context, email, username, plain string, roleSlugs []string) (domain.User, error) {
	if email == "" || username == "" || plain == "" {
		return domain.User{}, fmt.Errorf("users.Create: %w: email, username, password required", domain.ErrInvalidInput)
	}
	hash, err := password.Hash(plain)
	if err != nil {
		return domain.User{}, fmt.Errorf("users.Create: hash: %w", err)
	}
	return s.store.Create(ctx, domain.User{Email: email, Username: username, PasswordHash: hash, RoleSlugs: roleSlugs})
}
