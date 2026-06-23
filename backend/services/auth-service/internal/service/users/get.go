package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Get returns a single user by id.
func (s *Service) Get(ctx context.Context, id string) (domain.User, error) {
	if id == "" {
		return domain.User{}, fmt.Errorf("users.Get: %w: empty id", domain.ErrInvalidInput)
	}
	return s.store.GetByID(ctx, id)
}
