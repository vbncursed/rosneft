// Package webauthn adapts github.com/go-webauthn/webauthn to passkey-service's
// domain types.
package webauthn

import (
	"github.com/go-webauthn/webauthn/protocol"
	lib "github.com/go-webauthn/webauthn/webauthn"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// User is the go-webauthn User implementation. WebAuthnID is the user handle
// stored in the resident credential — we use the raw auth user id bytes so
// discoverable login can recover the user from the assertion's userHandle.
type User struct {
	id    string
	name  string // username/display shown in the authenticator picker
	creds []lib.Credential
}

// NewUser builds a User from the auth user id, a display name, and stored creds.
func NewUser(id, name string, stored []domain.Credential) *User {
	u := &User{id: id, name: name}
	for _, c := range stored {
		u.creds = append(u.creds, toLib(c))
	}
	return u
}

func (u *User) WebAuthnID() []byte                    { return []byte(u.id) }
func (u *User) WebAuthnName() string                  { return u.name }
func (u *User) WebAuthnDisplayName() string           { return u.name }
func (u *User) WebAuthnCredentials() []lib.Credential { return u.creds }

func toLib(c domain.Credential) lib.Credential {
	transports := make([]protocol.AuthenticatorTransport, 0, len(c.Transports))
	for _, t := range c.Transports {
		transports = append(transports, protocol.AuthenticatorTransport(t))
	}
	return lib.Credential{
		ID:        c.CredentialID,
		PublicKey: c.PublicKey,
		Transport: transports,
		Flags: lib.CredentialFlags{
			BackupEligible: c.BackupEligible,
			BackupState:    c.BackupState,
		},
		Authenticator: lib.Authenticator{
			AAGUID:    c.AAGUID,
			SignCount: c.SignCount,
		},
	}
}
