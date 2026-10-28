package twofa

import "context"

// Regenerate replaces the user's recovery codes after verifying a TOTP code.
func (s *Service) Regenerate(ctx context.Context, userID, code string) ([]string, error) {
	if err := s.confirmTOTP(ctx, userID, code); err != nil {
		return nil, err
	}
	return s.issueRecovery(ctx, userID)
}
