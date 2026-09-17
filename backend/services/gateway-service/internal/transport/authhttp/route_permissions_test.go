// In-package test: routePerms is unexported.
package authhttp

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
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
		"GET /api/audit/mine",
	} {
		need, gated := routePerms[route]
		assert.Assert(s.T(), gated, "%s is not gated: RequirePermissionForRoute lets it through", route)
		assert.Assert(s.T(), len(need) > 0, "%s names no permissions", route)
	}
}

// The two journals are separate routes with separate grants, and that is the
// boundary rather than a convention. If audit:read_own creeps back onto the
// company journal, /account's old behaviour — the whole company under a "My
// activity" heading — becomes reachable again through a client that omits a
// filter.
func (s *RoutePermsSuite) TestTheTwoJournalsDoNotShareGrants() {
	assert.DeepEqual(s.T(), routePerms["GET /api/audit"], []string{"audit:read"})
	assert.DeepEqual(s.T(), routePerms["GET /api/audit/actors"], []string{"audit:read"})
	// Either grant opens the own-journal: a Company Owner carries only the wider
	// one in some deployments and must not lose their own account page over it.
	assert.DeepEqual(s.T(), routePerms["GET /api/audit/mine"], []string{"audit:read_own", "audit:read"})
}

// RequirePermissionForRoute fails OPEN, same as the journal comment above: a
// route missing from routePerms is authenticated but not authorised, and the
// request goes through. "POST /api/territories/{slug}/source" was exactly
// that — absent from the map, so a viewer holding only territory:read (enough
// to pass RequireTerritoryAccess) could replace a territory's source model
// and trigger a reconversion. Every content-mutation route must be listed.
func (s *RoutePermsSuite) TestEveryContentMutationRouteIsGated() {
	for _, route := range []string{
		"POST /api/territories",
		"PATCH /api/territories/{slug}",
		"DELETE /api/territories/{slug}",
		"POST /api/territories/{slug}/source", // the one that had been missing
		"POST /api/models",
		"PATCH /api/models/{slug}",
		"DELETE /api/models/{slug}",
		"POST /api/territories/{slug}/placements",
		"PUT /api/territories/{slug}/placements/{id}",
		"PUT /api/territories/{slug}/placements/{id}/visibility", // was missing too
		"DELETE /api/territories/{slug}/placements/{id}",
		"POST /api/territories/{slug}/panoramas",
		"PUT /api/territories/{slug}/panoramas/{id}",
		"DELETE /api/territories/{slug}/panoramas/{id}",
		"POST /api/territories/{slug}/documents",
		"DELETE /api/territories/{slug}/documents/{id}",
		"POST /api/uploads",
		"PATCH /api/uploads/{id}",
		"POST /api/uploads/{id}/finalize",
	} {
		need, gated := routePerms[route]
		assert.Assert(s.T(), gated, "%s is not gated: RequirePermissionForRoute lets it through", route)
		assert.Assert(s.T(), len(need) > 0, "%s names no permissions", route)
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

// The visibility allowlist is a placement write. It was absent from routePerms,
// so a guest or viewer — whose read grants are enough to pass
// RequireTerritoryAccess — could rewrite it on a territory assigned to them.
// Drives the real middleware through a chi route, because the gate keys on the
// matched pattern, not on the URL.
func (s *RoutePermsSuite) TestVisibilityNeedsPlacementWrite() {
	const pattern = "/api/territories/{slug}/placements/{id}/visibility"
	r := chi.NewRouter()
	r.With(RequirePermissionForRoute).Put(pattern, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	cases := []struct {
		name     string
		perms    []string
		expected int
	}{
		{name: "guest", perms: []string{"territory:read", "placement:read", "panorama:read"}, expected: http.StatusForbidden},
		{name: "viewer", perms: []string{"territory:read", "placement:read"}, expected: http.StatusForbidden},
		{name: "editor", perms: []string{"territory:read", "placement:write"}, expected: http.StatusNoContent},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			req := httptest.NewRequestWithContext(
				withPrincipal(s.T().Context(), "u1", tc.perms, false, "admin", "admin"),
				http.MethodPut, "/api/territories/yard/placements/7/visibility", http.NoBody)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			assert.Equal(s.T(), rec.Code, tc.expected)
		})
	}
}
