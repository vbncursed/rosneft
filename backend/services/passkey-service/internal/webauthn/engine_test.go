package webauthn

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"testing"

	lib "github.com/go-webauthn/webauthn/webauthn"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

// assertionBody is a well-formed login assertion, so the library gets as far
// as calling the user handler.
func assertionBody() string {
	clientData := `{"type":"webauthn.get","challenge":"c","origin":"https://example.test"}`
	return fmt.Sprintf(
		`{"id":%q,"rawId":%q,"type":"public-key","response":{"clientDataJSON":%q,"authenticatorData":%q,"signature":%q,"userHandle":%q}}`,
		b64([]byte("cred")), b64([]byte("cred")), b64([]byte(clientData)),
		b64(make([]byte, 37)), b64([]byte("sig")), b64([]byte("user")))
}

// The gRPC mapper checks ErrNotFound before ErrAssertionInvalid, so a store
// error that surfaces through the library must not leak into the chain: it
// would turn Unauthenticated into NotFound.
func TestEngine_FinishLogin_HandlerErrorStaysAssertionInvalid(t *testing.T) {
	e, err := NewEngine("example.test", "Test", []string{"https://example.test"})
	assert.NilError(t, err)
	_, sess, err := e.BeginLogin()
	assert.NilError(t, err)

	called := false
	handler := func(_, _ []byte) (lib.User, error) {
		called = true
		return nil, domain.ErrNotFound
	}
	_, err = e.FinishLogin(handler, *sess, strings.NewReader(assertionBody()))

	assert.Assert(t, called, "the library never reached the handler: %v", err)
	assert.Assert(t, errors.Is(err, domain.ErrAssertionInvalid))
	assert.Assert(t, !errors.Is(err, domain.ErrNotFound), "library chain leaked: %v", err)
}

func TestEngine_FinishRegistration_BadBodyIsAssertionInvalid(t *testing.T) {
	e, err := NewEngine("example.test", "Test", []string{"https://example.test"})
	assert.NilError(t, err)

	_, err = e.FinishRegistration(NewUser("u", "u", nil), lib.SessionData{}, strings.NewReader("{"))

	assert.Assert(t, errors.Is(err, domain.ErrAssertionInvalid))
}
