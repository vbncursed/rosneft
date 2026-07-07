// Package passkey owns WebAuthn registration, discoverable login, and
// credential management. It never mints sessions.
package passkey

import (
	"context"
	"io"

	"github.com/go-webauthn/webauthn/protocol"
	lib "github.com/go-webauthn/webauthn/webauthn"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

//go:generate minimock -i Store,Ceremonies,Engine -o ./mocks -s _mock.go

// Store is the credential persistence contract.
type Store interface {
	Create(ctx context.Context, c domain.Credential) error
	ListByUser(ctx context.Context, userID string) ([]domain.Credential, error)
	DeleteByCredentialID(ctx context.Context, userID string, credID []byte) error
	UpdateSignCount(ctx context.Context, credID []byte, count uint32) error
}

// Ceremonies stashes in-flight ceremony state.
type Ceremonies interface {
	Put(ctx context.Context, st ceremony.State) (string, error)
	Take(ctx context.Context, flowID string) (ceremony.State, error)
}

// Engine is the WebAuthn crypto boundary.
type Engine interface {
	BeginRegistration(u *pkwa.User) (*protocol.CredentialCreation, *lib.SessionData, error)
	FinishRegistration(u *pkwa.User, sess lib.SessionData, body io.Reader) (*lib.Credential, error)
	BeginLogin() (*protocol.CredentialAssertion, *lib.SessionData, error)
	FinishLogin(handler lib.DiscoverableUserHandler, sess lib.SessionData, body io.Reader) (*lib.Credential, error)
}

// Service ties the store, ceremonies, and engine together.
type Service struct {
	store      Store
	ceremonies Ceremonies
	engine     Engine
}

// New constructs the passkey service.
func New(store Store, ceremonies Ceremonies, engine Engine) *Service {
	return &Service{store: store, ceremonies: ceremonies, engine: engine}
}
