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
		assert.Equal(s.T(), need, "audit:read", route)
	}
}
