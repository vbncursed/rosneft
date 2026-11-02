// In-package test: routePerms is unexported.
package authhttp

import (
	"net/http"
	"net/http/httptest"

	"github.com/go-chi/chi/v5"
	"gotest.tools/v3/assert"
)

// Creating and renaming a tag is a model write. The gate fails open, so the
// X-Pattern check pins that the route matched is the one routePerms keys on.
func (s *RoutePermsSuite) TestModelTagWritesNeedModelWrite() {
	routes := []struct{ method, pattern, path string }{
		{http.MethodPost, "/api/model-tags", "/api/model-tags"},
		{http.MethodPatch, "/api/model-tags/{slug}", "/api/model-tags/camp"},
	}
	ok := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Pattern", chi.RouteContext(r.Context()).RoutePattern())
		w.WriteHeader(http.StatusNoContent)
	}
	r := chi.NewRouter()
	gated := r.With(RequirePermissionForRoute)
	for _, rt := range routes {
		gated.MethodFunc(rt.method, rt.pattern, ok)
		assert.DeepEqual(s.T(), routePerms[rt.method+" "+rt.pattern], []string{"model:write"})
	}

	for _, tc := range []struct {
		name     string
		perms    []string
		expected int
	}{
		{name: "viewer", perms: []string{"territory:read"}, expected: http.StatusForbidden},
		{name: "model deleter", perms: []string{"territory:read", "model:delete"}, expected: http.StatusForbidden},
		{name: "model editor", perms: []string{"territory:read", "model:write"}, expected: http.StatusNoContent},
	} {
		for _, rt := range routes {
			s.Run(tc.name+" "+rt.method, func() {
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
