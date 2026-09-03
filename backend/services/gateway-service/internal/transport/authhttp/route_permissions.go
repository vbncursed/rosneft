package authhttp

import (
	"context"
	"net/http"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// routePerms maps "METHOD <chi route pattern>" to the permissions that open it —
// holding ANY of them is enough. Only mutations are listed; reads need any
// authenticated principal.
//
// The journal has two grants of different width, and they open different
// routes: audit:read reads the company's history, audit:read_own reads your
// own, and neither reaches the other's. Putting both on one route and letting
// the scope resolver sort it out is what let /account render the whole company
// under a "My activity" heading — a Company Owner holds both, and the resolver
// preferred the wider one.
var routePerms = map[string][]string{
	// The gated reads: the journals are not open to every authenticated
	// principal the way the content endpoints are.
	"GET /api/audit":        {"audit:read"},
	"GET /api/audit/actors": {"audit:read"},
	// Either grant opens the own-journal: a Company Owner carries only the
	// wider one in some deployments and must not lose their own account page.
	"GET /api/audit/mine":            {"audit:read_own", "audit:read"},
	"POST /api/territories":          {"territory:create"},
	"PATCH /api/territories/{slug}":  {"territory:write"},
	"DELETE /api/territories/{slug}": {"territory:delete"},
	// Replacing the source model is a write on the territory: it feeds a
	// reconversion, same grant as PATCH.
	"POST /api/territories/{slug}/source":            {"territory:write"},
	"POST /api/models":                               {"model:write"},
	"PATCH /api/models/{slug}":                       {"model:write"},
	"DELETE /api/models/{slug}":                      {"model:delete"},
	"POST /api/territories/{slug}/placements":        {"placement:create"},
	"PUT /api/territories/{slug}/placements/{id}":    {"placement:write"},
	"DELETE /api/territories/{slug}/placements/{id}": {"placement:delete"},
	"POST /api/territories/{slug}/panoramas":         {"panorama:create"},
	"PUT /api/territories/{slug}/panoramas/{id}":     {"panorama:write"},
	"DELETE /api/territories/{slug}/panoramas/{id}":  {"panorama:delete"},
	"POST /api/territories/{slug}/documents":         {"document:write"},
	"DELETE /api/territories/{slug}/documents/{id}":  {"document:delete"},
	"POST /api/uploads":                              {"upload:create"},
	"PATCH /api/uploads/{id}":                        {"upload:create"},
	"POST /api/uploads/{id}/finalize":                {"upload:create"},
}

// RequirePermissionForRoute enforces routePerms against the principal. Routes
// not in the map require only a valid session (handled by Authenticate).
func RequirePermissionForRoute(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pattern := chi.RouteContext(r.Context()).RoutePattern()
		need, gated := routePerms[r.Method+" "+pattern]
		if gated && !principalIsOwner(r.Context()) && !holdsAny(r.Context(), need) {
			apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden,
				"permission denied: one of "+strings.Join(need, ", "))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// holdsAny reports whether the principal carries at least one of need.
func holdsAny(ctx context.Context, need []string) bool {
	have := principalPerms(ctx)
	return slices.ContainsFunc(need, func(p string) bool { return slices.Contains(have, p) })
}
