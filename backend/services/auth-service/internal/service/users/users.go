// Package users implements admin user management with self/last-admin guards.
package users

import (
	"context"
	"slices"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

//go:generate minimock -i Store,Sessions -o ./mocks -s _mock.go

// Store is the persistence contract.
type Store interface {
	Create(ctx context.Context, u domain.User) (domain.User, error)
	GetByID(ctx context.Context, id string) (domain.User, error)
	List(ctx context.Context, status string, includeDeleted bool, ownerID string) ([]domain.User, error)
	SetStatus(ctx context.Context, id, status string, deletedAt *time.Time) (domain.User, error)
	SetRoles(ctx context.Context, id string, roleSlugs []string) (domain.User, error)
	SetOwner(ctx context.Context, id string, isOwner bool) (domain.User, error)
	PermissionsForRoles(ctx context.Context, roleSlugs []string) ([]string, error)
	ChangePassword(ctx context.Context, id, hash string) error
	CountAdmins(ctx context.Context, excludeUserID string) (int, error)
	MarkTourSeen(ctx context.Context, id, tour string) error
}

// Sessions lets status changes evict live sessions.
type Sessions interface {
	DeleteUser(ctx context.Context, userID string) error
}

// Service is the user-admin service.
type Service struct {
	store    Store
	sessions Sessions
}

// New constructs the user service.
func New(store Store, sessions Sessions) *Service {
	return &Service{store: store, sessions: sessions}
}

// guard enforces the self-target, owner-only-manages-admins, and last-admin
// invariants shared by freeze and soft-delete.
func (s *Service) guard(ctx context.Context, actorID, id string) error {
	if actorID == id {
		return domain.ErrSelfTarget
	}
	target, err := s.store.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if isAdmin(target) {
		// Only the owner may delete/freeze an admin account. (The owner is
		// itself an admin, so this also makes the owner untouchable: a
		// non-owner is rejected here, and the owner hits the self-target guard.)
		actor, err := s.store.GetByID(ctx, actorID)
		if err != nil {
			return err
		}
		if !actor.IsOwner {
			return domain.ErrAdminOwnerOnly
		}
		n, err := s.store.CountAdmins(ctx, id)
		if err != nil {
			return err
		}
		if n == 0 {
			return domain.ErrLastAdmin
		}
	}
	return nil
}

func isAdmin(u domain.User) bool {
	return slices.Contains(u.RoleSlugs, "admin")
}

// ownership returns the target user after enforcing the owner scope: an actor
// without users:read_all may only touch users they created.
func (s *Service) ownership(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	u, err := s.store.GetByID(ctx, id)
	if err != nil {
		return domain.User{}, err
	}
	if !scopeAll && (u.CreatedBy == nil || *u.CreatedBy != actorID) {
		return domain.User{}, domain.ErrUserNotFound
	}
	return u, nil
}
