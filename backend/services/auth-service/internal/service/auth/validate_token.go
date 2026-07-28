package auth

import "context"

// ValidateToken authenticates a token against its live Redis session, then
// returns the caller's authorization (permissions, owner flag, territory scope,
// audit company). Liveness is always re-checked against Redis (so logout/expiry
// are instant), but the DB hydration is memoized per user for authzCacheTTL —
// role changes take effect within that window without forcing a re-login.
//
// The last two values are different keys on purpose. owningAdmin is the
// territory-visibility scope, which scopeOwningAdmin pins to a guest's own id.
// auditCompany is the unmangled tenant from the created_by chain; keying the
// audit log off the former would file a guest's changes under a one-person
// company its Company Owner could never see.
func (s *Service) ValidateToken(ctx context.Context, token string) (string, []string, bool, string, string, error) {
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return "", nil, false, "", "", err
	}
	if a, ok := s.authz.get(sess.UserID); ok {
		return sess.UserID, a.perms, a.isOwner, a.owningAdmin, a.auditCompany, nil
	}
	u, err := s.users.GetByID(ctx, sess.UserID)
	if err != nil {
		return "", nil, false, "", "", err
	}
	resolvedAdmin, err := s.users.ResolveOwningAdmin(ctx, u.ID)
	if err != nil {
		return "", nil, false, "", "", err
	}
	a := authz{
		perms:        u.Permissions,
		isOwner:      u.IsOwner,
		owningAdmin:  scopeOwningAdmin(u.RoleSlugs, resolvedAdmin, u.ID),
		auditCompany: resolvedAdmin,
	}
	s.authz.set(u.ID, a)
	return u.ID, a.perms, a.isOwner, a.owningAdmin, a.auditCompany, nil
}
