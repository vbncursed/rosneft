package twofa

import "context"

// Disable verifies a current code then clears the secret and recovery codes.
func (s *Service) Disable(ctx context.Context, userID, code string) error {
	if err := s.confirmTOTP(ctx, userID, code); err != nil {
		return err
	}
	if err := s.store.Set(ctx, userID, false, nil); err != nil {
		return err
	}
	return s.recovery.DeleteAll(ctx, userID)
}
