package authhttp

import "slices"

// enrollmentPaths is everything a session that still owes a second factor may
// reach: read who you are, sign out, and enroll. Nothing else.
//
// Exact matches, never prefixes. A prefix match would open /api/auth/me/password
// along with /api/auth/me, and the whole point of this list is that adding a
// route does not quietly widen it.
var enrollmentPaths = []string{
	"/api/auth/me",
	"/api/auth/logout",
	"/api/auth/2fa/setup",
	"/api/auth/2fa/enable",
	"/api/auth/2fa/recovery/regenerate",
}

// enrollmentAllows reports whether a session that must enroll a second factor may
// reach this path. It denies by default: a route added later is refused until
// somebody deliberately lists it here.
func enrollmentAllows(path string) bool {
	return slices.Contains(enrollmentPaths, path)
}
