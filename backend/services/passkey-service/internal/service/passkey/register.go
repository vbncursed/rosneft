package passkey

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

// BeginRegistration builds creation options for the authenticated user and
// stashes the challenge under a new flow id.
func (s *Service) BeginRegistration(ctx context.Context, userID, displayName string) (string, string, error) {
	existing, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return "", "", err
	}
	u := pkwa.NewUser(userID, displayName, existing)
	opts, sess, err := s.engine.BeginRegistration(u)
	if err != nil {
		return "", "", err
	}
	flowID, err := s.ceremonies.Put(ctx, ceremony.State{Session: *sess, UserID: userID})
	if err != nil {
		return "", "", err
	}
	buf, err := json.Marshal(opts)
	if err != nil {
		return "", "", fmt.Errorf("passkey.BeginRegistration: marshal: %w", err)
	}
	return string(buf), flowID, nil
}

// FinishRegistration verifies the attestation and persists the credential.
func (s *Service) FinishRegistration(ctx context.Context, userID, flowID, credentialJSON, name string) (domain.Credential, error) {
	st, err := s.ceremonies.Take(ctx, flowID)
	if err != nil {
		return domain.Credential{}, err
	}
	if st.UserID != userID {
		return domain.Credential{}, domain.ErrAssertionInvalid
	}
	existing, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return domain.Credential{}, err
	}
	u := pkwa.NewUser(userID, name, existing)
	cred, err := s.engine.FinishRegistration(u, st.Session, strings.NewReader(credentialJSON))
	if err != nil {
		return domain.Credential{}, err
	}
	transports := make([]string, 0, len(cred.Transport))
	for _, t := range cred.Transport {
		transports = append(transports, string(t))
	}
	dc := domain.Credential{
		UserID:         userID,
		CredentialID:   cred.ID,
		PublicKey:      cred.PublicKey,
		SignCount:      cred.Authenticator.SignCount,
		AAGUID:         cred.Authenticator.AAGUID,
		Transports:     transports,
		BackupEligible: cred.Flags.BackupEligible,
		BackupState:    cred.Flags.BackupState,
		Name:           name,
		// The DB stamps created_at via DEFAULT now(); mirror it here so the
		// response shows the real date before the client re-fetches the list.
		CreatedAt: time.Now().UTC(),
	}
	if err := s.store.Create(ctx, dc); err != nil {
		return domain.Credential{}, err
	}
	return dc, nil
}
