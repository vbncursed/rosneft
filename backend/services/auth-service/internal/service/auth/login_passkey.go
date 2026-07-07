package auth

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// PasskeyLoginBegin proxies discoverable-login options from passkey-service.
func (s *Service) PasskeyLoginBegin(ctx context.Context) (string, string, error) {
	return s.passkey.BeginLogin(ctx)
}

// PasskeyLoginFinish verifies the assertion via passkey-service, then — because
// passkey-service only attests the assertion, not account status — re-checks the
// user's status before minting a session. Passkey user verification is already
// MFA, so no TOTP step is required.
func (s *Service) PasskeyLoginFinish(ctx context.Context, flowID, assertionJSON string) (string, error) {
	if flowID == "" || assertionJSON == "" {
		return "", fmt.Errorf("auth.PasskeyLoginFinish: %w: flow and assertion required", domain.ErrInvalidInput)
	}
	userID, err := s.passkey.FinishLogin(ctx, flowID, assertionJSON)
	if err != nil {
		return "", err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", err
	}
	switch u.Status {
	case domain.StatusFrozen:
		return "", domain.ErrAccountFrozen
	case domain.StatusDeleted:
		return "", domain.ErrAccountDeleted
	}
	return s.issue(ctx, u)
}
