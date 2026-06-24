package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Get returns a single user by id, enforcing the owner scope.
func (s *Service) Get(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	if id == "" {
		return domain.User{}, fmt.Errorf("users.Get: %w: empty id", domain.ErrInvalidInput)
	}
	return s.ownership(ctx, actorID, scopeAll, id)
}
