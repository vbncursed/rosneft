package auth

import "context"

// ValidateToken authenticates a token against its live Redis session, then
// re-reads authorization (permissions, owner flag, territory scope) from the
// database. Reading live — rather than from a login-time snapshot — means role
// changes take effect on the next request without forcing a re-login.
//
// ponytail: ~3 auth-DB queries per call (the gateway calls this per request);
// add a short-TTL per-user cache if validate throughput ever climbs.
func (s *Service) ValidateToken(ctx context.Context, token string) (string, []string, bool, string, error) {
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return "", nil, false, "", err
	}
	u, err := s.users.GetByID(ctx, sess.UserID)
	if err != nil {
		return "", nil, false, "", err
	}
	resolvedAdmin, err := s.users.ResolveOwningAdmin(ctx, u.ID)
	if err != nil {
		return "", nil, false, "", err
	}
	return u.ID, u.Permissions, u.IsOwner, scopeOwningAdmin(u.RoleSlugs, resolvedAdmin, u.ID), nil
}
