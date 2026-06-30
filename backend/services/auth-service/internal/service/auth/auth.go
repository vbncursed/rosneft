// Package auth implements login, 2FA verification, logout, and token
// validation over the Postgres user store and the Redis session store.
package auth

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

//go:generate minimock -i UserStore,SessionStore,RecoveryStore,Decryptor -o ./mocks -s _mock.go

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

// RecoveryStore lets 2FA accept one-time recovery codes.
type RecoveryStore interface {
	List(ctx context.Context, userID string) (ids, hashes []string, err error)
	MarkUsed(ctx context.Context, id string) error
}

// Decryptor decrypts the stored TOTP secret (satisfied by *secret.Cipher).
type Decryptor interface {
	Decrypt(ct []byte) ([]byte, error)
}

// Service is the auth/login service.
type Service struct {
	users       UserStore
	sessions    SessionStore
	recovery    RecoveryStore
	cipher      Decryptor
	absoluteTTL time.Duration
	authz       *authzCache
}

// New constructs the auth Service.
func New(users UserStore, sessions SessionStore, recovery RecoveryStore, cipher Decryptor, absoluteTTL time.Duration) *Service {
	return &Service{
		users:       users,
		sessions:    sessions,
		recovery:    recovery,
		cipher:      cipher,
		absoluteTTL: absoluteTTL,
		authz:       newAuthzCache(authzCacheTTL),
	}
}
