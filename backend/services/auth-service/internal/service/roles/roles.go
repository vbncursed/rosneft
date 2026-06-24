// Package roles implements role CRUD and permission assignment.
package roles

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

//go:generate minimock -i Store,Perms,Actors -o ./mocks -s _mock.go

type Store interface {
	List(ctx context.Context) ([]domain.Role, error)
	Create(ctx context.Context, r domain.Role) (domain.Role, error)
	UpdateTitle(ctx context.Context, slug, title string) (domain.Role, error)
	Delete(ctx context.Context, slug string) error
	SetPermissions(ctx context.Context, slug string, permSlugs []string) (domain.Role, error)
}

type Perms interface {
	List(ctx context.Context) ([]domain.Permission, error)
}

// Actors resolves the acting user so grants can be checked against its own
// permissions (no-privilege-escalation).
type Actors interface {
	GetByID(ctx context.Context, id string) (domain.User, error)
}

type Service struct {
	store  Store
	perms  Perms
	actors Actors
}

func New(store Store, perms Perms, actors Actors) *Service {
	return &Service{store: store, perms: perms, actors: actors}
}

// assertCanGrant blocks a non-owner from putting permissions it does not hold
// onto a role.
func (s *Service) assertCanGrant(ctx context.Context, actorID string, permSlugs []string) error {
	actor, err := s.actors.GetByID(ctx, actorID)
	if err != nil {
		return err
	}
	return domain.AssertGrantable(actor.Permissions, permSlugs, actor.IsOwner)
}
