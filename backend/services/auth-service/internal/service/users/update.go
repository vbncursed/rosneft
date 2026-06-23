package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Update replaces the user's roles when roleSlugs is non-nil. Email/username
// edits are out of v1 scope (reserved in the proto); this keeps the change
// minimal. ponytail: add field edits when a real need appears.
func (s *Service) Update(ctx context.Context, id string, roleSlugs []string, _, _ string) (domain.User, error) {
	if roleSlugs != nil {
		return s.store.SetRoles(ctx, id, roleSlugs)
	}
	return s.store.GetByID(ctx, id)
}
