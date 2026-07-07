package passkey

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	lib "github.com/go-webauthn/webauthn/webauthn"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

// BeginLogin builds usernameless assertion options and stashes the challenge.
func (s *Service) BeginLogin(ctx context.Context) (string, string, error) {
	opts, sess, err := s.engine.BeginLogin()
	if err != nil {
		return "", "", err
	}
	flowID, err := s.ceremonies.Put(ctx, ceremony.State{Session: *sess})
	if err != nil {
		return "", "", err
	}
	buf, err := json.Marshal(opts)
	if err != nil {
		return "", "", fmt.Errorf("passkey.BeginLogin: marshal: %w", err)
	}
	return string(buf), flowID, nil
}

// FinishLogin verifies the assertion against the stored public key and returns
// the verified user id. A cloned-authenticator signal (sign-count regression)
// rejects the login.
func (s *Service) FinishLogin(ctx context.Context, flowID, assertionJSON string) (string, error) {
	st, err := s.ceremonies.Take(ctx, flowID)
	if err != nil {
		return "", err
	}
	var resolvedUserID string
	handler := func(_, userHandle []byte) (lib.User, error) {
		// userHandle is the resident credential's user id (we stored the raw
		// auth user id at registration).
		userID := string(userHandle)
		creds, err := s.store.ListByUser(ctx, userID)
		if err != nil {
			return nil, err
		}
		if len(creds) == 0 {
			return nil, domain.ErrNoCredentials
		}
		resolvedUserID = userID
		return pkwa.NewUser(userID, userID, creds), nil
	}
	cred, err := s.engine.FinishLogin(handler, st.Session, strings.NewReader(assertionJSON))
	if err != nil {
		return "", err
	}
	if cred.Authenticator.CloneWarning {
		return "", domain.ErrAssertionInvalid
	}
	if err := s.store.UpdateSignCount(ctx, cred.ID, cred.Authenticator.SignCount); err != nil {
		return "", err
	}
	return resolvedUserID, nil
}
