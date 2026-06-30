package authhttp

import (
	"net/http"
	"slices"

	"github.com/go-chi/chi/v5"
	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// routePerms maps "METHOD <chi route pattern>" to the permission it requires.
// Only mutations are listed; reads need any authenticated principal.
var routePerms = map[string]string{
	"POST /api/territories":                          "territory:create",
	"PATCH /api/territories/{slug}":                  "territory:write",
	"DELETE /api/territories/{slug}":                 "territory:delete",
	"POST /api/models":                               "model:write",
	"DELETE /api/models/{slug}":                      "model:delete",
	"POST /api/territories/{slug}/placements":        "placement:create",
	"PUT /api/territories/{slug}/placements/{id}":    "placement:write",
	"DELETE /api/territories/{slug}/placements/{id}": "placement:delete",
	"POST /api/territories/{slug}/panoramas":         "panorama:create",
	"PUT /api/territories/{slug}/panoramas/{id}":     "panorama:write",
	"DELETE /api/territories/{slug}/panoramas/{id}":  "panorama:delete",
	"POST /api/territories/{slug}/documents":         "document:write",
	"DELETE /api/territories/{slug}/documents/{id}":  "document:delete",
	"POST /api/uploads":                              "upload:create",
	"PATCH /api/uploads/{id}":                        "upload:create",
	"POST /api/uploads/{id}/finalize":                "upload:create",
}

// RequirePermissionForRoute enforces routePerms against the principal. Routes
// not in the map require only a valid session (handled by Authenticate).
func RequirePermissionForRoute(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pattern := chi.RouteContext(r.Context()).RoutePattern()
		need, gated := routePerms[r.Method+" "+pattern]
		if gated && !principalIsOwner(r.Context()) && !slices.Contains(principalPerms(r.Context()), need) {
			apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden, "permission denied: "+need)
			return
		}
		next.ServeHTTP(w, r)
	})
}
