package webauthn

import (
	"fmt"
	"io"

	"github.com/go-webauthn/webauthn/protocol"
	lib "github.com/go-webauthn/webauthn/webauthn"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// Engine wraps a configured *webauthn.WebAuthn.
type Engine struct{ w *lib.WebAuthn }

// NewEngine builds the WebAuthn relying party from RP config.
func NewEngine(rpID, rpName string, origins []string) (*Engine, error) {
	w, err := lib.New(&lib.Config{
		RPID:          rpID,
		RPDisplayName: rpName,
		RPOrigins:     origins,
	})
	if err != nil {
		return nil, fmt.Errorf("webauthn.NewEngine: %w", err)
	}
	return &Engine{w: w}, nil
}

// BeginRegistration returns creation options + the session data to stash. It
// forces resident (discoverable) keys and REQUIRES user verification: passkey
// login skips the TOTP step, so the passkey must itself be a real second factor
// (device + biometric/PIN), not possession alone.
func (e *Engine) BeginRegistration(u *User) (*protocol.CredentialCreation, *lib.SessionData, error) {
	sel := protocol.AuthenticatorSelection{
		ResidentKey:      protocol.ResidentKeyRequirementRequired,
		UserVerification: protocol.VerificationRequired,
	}
	return e.w.BeginRegistration(u, lib.WithAuthenticatorSelection(sel))
}

// FinishRegistration parses the browser response and verifies it, returning the
// new credential to persist.
func (e *Engine) FinishRegistration(u *User, sess lib.SessionData, body io.Reader) (*lib.Credential, error) {
	parsed, err := protocol.ParseCredentialCreationResponseBody(body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrAssertionInvalid, err)
	}
	cred, err := e.w.CreateCredential(u, sess, parsed)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrAssertionInvalid, err)
	}
	return cred, nil
}

// BeginLogin returns discoverable (usernameless) assertion options + session.
// It REQUIRES user verification so the assertion proves device + biometric/PIN
// (a genuine second factor) — passkey login mints a session without a TOTP step.
func (e *Engine) BeginLogin() (*protocol.CredentialAssertion, *lib.SessionData, error) {
	return e.w.BeginDiscoverableLogin(lib.WithUserVerification(protocol.VerificationRequired))
}

// FinishLogin verifies the assertion. handler maps (rawID,userHandle)→User by
// loading that user's stored credentials. Returns the matched credential.
func (e *Engine) FinishLogin(handler lib.DiscoverableUserHandler, sess lib.SessionData, body io.Reader) (*lib.Credential, error) {
	parsed, err := protocol.ParseCredentialRequestResponseBody(body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrAssertionInvalid, err)
	}
	cred, err := e.w.ValidateDiscoverableLogin(handler, sess, parsed)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrAssertionInvalid, err)
	}
	return cred, nil
}
