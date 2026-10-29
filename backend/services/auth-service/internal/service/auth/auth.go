// Package auth implements login, 2FA verification, logout, and token
// validation over the Postgres user store and the Redis session store.
package auth

import (
	"context"
	"sync"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
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
	// PutPending records the user's password epoch in the challenge so a
	// password change between the two login steps can refuse it.
	PutPending(ctx context.Context, userID string, epoch int64) (string, error)
	// TakePending returns the user and the epoch recorded at PutPending; epoch
	// 0 is a challenge issued before epochs were recorded (unchecked).
	TakePending(ctx context.Context, challenge string) (userID string, epoch int64, err error)
	// TakeAttempt reserves one login attempt; false means the budget is spent.
	TakeAttempt(ctx context.Context, identifier string) (bool, error)
	// RefundAttempt gives back an attempt that was not a guess (the request
	// failed for a reason other than a wrong password).
	RefundAttempt(ctx context.Context, identifier string) error
	ClearFails(ctx context.Context, identifier string) error
	// The change-password budget, keyed by user id. VerifyPassword (the
	// step-up factor) draws on the same budget, so a stolen session cannot
	// guess the password through step-up at the general API rate.
	TakeChangePasswordAttempt(ctx context.Context, userID string) (bool, error)
	RefundChangePasswordAttempt(ctx context.Context, userID string) error
	ClearChangePasswordFails(ctx context.Context, userID string) error
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
	// verify is password.Verify; a field so tests can count verifications
	// instead of timing them.
	verify func(plain, encoded string) (bool, error)
	// dummyHash is a hash under the current argon2id parameters, derived on
	// first use, that Login verifies against for an unknown identifier so that
	// path costs what a wrong password costs.
	dummyHash func() string
}

// New constructs the auth Service.
func New(
	users UserStore,
	sessions SessionStore,
	twofa TwoFAVerifier,
	passkey PasskeyVerifier,
	absoluteTTL time.Duration,
) *Service {
	return &Service{
		users:       users,
		sessions:    sessions,
		twofa:       twofa,
		passkey:     passkey,
		absoluteTTL: absoluteTTL,
		authz:       newAuthzCache(authzCacheTTL),
		verify:      password.Verify,
		dummyHash:   sync.OnceValue(newDummyHash),
	}
}

// newDummyHash derives from password.Hash, never a literal, so it follows the
// parameters when they change. A failure (no entropy) yields "": the verify of
// it then fails fast, which only loses the timing parity, not safety.
func newDummyHash() string {
	h, err := password.Hash("timing-parity-dummy")
	if err != nil {
		return ""
	}
	return h
}
