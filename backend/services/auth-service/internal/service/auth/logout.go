package auth

import "context"

// Logout deletes the session token.
func (s *Service) Logout(ctx context.Context, token string) error {
	return s.sessions.Delete(ctx, token)
}
