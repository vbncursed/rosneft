package auth

import "context"

// ValidateToken authenticates a token against its live Redis session, then
// returns the caller's authorization (permissions, owner flag, territory scope).
// Liveness is always re-checked against Redis (so logout/expiry are instant),
// but the DB hydration is memoized per user for authzCacheTTL — role changes
// take effect within that window without forcing a re-login.
func (s *Service) ValidateToken(ctx context.Context, token string) (string, []string, bool, string, error) {
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return "", nil, false, "", err
	}
	if a, ok := s.authz.get(sess.UserID); ok {
		return sess.UserID, a.perms, a.isOwner, a.owningAdmin, nil
	}
	u, err := s.users.GetByID(ctx, sess.UserID)
	if err != nil {
		return "", nil, false, "", err
	}
	resolvedAdmin, err := s.users.ResolveOwningAdmin(ctx, u.ID)
	if err != nil {
		return "", nil, false, "", err
	}
	a := authz{perms: u.Permissions, isOwner: u.IsOwner, owningAdmin: scopeOwningAdmin(u.RoleSlugs, resolvedAdmin, u.ID)}
	s.authz.set(u.ID, a)
	return u.ID, a.perms, a.isOwner, a.owningAdmin, nil
}
