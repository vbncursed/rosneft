package auth

import "context"

// ValidateToken authenticates a token against its live Redis session, then
// returns the caller's authorization (permissions, owner flag, territory scope,
// audit company, and whether the session must enroll a second factor).
// Liveness is always re-checked against Redis (so logout/expiry are instant),
// but the DB hydration is memoized per user for authzCacheTTL — role changes
// take effect within that window without forcing a re-login.
//
// The last two values are different keys on purpose. owningAdmin is the
// territory-visibility scope, which scopeOwningAdmin pins to a guest's own id.
// auditCompany is the unmangled tenant from the created_by chain; keying the
// audit log off the former would file a guest's changes under a one-person
// company its Company Owner could never see.
func (s *Service) ValidateToken(ctx context.Context, token string) (string, []string, bool, string, string, bool, error) {
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return "", nil, false, "", "", false, err
	}
	a, ok := s.authz.get(sess.UserID)
	if !ok {
		u, err := s.users.GetByID(ctx, sess.UserID)
		if err != nil {
			return "", nil, false, "", "", false, err
		}
		resolvedAdmin, err := s.users.ResolveOwningAdmin(ctx, u.ID)
		if err != nil {
			return "", nil, false, "", "", false, err
		}
		a = authz{
			perms:        u.Permissions,
			isOwner:      u.IsOwner,
			owningAdmin:  scopeOwningAdmin(u.RoleSlugs, resolvedAdmin, u.ID),
			auditCompany: resolvedAdmin,
			totpRequired: u.TOTPRequired,
		}
		s.authz.set(u.ID, a)
	}

	// totpRequired is policy — a column on the user row, cached in the
	// snapshot alongside perms and isOwner, so a Require action becomes
	// visible within authzCacheTTL exactly like any other authorization
	// change, cache hit or not. Whether it is actually enrolled is a live
	// fact from twofa-service and must NEVER be cached: caching it would
	// leave someone who just enrolled locked out behind the enrollment
	// screen for up to authzCacheTTL more seconds after succeeding, which is
	// precisely the lock-out this design exists to avoid. So only the flag
	// is read from the snapshot; the round trip still happens live, on both
	// branches above, and only when that flag is set.
	//
	// ponytail: this makes IsEnabled a live gRPC call on every request for
	// every account with the flag set, not once per authzCacheTTL window —
	// the cost of closing the cache-hit hole above. If that round trip ever
	// shows up on the hot path, the safe half to cache is enabled == true:
	// staleness there only delays noticing a later *dis*-enrollment. Never
	// cache enabled == false — that is exactly the answer that must flip the
	// instant someone finishes enrolling.
	mustEnroll := false
	if a.totpRequired {
		enabled, err := s.twofa.IsEnabled(ctx, sess.UserID)
		if err != nil {
			return "", nil, false, "", "", false, err
		}
		mustEnroll = !enabled
	}
	return sess.UserID, a.perms, a.isOwner, a.owningAdmin, a.auditCompany, mustEnroll, nil
}
