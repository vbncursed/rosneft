package auth

import "context"

// ValidateToken returns the user id, permission snapshot, owner flag, and owning
// admin id for a live session. All four ride on the Redis session, so this is a
// single GET with no re-query.
func (s *Service) ValidateToken(ctx context.Context, token string) (string, []string, bool, string, error) {
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return "", nil, false, "", err
	}
	return sess.UserID, sess.Permissions, sess.IsOwner, sess.OwningAdminID, nil
}
