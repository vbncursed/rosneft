// Package twofa owns TOTP enrollment, verification, and recovery codes.
package twofa

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
)

//go:generate minimock -i Store,Recovery,Cipher,RateLimiter -o ./mocks -s _mock.go

type Store interface {
	Get(ctx context.Context, userID string) (domain.Credential, error)
	Set(ctx context.Context, userID string, enabled bool, secret []byte) error
}

type Recovery interface {
	Replace(ctx context.Context, userID string, hashes []string) error
	List(ctx context.Context, userID string) (ids, hashes []string, err error)
	MarkUsed(ctx context.Context, id string) error
	DeleteAll(ctx context.Context, userID string) error
}

type Cipher interface {
	Encrypt(plain []byte) ([]byte, error)
	Decrypt(ct []byte) ([]byte, error)
}

// RateLimiter throttles the login Verify step per user.
type RateLimiter interface {
	IsLocked(ctx context.Context, userID string) (bool, error)
	RegisterFail(ctx context.Context, userID string) error
	Clear(ctx context.Context, userID string) error
}

// Service enrolls, verifies, and disables 2FA for users.
type Service struct {
	store    Store
	recovery Recovery
	cipher   Cipher
	limiter  RateLimiter
	issuer   string
}

// New constructs the 2FA service.
func New(store Store, recovery Recovery, cipher Cipher, limiter RateLimiter, issuer string) *Service {
	return &Service{store: store, recovery: recovery, cipher: cipher, limiter: limiter, issuer: issuer}
}

const recoveryCodeCount = 10
