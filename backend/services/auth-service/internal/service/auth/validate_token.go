package auth

import "context"

// ValidateToken returns the user id, permission snapshot, and owner flag for a
// live session. is_owner is the root-of-trust bit the gateway turns into a
// blanket route bypass.
func (s *Service) ValidateToken(ctx context.Context, token string) (string, []string, bool, error) {
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return "", nil, false, err
	}
	return sess.UserID, sess.Permissions, sess.IsOwner, nil
}
