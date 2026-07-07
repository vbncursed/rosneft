package webauthn

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

func TestNewUser_MapsIDAndCredentials(t *testing.T) {
	u := NewUser("user-123", "alice", []domain.Credential{
		{CredentialID: []byte{1, 2, 3}, PublicKey: []byte{9}, SignCount: 7, Transports: []string{"internal"}},
	})

	assert.Equal(t, string(u.WebAuthnID()), "user-123")
	assert.Equal(t, u.WebAuthnName(), "alice")
	assert.Equal(t, u.WebAuthnDisplayName(), "alice")

	creds := u.WebAuthnCredentials()
	assert.Equal(t, len(creds), 1)
	assert.Equal(t, creds[0].Authenticator.SignCount, uint32(7))
	assert.Equal(t, string(creds[0].Transport[0]), "internal")
}
