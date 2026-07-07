package passkey

import (
	"context"
	"io"
	"testing"

	"github.com/go-webauthn/webauthn/protocol"
	lib "github.com/go-webauthn/webauthn/webauthn"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

type fakeStore struct {
	creds   []domain.Credential
	updated uint32
}

func (f *fakeStore) Create(context.Context, domain.Credential) error { return nil }
func (f *fakeStore) ListByUser(context.Context, string) ([]domain.Credential, error) {
	return f.creds, nil
}
func (f *fakeStore) GetByCredentialID(context.Context, []byte) (domain.Credential, error) {
	return domain.Credential{}, nil
}
func (f *fakeStore) DeleteByCredentialID(context.Context, string, []byte) error { return nil }
func (f *fakeStore) UpdateSignCount(_ context.Context, _ []byte, c uint32) error {
	f.updated = c
	return nil
}

type fakeCeremonies struct {
	state ceremony.State
	err   error
}

func (f *fakeCeremonies) Put(context.Context, ceremony.State) (string, error) { return "flow", nil }
func (f *fakeCeremonies) Take(context.Context, string) (ceremony.State, error) {
	return f.state, f.err
}

type fakeEngine struct {
	cred       *lib.Credential
	err        error
	handleUser []byte // userHandle fed to the discoverable handler
}

func (f *fakeEngine) BeginRegistration(*pkwa.User) (*protocol.CredentialCreation, *lib.SessionData, error) {
	return &protocol.CredentialCreation{}, &lib.SessionData{}, nil
}
func (f *fakeEngine) FinishRegistration(*pkwa.User, lib.SessionData, io.Reader) (*lib.Credential, error) {
	return f.cred, f.err
}
func (f *fakeEngine) BeginLogin() (*protocol.CredentialAssertion, *lib.SessionData, error) {
	return &protocol.CredentialAssertion{}, &lib.SessionData{}, nil
}
func (f *fakeEngine) FinishLogin(h lib.DiscoverableUserHandler, _ lib.SessionData, _ io.Reader) (*lib.Credential, error) {
	if f.err != nil {
		return nil, f.err
	}
	if _, err := h([]byte("raw"), f.handleUser); err != nil {
		return nil, err
	}
	return f.cred, nil
}

func TestFinishLogin_Valid(t *testing.T) {
	store := &fakeStore{creds: []domain.Credential{{CredentialID: []byte("c")}}}
	eng := &fakeEngine{
		cred:       &lib.Credential{ID: []byte("c"), Authenticator: lib.Authenticator{SignCount: 5}},
		handleUser: []byte("user-9"),
	}
	svc := New(store, &fakeCeremonies{}, eng)

	uid, err := svc.FinishLogin(context.Background(), "flow", "{}")
	assert.NilError(t, err)
	assert.Equal(t, uid, "user-9")
	assert.Equal(t, store.updated, uint32(5))
}

func TestFinishLogin_CloneWarning(t *testing.T) {
	eng := &fakeEngine{
		cred:       &lib.Credential{ID: []byte("c"), Authenticator: lib.Authenticator{CloneWarning: true}},
		handleUser: []byte("user-9"),
	}
	svc := New(&fakeStore{creds: []domain.Credential{{CredentialID: []byte("c")}}}, &fakeCeremonies{}, eng)

	_, err := svc.FinishLogin(context.Background(), "flow", "{}")
	assert.Assert(t, cmp.ErrorIs(err, domain.ErrAssertionInvalid))
}

func TestFinishLogin_ExpiredCeremony(t *testing.T) {
	svc := New(&fakeStore{}, &fakeCeremonies{err: domain.ErrCeremonyExpired}, &fakeEngine{})

	_, err := svc.FinishLogin(context.Background(), "flow", "{}")
	assert.Assert(t, cmp.ErrorIs(err, domain.ErrCeremonyExpired))
}

func TestFinishLogin_NoCredentials(t *testing.T) {
	eng := &fakeEngine{handleUser: []byte("user-9")} // handler returns ErrNoCredentials, engine surfaces it
	svc := New(&fakeStore{creds: nil}, &fakeCeremonies{}, eng)

	_, err := svc.FinishLogin(context.Background(), "flow", "{}")
	assert.Assert(t, cmp.ErrorIs(err, domain.ErrNoCredentials))
}
