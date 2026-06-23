// Package twofa enables/disables TOTP for a user and issues recovery codes.
package twofa

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

//go:generate minimock -i Store,Recovery,Cipher -o ./mocks -s _mock.go

type Store interface {
	GetByID(ctx context.Context, id string) (domain.User, error)
	SetTOTP(ctx context.Context, id string, enabled bool, secret []byte) error
}

type Recovery interface {
	Replace(ctx context.Context, userID string, hashes []string) error
	DeleteAll(ctx context.Context, userID string) error
}

type Cipher interface {
	Encrypt(plain []byte) ([]byte, error)
	Decrypt(ct []byte) ([]byte, error)
}

type Service struct {
	store    Store
	recovery Recovery
	cipher   Cipher
	issuer   string
}

func New(store Store, recovery Recovery, cipher Cipher, issuer string) *Service {
	return &Service{store: store, recovery: recovery, cipher: cipher, issuer: issuer}
}
