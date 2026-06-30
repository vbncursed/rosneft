package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *Service) List(ctx context.Context) ([]domain.Role, error) { return s.store.List(ctx) }

func (s *Service) Create(ctx context.Context, actorID, slug, title string, permSlugs []string) (domain.Role, error) {
	if title == "" {
		return domain.Role{}, fmt.Errorf("roles.Create: %w: title required", domain.ErrInvalidInput)
	}
	if err := s.assertCanGrant(ctx, actorID, permSlugs); err != nil {
		return domain.Role{}, err
	}
	if slug == "" {
		return s.createWithDerivedSlug(ctx, title, permSlugs)
	}
	return s.store.Create(ctx, domain.Role{Slug: slug, Title: title, PermissionSlugs: permSlugs})
}

func (s *Service) UpdateTitle(ctx context.Context, slug, title string) (domain.Role, error) {
	if slug == "" || title == "" {
		return domain.Role{}, fmt.Errorf("roles.UpdateTitle: %w: slug and title required", domain.ErrInvalidInput)
	}
	return s.store.UpdateTitle(ctx, slug, title)
}

func (s *Service) Delete(ctx context.Context, slug string) error {
	if slug == "" {
		return fmt.Errorf("roles.Delete: %w: empty slug", domain.ErrInvalidInput)
	}
	return s.store.Delete(ctx, slug)
}
