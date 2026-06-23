package roles

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// ListPermissions returns the permission catalog.
func (s *Service) ListPermissions(ctx context.Context) ([]domain.Permission, error) {
	return s.perms.List(ctx)
}
