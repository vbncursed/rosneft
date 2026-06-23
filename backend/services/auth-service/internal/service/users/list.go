package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns users filtered by status and deletion visibility.
func (s *Service) List(ctx context.Context, status string, includeDeleted bool) ([]domain.User, error) {
	return s.store.List(ctx, status, includeDeleted)
}
