// Package roles implements role CRUD and permission assignment.
package roles

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

//go:generate minimock -i Store,Perms -o ./mocks -s _mock.go

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

type Service struct {
	store Store
	perms Perms
}

func New(store Store, perms Perms) *Service { return &Service{store: store, perms: perms} }
