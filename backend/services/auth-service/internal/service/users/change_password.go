package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// ChangePassword verifies the old password then stores the new hash.
func (s *Service) ChangePassword(ctx context.Context, userID, oldPlain, newPlain string) error {
	if err := validate.Password(newPlain); err != nil {
		return err
	}
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	ok, err := password.Verify(oldPlain, u.PasswordHash)
	if err != nil {
		return fmt.Errorf("users.ChangePassword: verify: %w", err)
	}
	if !ok {
		return domain.ErrInvalidCredential
	}
	hash, err := password.Hash(newPlain)
	if err != nil {
		return fmt.Errorf("users.ChangePassword: hash: %w", err)
	}
	return s.store.ChangePassword(ctx, userID, hash)
}
