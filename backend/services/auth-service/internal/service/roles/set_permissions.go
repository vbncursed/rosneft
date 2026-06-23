package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetPermissions replaces a role's permission set.
func (s *Service) SetPermissions(ctx context.Context, slug string, permSlugs []string) (domain.Role, error) {
	if slug == "" {
		return domain.Role{}, fmt.Errorf("roles.SetPermissions: %w: empty slug", domain.ErrInvalidInput)
	}
	return s.store.SetPermissions(ctx, slug, permSlugs)
}
