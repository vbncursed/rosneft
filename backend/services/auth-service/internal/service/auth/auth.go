// Package auth implements login, 2FA verification, logout, and token
// validation over the Postgres user store and the Redis session store.
package auth

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

//go:generate minimock -i UserStore,SessionStore,TwoFAVerifier,PasskeyVerifier -o ./mocks -s _mock.go

// UserStore is the subset of the users store this service needs.
type UserStore interface {
	GetByIdentifier(ctx context.Context, identifier string) (domain.User, error)
	GetByID(ctx context.Context, id string) (domain.User, error)
	ResolveOwningAdmin(ctx context.Context, userID string) (string, error)
}

// SessionStore is the Redis-backed session contract.
type SessionStore interface {
	Create(ctx context.Context, sess domain.Session) (string, error)
	Get(ctx context.Context, token string) (domain.Session, error)
	Delete(ctx context.Context, token string) error
	PutPending(ctx context.Context, userID string) (string, error)
	TakePending(ctx context.Context, challenge string) (string, error)
	RegisterFail(ctx context.Context, identifier string) error
	IsLocked(ctx context.Context, identifier string) (bool, error)
	ClearFails(ctx context.Context, identifier string) error
}

// TwoFAVerifier delegates 2FA checks to twofa-service.
type TwoFAVerifier interface {
	IsEnabled(ctx context.Context, userID string) (bool, error)
	Verify(ctx context.Context, userID, code string) (bool, error)
}

// PasskeyVerifier delegates passwordless WebAuthn assertion checks to
// passkey-service. FinishLogin returns a verified user id, not a session.
type PasskeyVerifier interface {
	BeginLogin(ctx context.Context) (optionsJSON, flowID string, err error)
	FinishLogin(ctx context.Context, flowID, assertionJSON string) (userID string, err error)
}

// Service is the auth/login service.
type Service struct {
	users       UserStore
	sessions    SessionStore
	twofa       TwoFAVerifier
	passkey     PasskeyVerifier
	absoluteTTL time.Duration
	authz       *authzCache
}

// New constructs the auth Service.
func New(users UserStore, sessions SessionStore, twofa TwoFAVerifier, passkey PasskeyVerifier, absoluteTTL time.Duration) *Service {
	return &Service{
		users:       users,
		sessions:    sessions,
		twofa:       twofa,
		passkey:     passkey,
		absoluteTTL: absoluteTTL,
		authz:       newAuthzCache(authzCacheTTL),
	}
}
