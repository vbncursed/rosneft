// In-package test: routePerms is unexported.
package authhttp

import (
	"net/http"
	"net/http/httptest"

	"github.com/go-chi/chi/v5"
	"gotest.tools/v3/assert"
)

// The five zone and calibration writes are one editing job behind one grant. The
// gate fails open, so the X-Pattern check pins that the route matched is the
// one routePerms keys on: a typo in a key would un-gate the route silently.
func (s *RoutePermsSuite) TestZoneRoutesNeedZoneWrite() {
	routes := []struct{ method, pattern, path string }{
		{http.MethodPost, "/api/territories/{slug}/zones", "/api/territories/yard/zones"},
		{http.MethodPatch, "/api/territories/{slug}/zones/{id}", "/api/territories/yard/zones/7"},
		{http.MethodDelete, "/api/territories/{slug}/zones/{id}", "/api/territories/yard/zones/7"},
		{
			http.MethodPut,
			"/api/territories/{slug}/documents/{id}/calibration",
			"/api/territories/yard/documents/9/calibration",
		},
		{
			http.MethodDelete,
			"/api/territories/{slug}/documents/{id}/calibration",
			"/api/territories/yard/documents/9/calibration",
		},
	}
	ok := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Pattern", chi.RouteContext(r.Context()).RoutePattern())
		w.WriteHeader(http.StatusNoContent)
	}
	r := chi.NewRouter()
	gated := r.With(RequirePermissionForRoute)
	for _, rt := range routes {
		gated.MethodFunc(rt.method, rt.pattern, ok)
		assert.DeepEqual(s.T(), routePerms[rt.method+" "+rt.pattern], []string{"zone:write"})
	}

	for _, tc := range []struct {
		name     string
		perms    []string
		expected int
	}{
		{name: "viewer", perms: []string{"territory:read"}, expected: http.StatusForbidden},
		{name: "placement editor", perms: []string{"territory:read", "placement:write", "panorama:write"}, expected: http.StatusForbidden},
		{name: "measurement editor", perms: []string{"territory:read", "measurement:write", "measurement:create"}, expected: http.StatusForbidden},
		{name: "zone editor", perms: []string{"territory:read", "zone:write"}, expected: http.StatusNoContent},
	} {
		for _, rt := range routes {
			s.Run(tc.name+" "+rt.method+" "+rt.path, func() {
				req := httptest.NewRequestWithContext(
					withPrincipal(s.T().Context(), "u1", tc.perms, false, "admin", "admin"),
					rt.method, rt.path, http.NoBody)
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

// Reading zones and the tag list changes nothing: a session is enough, so no
// GET is in routePerms and a principal with no grants at all gets through.
func (s *RoutePermsSuite) TestListModelTagsNeedsSessionOnly() {
	reads := []struct{ pattern, path string }{
		{"/api/model-tags", "/api/model-tags"},
		{"/api/territories/{slug}/zones", "/api/territories/yard/zones"},
	}
	r := chi.NewRouter()
	gated := r.With(RequirePermissionForRoute)
	for _, rt := range reads {
		gated.Get(rt.pattern, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
		_, listed := routePerms["GET "+rt.pattern]
		assert.Assert(s.T(), !listed, "GET %s must need only a session", rt.pattern)

		req := httptest.NewRequestWithContext(
			withPrincipal(s.T().Context(), "u1", nil, false, "admin", "admin"), http.MethodGet, rt.path, http.NoBody)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		assert.Equal(s.T(), rec.Code, http.StatusNoContent, rt.path)
	}
}
