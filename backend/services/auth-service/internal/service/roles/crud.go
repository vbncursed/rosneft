package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns the roles visible to the caller's group (allAccess = Root).
func (s *Service) List(ctx context.Context, scopeAdminID string, allAccess bool) ([]domain.Role, error) {
	return s.store.List(ctx, scopeAdminID, allAccess)
}

// Create makes a new role stamped with the creator's group (ownerAdminID; empty
// for Root = global).
func (s *Service) Create(ctx context.Context, actorID, ownerAdminID, slug, title string, permSlugs []string) (domain.Role, error) {
	if title == "" {
		return domain.Role{}, fmt.Errorf("roles.Create: %w: title required", domain.ErrInvalidInput)
	}
	if err := s.assertCanGrant(ctx, actorID, permSlugs); err != nil {
		return domain.Role{}, err
	}
	if slug == "" {
		return s.createWithDerivedSlug(ctx, ownerAdminID, title, permSlugs)
	}
	return s.store.Create(ctx, domain.Role{Slug: slug, Title: title, PermissionSlugs: permSlugs, OwnerAdminID: ownerAdminID})
}

// Update renames a role and, when u.ReplacePermissions is set, replaces its
// grants in the same store transaction. Grants are checked as SetPermissions
// checks them: a non-owner cannot hand out what it lacks.
func (s *Service) Update(ctx context.Context, actorID string, u domain.RoleUpdate, scopeAdminID string, allAccess bool) (domain.Role, error) {
	if u.Slug == "" || u.Title == "" {
		return domain.Role{}, fmt.Errorf("roles.Update: %w: slug and title required", domain.ErrInvalidInput)
	}
	if u.ReplacePermissions {
		if err := s.assertCanGrant(ctx, actorID, u.PermissionSlugs); err != nil {
			return domain.Role{}, err
		}
	}
	return s.store.Update(ctx, u, scopeAdminID, allAccess)
}

func (s *Service) Delete(ctx context.Context, slug, scopeAdminID string, allAccess bool) error {
	if slug == "" {
		return fmt.Errorf("roles.Delete: %w: empty slug", domain.ErrInvalidInput)
	}
	return s.store.Delete(ctx, slug, scopeAdminID, allAccess)
}
