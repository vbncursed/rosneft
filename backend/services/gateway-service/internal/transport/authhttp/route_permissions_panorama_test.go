// In-package test: routePerms is unexported.
package authhttp

import (
	"net/http"
	"net/http/httptest"

	"github.com/go-chi/chi/v5"
	"gotest.tools/v3/assert"
)

// Hiding panoramas, moving them between phases and hiding a whole phase change
// what everyone sees on the territory: each is a panorama write, like PUT
// …/panoramas/{id} (spec §2: no new grants). The static /panoramas/hidden and
// /panoramas/phase sit beside PUT /panoramas/{id}; chi matches the static
// segment first, so the gate keys on their own pattern. The gate fails open,
// so a typo in a key would un-gate the route: the X-Pattern check pins it.
func (s *RoutePermsSuite) TestPanoramaHidingAndPhasesNeedPanoramaWrite() {
	routes := []struct{ pattern, path string }{
		{"/api/territories/{slug}/panoramas/hidden", "/api/territories/yard/panoramas/hidden"},
		{"/api/territories/{slug}/panoramas/phase", "/api/territories/yard/panoramas/phase"},
		{"/api/territories/{slug}/panorama-phases/{phase}", "/api/territories/yard/panorama-phases/post"},
	}
	ok := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Pattern", chi.RouteContext(r.Context()).RoutePattern())
		w.WriteHeader(http.StatusNoContent)
	}
	r := chi.NewRouter()
	gated := r.With(RequirePermissionForRoute)
	gated.Put("/api/territories/{slug}/panoramas/{id}", ok)
	for _, rt := range routes {
		gated.Put(rt.pattern, ok)
		assert.DeepEqual(s.T(), routePerms["PUT "+rt.pattern], []string{"panorama:write"})
	}

	for _, tc := range []struct {
		name     string
		perms    []string
		expected int
	}{
		{name: "viewer", perms: []string{"territory:read", "panorama:read"}, expected: http.StatusForbidden},
		{name: "uploader without write", perms: []string{"territory:read", "panorama:create"}, expected: http.StatusForbidden},
		{name: "placement editor", perms: []string{"territory:read", "placement:write"}, expected: http.StatusForbidden},
		{name: "editor", perms: []string{"territory:read", "panorama:write"}, expected: http.StatusNoContent},
	} {
		for _, rt := range routes {
			s.Run(tc.name+" "+rt.path, func() {
				req := httptest.NewRequestWithContext(
					withPrincipal(s.T().Context(), "u1", tc.perms, false, "admin", "admin"),
					http.MethodPut, rt.path, http.NoBody)
				rec := httptest.NewRecorder()
				r.ServeHTTP(rec, req)
				assert.Equal(s.T(), rec.Code, tc.expected)
				if tc.expected == http.StatusNoContent {
					assert.Equal(s.T(), rec.Header().Get("X-Pattern"), rt.pattern)
				}
			})
		}
	}
}
