package authhttp

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

// AuthAuditActionsSuite guards the mistake this map can make silently: listing
// a route the triggers already cover, which would log every such change twice.
type AuthAuditActionsSuite struct {
	suite.Suite
}

func TestAuthAuditActionsSuite(t *testing.T) {
	suite.Run(t, new(AuthAuditActionsSuite))
}

func (s *AuthAuditActionsSuite) TestCoversSessionAndCredentialEvents() {
	for route, want := range map[string]string{
		"POST /api/auth/login":       "auth.login",
		"POST /api/auth/logout":      "auth.logout",
		"POST /api/auth/me/password": "auth.password_change",
	} {
		assert.Equal(s.T(), authAuditActions[route], want)
	}
}

// User and role mutations reach users / user_roles / roles / role_permissions,
// which audit_capture() already logs. Listing them here would double-write.
func (s *AuthAuditActionsSuite) TestExcludesTriggerCoveredRoutes() {
	for _, route := range []string{
		"POST /api/auth/users",
		"PATCH /api/auth/users/{id}",
		"DELETE /api/auth/users/{id}",
		"POST /api/auth/users/{id}/owner",
		"POST /api/auth/roles",
		"PATCH /api/auth/roles/{slug}",
		"PUT /api/auth/roles/{slug}/permissions",
	} {
		_, listed := authAuditActions[route]
		assert.Assert(s.T(), !listed, "route %s is already captured by a trigger", route)
	}
}

// 2FA setup hands out a secret but changes no state; only enable/disable do.
func (s *AuthAuditActionsSuite) TestExcludesStatelessSetup() {
	_, listed := authAuditActions["POST /api/auth/2fa/setup"]
	assert.Assert(s.T(), !listed)
	assert.Equal(s.T(), authAuditActions["POST /api/auth/2fa/enable"], "auth.2fa_enable")
	assert.Equal(s.T(), authAuditActions["POST /api/auth/2fa/disable"], "auth.2fa_disable")
}

// Every action must be namespaced under auth. so the journal's action filter
// can separate session events from data changes.
func (s *AuthAuditActionsSuite) TestEveryActionIsNamespaced() {
	for route, action := range authAuditActions {
		assert.Assert(s.T(), len(action) > 5 && action[:5] == "auth.",
			"route %s maps to un-namespaced action %q", route, action)
	}
}

// A successful password change already reaches the journal through the users
// trigger (password_changed_at), so recording it here too wrote it twice. A
// failed attempt changes no row, and this is the only place it can be written.
func (s *AuthAuditActionsSuite) TestAPasswordChangeRecordsOnlyItsFailures() {
	for _, tc := range []struct {
		action, result string
		want           bool
	}{
		{action: "auth.password_change", result: "ok", want: false},
		{action: "auth.password_change", result: "failed", want: true},
		{action: "auth.logout", result: "ok", want: true},
		{action: "auth.2fa_enable", result: "failed", want: true},
	} {
		assert.Equal(s.T(), recordsOutcome(tc.action, tc.result), tc.want, "%s %s", tc.action, tc.result)
	}
}
