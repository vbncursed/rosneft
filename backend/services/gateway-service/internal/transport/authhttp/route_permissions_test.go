// In-package test: routePerms is unexported.
package authhttp

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type RoutePermsSuite struct{ suite.Suite }

func TestRoutePermsSuite(t *testing.T) { suite.Run(t, new(RoutePermsSuite)) }

// RequirePermissionForRoute fails OPEN: a route absent from routePerms is
// authenticated but not authorised, and the request goes through. A typo in a
// key therefore does not break the route — it silently un-gates it. These
// assertions are the only thing standing between that and the journal.
func (s *RoutePermsSuite) TestEveryJournalRouteIsGated() {
	for _, route := range []string{
		"GET /api/audit",
		"GET /api/audit/actors",
	} {
		need, gated := routePerms[route]
		assert.Assert(s.T(), gated, "%s is not gated: RequirePermissionForRoute lets it through", route)
		assert.DeepEqual(s.T(), need, []string{"audit:read", "audit:read_own"})
	}
}

// An empty list passes the "is it in the map" check above while naming nothing
// that could satisfy it: holdsAny over an empty slice is always false, so the
// gate collapses to !isOwner and every non-Root caller gets a 403. The route
// becomes unreachable rather than open — an availability failure, not a bypass,
// but a silent one that no other test would surface. Pin it.
func (s *RoutePermsSuite) TestNoRouteHasAnEmptyPermissionList() {
	for route, need := range routePerms {
		assert.Assert(s.T(), len(need) > 0, "%s names no permissions", route)
	}
}
