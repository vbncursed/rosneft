package authhttp_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/httpapi"
)

// ungatedMutations are the non-GET operations of the spec that routePerms
// deliberately does not list. RequirePermissionForRoute fails open, so a
// mutation missing from both is a silent hole — that is how
// "PUT …/placements/{id}/visibility" shipped with no permission at all.
// Adding an entry here needs a reason a reviewer can check.
var ungatedMutations = map[string]string{
	// Gated inside the handler: Root only (territory_admins.go, IsOwner).
	"PUT /api/territories/{slug}/admins": "root check in handler",
	// Read-only offset probe for a resumable upload.
	"HEAD /api/uploads/{id}": "read, no state change",
	// Root router, outside the /api sub-router this gate runs on.
	"HEAD /api/assets/{hash}": "read, gated by RequireBlobAccess",

	// Everything under /api/auth is mounted by authhttp.Mount on the root router,
	// so routePerms never sees it. Public: no session exists yet.
	"POST /api/auth/login":                "public login",
	"POST /api/auth/login/2fa":            "public login",
	"POST /api/auth/passkey/login/begin":  "public login",
	"POST /api/auth/passkey/login/finish": "public login",
	// The caller's own session and account; the target is the session itself.
	"POST /api/auth/logout":                     "own session",
	"POST /api/auth/me/password":                "own account",
	"POST /api/auth/me/onboarding/{tour}":       "own account",
	"POST /api/auth/2fa/setup":                  "own account",
	"POST /api/auth/2fa/enable":                 "own account",
	"POST /api/auth/2fa/disable":                "own account, TOTP step-up",
	"POST /api/auth/2fa/recovery/regenerate":    "own account, TOTP step-up",
	"POST /api/auth/passkey/register/begin":     "own account",
	"POST /api/auth/passkey/register/finish":    "own account",
	"DELETE /api/auth/passkey/credentials/{id}": "own credential, step-up",
	// Admin routes: gated per route by h.Require in mount.go.
	"POST /api/auth/users":                    "users:write in mount.go",
	"PATCH /api/auth/users/{id}":              "users:write in mount.go",
	"DELETE /api/auth/users/{id}":             "users:delete in mount.go",
	"POST /api/auth/users/{id}/freeze":        "users:freeze in mount.go",
	"POST /api/auth/users/{id}/unfreeze":      "users:freeze in mount.go",
	"POST /api/auth/users/{id}/2fa/require":   "users:write in mount.go",
	"POST /api/auth/users/{id}/2fa/unrequire": "users:write in mount.go",
	"POST /api/auth/users/{id}/restore":       "users:delete in mount.go",
	"POST /api/auth/users/{id}/owner":         "users:write in mount.go, owner check in auth",
	"POST /api/auth/roles":                    "roles:manage in mount.go",
	"PATCH /api/auth/roles/{slug}":            "roles:manage in mount.go",
	"DELETE /api/auth/roles/{slug}":           "roles:manage in mount.go",
	"PUT /api/auth/roles/{slug}/permissions":  "roles:manage in mount.go",
}

type RoutePermsSpecSuite struct{ suite.Suite }

func TestRoutePermsSpecSuite(t *testing.T) { suite.Run(t, new(RoutePermsSpecSuite)) }

func (s *RoutePermsSpecSuite) specMutations() map[string]bool {
	spec, err := httpapi.GetSpec()
	assert.NilError(s.T(), err)
	out := map[string]bool{}
	for path, item := range spec.Paths.Map() {
		for method := range item.Operations() {
			if method != http.MethodGet {
				out[method+" "+path] = true
			}
		}
	}
	return out
}

func (s *RoutePermsSpecSuite) TestEveryMutationIsGatedOrExplained() {
	for route := range s.specMutations() {
		_, gated := authhttp.RoutePerms[route]
		_, excused := ungatedMutations[route]
		assert.Assert(s.T(), gated || excused,
			"%s is in the spec but neither in routePerms nor in ungatedMutations: it is open to any session", route)
		assert.Assert(s.T(), !gated || !excused, "%s is both gated and excused; drop the exception", route)
	}
}

// A stale exception outlives its route and would silently excuse a new one
// registered under the same key later.
func (s *RoutePermsSpecSuite) TestEveryExceptionIsStillInTheSpec() {
	mutations := s.specMutations()
	for route := range ungatedMutations {
		assert.Assert(s.T(), mutations[route], "%s is excused but no longer in the spec", route)
	}
}
