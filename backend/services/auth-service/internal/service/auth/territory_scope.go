package auth

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// TerritoryScope is the territory-visibility key u's own session would carry —
// the owningAdmin ValidateToken computes — so an admin action can ask what
// signing in as u would open. It is not u.ID: a member sees its Company
// Owner's territories, and only a guest's key is its own id.
func (s *Service) TerritoryScope(ctx context.Context, u domain.User) (string, error) {
	resolvedAdmin, err := s.users.ResolveOwningAdmin(ctx, u.ID)
	if err != nil {
		return "", err
	}
	return scopeOwningAdmin(u.RoleSlugs, resolvedAdmin, u.ID), nil
}
