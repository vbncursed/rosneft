package passkey_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"

	lib "github.com/go-webauthn/webauthn/webauthn"
	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey/mocks"
)

type LoginSuite struct {
	suite.Suite
	store *mocks.StoreMock
	cer   *mocks.CeremoniesMock
	eng   *mocks.EngineMock
	svc   *passkey.Service
	ctx   context.Context
}

func TestLoginSuite(t *testing.T) {
	suite.Run(t, new(LoginSuite))
}

func (s *LoginSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.store = mocks.NewStoreMock(mc)
	s.cer = mocks.NewCeremoniesMock(mc)
	s.eng = mocks.NewEngineMock(mc)
	s.svc = passkey.New(s.store, s.cer, s.eng)
	s.ctx = s.T().Context()
}

// resolveVia drives the discoverable handler with the given userHandle so the
// service resolves and returns that user id.
func (s *LoginSuite) resolveVia(userHandle string, cred *lib.Credential) {
	s.eng.FinishLoginMock.Set(
		func(handler lib.DiscoverableUserHandler, _ lib.SessionData, _ io.Reader) (*lib.Credential, error) {
			if _, err := handler([]byte("raw"), []byte(userHandle)); err != nil {
				return nil, err
			}
			return cred, nil
		},
	)
}

func (s *LoginSuite) TestFinishLoginValid() {
	s.cer.TakeMock.Return(ceremony.State{}, nil)
	s.store.ListByUserMock.Return([]domain.Credential{{CredentialID: []byte("c")}}, nil)
	s.store.UpdateAfterLoginMock.Return(nil)
	s.resolveVia("user-9", &lib.Credential{ID: []byte("c"), Authenticator: lib.Authenticator{SignCount: 5}})

	uid, err := s.svc.FinishLogin(s.ctx, "flow", "{}")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), uid, "user-9")
}

func (s *LoginSuite) TestFinishLoginCloneWarning() {
	// A clone-warning assertion must be rejected before the sign count is saved.
	s.cer.TakeMock.Return(ceremony.State{}, nil)
	s.store.ListByUserMock.Return([]domain.Credential{{CredentialID: []byte("c")}}, nil)
	s.resolveVia("user-9", &lib.Credential{ID: []byte("c"), Authenticator: lib.Authenticator{CloneWarning: true}})

	_, err := s.svc.FinishLogin(s.ctx, "flow", "{}")
	assert.ErrorIs(s.T(), err, domain.ErrAssertionInvalid)
}

func (s *LoginSuite) TestFinishLoginExpiredCeremony() {
	s.cer.TakeMock.Return(ceremony.State{}, domain.ErrCeremonyExpired)

	_, err := s.svc.FinishLogin(s.ctx, "flow", "{}")
	assert.ErrorIs(s.T(), err, domain.ErrCeremonyExpired)
}

// The real engine labels every library failure ErrAssertionInvalid, the
// handler's own store errors included (engine.go assertionInvalid). A database
// failure while loading the user's credentials is a server fault, not a bad
// assertion: it must come back as the store's error (a 5xx), never as a 401.
func (s *LoginSuite) TestFinishLoginStoreFailureIsNotAnInvalidAssertion() {
	errDB := errors.New("db down")
	s.cer.TakeMock.Return(ceremony.State{}, nil)
	s.store.ListByUserMock.Return(nil, errDB)
	s.eng.FinishLoginMock.Set(
		func(handler lib.DiscoverableUserHandler, _ lib.SessionData, _ io.Reader) (*lib.Credential, error) {
			_, err := handler([]byte("raw"), []byte("user-9"))
			return nil, fmt.Errorf("%w: %s", domain.ErrAssertionInvalid, err.Error())
		},
	)

	_, err := s.svc.FinishLogin(s.ctx, "flow", "{}")
	assert.ErrorIs(s.T(), err, errDB)
	assert.Assert(s.T(), !errors.Is(err, domain.ErrAssertionInvalid))
}

// No stored passkeys for the handle is a failed login, however the engine
// words it.
func (s *LoginSuite) TestFinishLoginNoCredentialsStaysAnInvalidAssertion() {
	s.cer.TakeMock.Return(ceremony.State{}, nil)
	s.store.ListByUserMock.Return(nil, nil)
	s.eng.FinishLoginMock.Set(
		func(handler lib.DiscoverableUserHandler, _ lib.SessionData, _ io.Reader) (*lib.Credential, error) {
			_, err := handler([]byte("raw"), []byte("user-9"))
			return nil, fmt.Errorf("%w: %s", domain.ErrAssertionInvalid, err.Error())
		},
	)

	_, err := s.svc.FinishLogin(s.ctx, "flow", "{}")
	assert.ErrorIs(s.T(), err, domain.ErrAssertionInvalid)
}
