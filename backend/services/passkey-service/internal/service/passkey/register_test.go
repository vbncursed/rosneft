package passkey_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	lib "github.com/go-webauthn/webauthn/webauthn"
	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey/mocks"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

type RegistrationSuite struct {
	suite.Suite
	store *mocks.StoreMock
	cer   *mocks.CeremoniesMock
	eng   *mocks.EngineMock
	svc   *passkey.Service
	ctx   context.Context
}

func TestRegistrationSuite(t *testing.T) { suite.Run(t, new(RegistrationSuite)) }
func (s *RegistrationSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.store = mocks.NewStoreMock(mc)
	s.cer = mocks.NewCeremoniesMock(mc)
	s.eng = mocks.NewEngineMock(mc)
	s.svc = passkey.New(s.store, s.cer, s.eng)
	s.ctx = s.T().Context()
}

func (s *RegistrationSuite) TestBegin() {
	sess := lib.SessionData{Challenge: "challenge"}
	existing := []domain.Credential{{CredentialID: []byte("old")}}
	s.store.ListByUserMock.Expect(s.ctx, "alice").Return(existing, nil)
	s.eng.BeginRegistrationMock.Set(func(u *pkwa.User) (*protocol.CredentialCreation, *lib.SessionData, error) {
		assert.DeepEqual(s.T(), u.WebAuthnID(), []byte("alice"))
		assert.Equal(s.T(), u.WebAuthnName(), "Alice")
		assert.DeepEqual(s.T(), u.WebAuthnCredentials()[0].ID, []byte("old"))
		return &protocol.CredentialCreation{
			Response: protocol.PublicKeyCredentialCreationOptions{Challenge: []byte("challenge"), Timeout: 60000},
		}, &sess, nil
	})
	s.cer.PutMock.Expect(s.ctx, ceremony.State{UserID: "alice", Session: sess}).Return("flow", nil)
	options, flow, err := s.svc.BeginRegistration(s.ctx, "alice", "Alice")
	assert.NilError(s.T(), err)
	var decoded struct {
		PublicKey struct {
			Challenge string `json:"challenge"`
			Timeout   int    `json:"timeout"`
		} `json:"publicKey"`
	}
	assert.NilError(s.T(), json.Unmarshal([]byte(options), &decoded))
	assert.Equal(s.T(), decoded.PublicKey.Challenge, "Y2hhbGxlbmdl")
	assert.Equal(s.T(), decoded.PublicKey.Timeout, 60000)
	assert.Equal(s.T(), flow, "flow")
}

func (s *RegistrationSuite) TestBeginFailures() {
	for _, stage := range []string{"list", "engine", "put"} {
		s.Run(stage, func() {
			s.SetupTest()
			failure := errors.New(stage)
			if stage == "list" {
				s.store.ListByUserMock.Return(nil, failure)
			} else {
				s.store.ListByUserMock.Return(nil, nil)
			}
			if stage == "engine" {
				s.eng.BeginRegistrationMock.Return(nil, nil, failure)
			}
			if stage == "put" {
				s.eng.BeginRegistrationMock.Return(&protocol.CredentialCreation{}, &lib.SessionData{}, nil)
				s.cer.PutMock.Return("", failure)
			}
			options, flow, err := s.svc.BeginRegistration(s.ctx, "alice", "Alice")
			assert.ErrorIs(s.T(), err, failure)
			assert.Equal(s.T(), options, "")
			assert.Equal(s.T(), flow, "")
		})
	}
}

func (s *RegistrationSuite) TestBeginMarshalFailureLeavesStoredFlow() {
	s.store.ListByUserMock.Expect(s.ctx, "alice").Return(nil, nil)
	options := &protocol.CredentialCreation{Response: protocol.PublicKeyCredentialCreationOptions{
		Extensions: protocol.AuthenticationExtensions{Extra: map[string]any{"unsupported": func() {}}},
	}}
	session := lib.SessionData{Challenge: "challenge"}
	s.eng.BeginRegistrationMock.Return(options, &session, nil)
	s.cer.PutMock.Expect(s.ctx, ceremony.State{UserID: "alice", Session: session}).Return("flow", nil)
	result, flow, err := s.svc.BeginRegistration(s.ctx, "alice", "Alice")
	assert.Assert(s.T(), err != nil && strings.Contains(err.Error(), "passkey.BeginRegistration: marshal:"))
	assert.Equal(s.T(), result, "")
	assert.Equal(s.T(), flow, "")
	assert.Equal(s.T(), s.cer.PutAfterCounter(), uint64(1))
}

