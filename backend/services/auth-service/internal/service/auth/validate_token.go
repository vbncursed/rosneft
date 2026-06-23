package auth

import "context"

// ValidateToken returns the user id + permission snapshot for a live session.
func (s *Service) ValidateToken(ctx context.Context, token string) (string, []string, error) {
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return "", nil, err
	}
	return sess.UserID, sess.Permissions, nil
}
