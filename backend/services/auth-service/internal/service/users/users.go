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
	List(
		ctx context.Context,
		status string,
		includeDeleted bool,
		ownerID, hidePrivilegedExcept string,
	) ([]domain.User, error)
	SetStatus(ctx context.Context, id, status string, deletedAt *time.Time) (domain.User, error)
	SetRoles(ctx context.Context, id string, roleSlugs []string) (domain.User, error)
	SetOwner(ctx context.Context, id string, isOwner bool) (domain.User, error)
	SetTOTPRequired(ctx context.Context, id string, required bool) (domain.User, error)
	PermissionsForRoles(ctx context.Context, roleSlugs []string) ([]string, error)
	// ChangePassword stores the hash and stamps password_changed_at = changedAt.
	ChangePassword(ctx context.Context, id, hash string, changedAt time.Time) error
	CountAdmins(ctx context.Context, excludeUserID string) (int, error)
	MarkTourSeen(ctx context.Context, id, tour string) error
	ResolveLogins(ctx context.Context, ids []string) (map[string]string, error)
}

// Sessions lets status changes evict live sessions and lets ChangePassword
// throttle repeated failed attempts, mirroring Login's TakeAttempt/
// ClearFails but under their own dedicated Redis key namespace
// (changepw_fail:<userID>, not login_fail:<identifier>) — reusing Login's
// methods would key the counter off a value derived from userID that Login's
// wholly-unvalidated identifier could be crafted to reproduce. See
// session.changePasswordFailKey and session/store_test.go.
type Sessions interface {
	DeleteUser(ctx context.Context, userID string) error
	// DeleteUserExcept signs the user out everywhere but keepToken. It is
	// cleanup: the password epoch is what refuses the older sessions.
	DeleteUserExcept(ctx context.Context, userID, keepToken string) error
	// SetPasswordEpoch moves a live session to a password epoch.
	SetPasswordEpoch(ctx context.Context, token string, epoch int64) error
	// TakeChangePasswordAttempt reserves one attempt; false means the budget is spent.
	TakeChangePasswordAttempt(ctx context.Context, userID string) (bool, error)
	// RefundChangePasswordAttempt gives back an attempt that was not a guess.
	RefundChangePasswordAttempt(ctx context.Context, userID string) error
	ClearChangePasswordFails(ctx context.Context, userID string) error
}

// Service is the user-admin service.
type Service struct {
	store    Store
	sessions Sessions
	// onPasswordChange drops the auth service's cached snapshot of the user, so
	// the new password epoch is enforced at once rather than after the cache TTL.
	onPasswordChange func(userID string)
}

// New constructs the user service.
func New(store Store, sessions Sessions) *Service {
	return &Service{store: store, sessions: sessions}
}

// OnPasswordChange registers the hook called once a password has been stored.
func (s *Service) OnPasswordChange(f func(userID string)) { s.onPasswordChange = f }

func (s *Service) passwordChanged(userID string) {
	if s.onPasswordChange != nil {
		s.onPasswordChange(userID)
	}
}

// nextChangeTime is the password_changed_at for a change made now: strictly
// after the user's current epoch, so epochs grow even if a clock steps back.
func nextChangeTime(u domain.User, now time.Time) time.Time {
	at := now.UTC().Truncate(time.Microsecond)
	if prev := u.PasswordEpoch(); at.UnixMicro() <= prev {
		at = time.UnixMicro(prev + 1).UTC()
	}
	return at
}

// guard enforces the self-target and last-admin invariants shared by freeze
// and soft-delete. Who may reach an admin at all is ownership()'s call.
func (s *Service) guard(ctx context.Context, actorID string, target domain.User) error {
	if actorID == target.ID {
		return domain.ErrSelfTarget
	}
	if !isAdmin(target) {
		return nil
	}
	n, err := s.store.CountAdmins(ctx, target.ID)
	if err != nil {
		return err
	}
	if n == 0 {
		return domain.ErrLastAdmin
	}
	return nil
}

func isAdmin(u domain.User) bool {
	return slices.Contains(u.RoleSlugs, domain.RoleAdmin)
}

// ownership returns the target user after enforcing the owner scope: an actor
// without users:read_all may only touch users they created, or themselves —
// a Company Owner's own account is created by Root, so CreatedBy alone would
// hide the owner from their own account.
//
// On top of that, only Root sees Root and Company Owners (the admin slug) other
// than itself, whatever scopeAll says. Out-of-reach reads as missing, never as
// forbidden: a 403 would confirm the account exists.
func (s *Service) ownership(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	u, err := s.store.GetByID(ctx, id)
	if err != nil {
		return domain.User{}, err
	}
	if !scopeAll && u.ID != actorID && (u.CreatedBy == nil || *u.CreatedBy != actorID) {
		return domain.User{}, domain.ErrUserNotFound
	}
	if u.ID == actorID || !isPrivileged(u) {
		return u, nil
	}
	actor, err := s.store.GetByID(ctx, actorID)
	if err != nil {
		return domain.User{}, err
	}
	if !actor.IsOwner {
		return domain.User{}, domain.ErrUserNotFound
	}
	return u, nil
}

// isPrivileged reports whether u is Root or a Company Owner. Root is marked by
// is_owner, not necessarily by the admin slug, so both are checked.
func isPrivileged(u domain.User) bool {
	return u.IsOwner || isAdmin(u)
}