func (s *RegistrationSuite) TestFinishFailures() {
	for _, stage := range []string{"take", "foreign", "list", "engine", "save"} {
		s.Run(stage, func() {
			s.SetupTest()
			failure := errors.New(stage)
			state := ceremony.State{UserID: "alice", Session: lib.SessionData{Challenge: "challenge"}}
			if stage == "foreign" {
				state.UserID = "bob"
				failure = domain.ErrAssertionInvalid
			}
			if stage == "take" {
				s.cer.TakeMock.Expect(s.ctx, "flow").Return(ceremony.State{}, failure)
			} else {
				s.cer.TakeMock.Expect(s.ctx, "flow").Return(state, nil)
			}
			if stage == "list" {
				s.store.ListByUserMock.Return(nil, failure)
			}
			if stage == "engine" || stage == "save" {
				s.store.ListByUserMock.Return(nil, nil)
			}
			if stage == "engine" {
				s.eng.FinishRegistrationMock.Return(nil, failure)
			}
			if stage == "save" {
				s.eng.FinishRegistrationMock.Return(&lib.Credential{}, nil)
				s.store.CreateMock.Return(failure)
			}
			result, err := s.svc.FinishRegistration(s.ctx, "alice", "flow", "{}", "key")
			assert.ErrorIs(s.T(), err, failure)
			assert.DeepEqual(s.T(), result, domain.Credential{})
		})
	}
}

func (s *RegistrationSuite) TestFinishSuccessAndReplay() {
	state := ceremony.State{UserID: "alice", Session: lib.SessionData{Challenge: "challenge"}}
	taken := false
	s.cer.TakeMock.Set(func(ctx context.Context, flow string) (ceremony.State, error) {
		assert.Equal(s.T(), ctx, s.ctx)
		assert.Equal(s.T(), flow, "flow")
		if taken {
			return ceremony.State{}, domain.ErrCeremonyExpired
		}
		taken = true
		return state, nil
	})
	s.store.ListByUserMock.Expect(s.ctx, "alice").Return([]domain.Credential{{CredentialID: []byte("old")}}, nil)
	credential := &lib.Credential{
		ID:            []byte("id"),
		PublicKey:     []byte("key"),
		Transport:     []protocol.AuthenticatorTransport{"usb", "internal"},
		Authenticator: lib.Authenticator{AAGUID: []byte("aaguid"), SignCount: 42},
		Flags:         lib.CredentialFlags{BackupEligible: true, BackupState: false},
	}
	s.eng.FinishRegistrationMock.Set(
		func(u *pkwa.User, session lib.SessionData, body io.Reader) (*lib.Credential, error) {
			assert.DeepEqual(s.T(), u.WebAuthnID(), []byte("alice"))
			assert.Equal(s.T(), u.WebAuthnName(), "Laptop")
			assert.DeepEqual(s.T(), u.WebAuthnCredentials()[0].ID, []byte("old"))
			assert.DeepEqual(s.T(), session, state.Session)
			data, err := io.ReadAll(body)
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), string(data), `{"response":true}`)
			return credential, nil
		},
	)
	var saved domain.Credential
	s.store.CreateMock.Set(func(ctx context.Context, c domain.Credential) error {
		assert.Equal(s.T(), ctx, s.ctx)
		saved = c
		return nil
	})
	before := time.Now().UTC()
	result, err := s.svc.FinishRegistration(s.ctx, "alice", "flow", `{"response":true}`, "Laptop")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), result, saved)
	assert.DeepEqual(s.T(), result.CredentialID, credential.ID)
	assert.DeepEqual(s.T(), result.PublicKey, credential.PublicKey)
	assert.DeepEqual(s.T(), result.AAGUID, credential.Authenticator.AAGUID)
	assert.Equal(s.T(), result.SignCount, uint32(42))
	assert.DeepEqual(s.T(), result.Transports, []string{"usb", "internal"})
	assert.Assert(s.T(), result.BackupEligible)
	assert.Assert(s.T(), !result.BackupState)
	assert.Equal(s.T(), result.UserID, "alice")
	assert.Equal(s.T(), result.Name, "Laptop")
	assert.Assert(s.T(), !result.CreatedAt.Before(before) && !result.CreatedAt.After(time.Now().UTC()))
	_, err = s.svc.FinishRegistration(s.ctx, "alice", "flow", `{}`, "Laptop")
	assert.ErrorIs(s.T(), err, domain.ErrCeremonyExpired)
	assert.Equal(s.T(), s.eng.FinishRegistrationAfterCounter(), uint64(1))
	assert.Equal(s.T(), s.store.CreateAfterCounter(), uint64(1))
}
