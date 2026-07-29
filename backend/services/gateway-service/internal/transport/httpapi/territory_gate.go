package httpapi

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// territoryScopedPrefix is the route-pattern prefix every child resource of a
// territory shares. Thirteen routes sit under it today, and any added later is
// covered the moment it is registered — which is the point. The hole this closes
// was not a missing check but a check that had to be remembered thirteen times
// and was remembered three.
const territoryScopedPrefix = "/api/territories/{slug}"

// RequireTerritoryAccess refuses a caller any route under a territory they are
// not assigned to.
//
// It answers 404, never 403: a 403 confirms the territory exists, and to another
// tenant it must not. The body matches a genuinely missing slug for the same
// reason.
//
// MUST be mounted after RequirePermissionForRoute — the permission check touches
// no network, so a caller heading for a 403 should not first buy a catalog round
// trip.
//
// ponytail: one extra indexed lookup per child request, including the scene
// bundle where it duplicates that handler's own scoping. Cache within the
// request if it ever shows up in a profile.
func (s *Server) RequireTerritoryAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		if !strings.HasPrefix(chi.RouteContext(ctx).RoutePattern(), territoryScopedPrefix) {
			next.ServeHTTP(w, r)
			return
		}

		scopeAdminID, allAccess := authhttp.Scope(ctx)
		if allAccess {
			next.ServeHTTP(w, r)
			return
		}
		// An empty scope on a non-Root principal is an upstream bug. Refusing is
		// the safe reading: passing "" to the catalog disables the filter and
		// would open every territory.
		if scopeAdminID == "" {
			writeTerritoryMissing(w)
			return
		}
		if _, err := s.svc.GetTerritory(ctx, chi.URLParam(r, "slug"), scopeAdminID); err != nil {
			writeTerritoryMissing(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeTerritoryMissing(w http.ResponseWriter) {
	apperr.Write(w, http.StatusNotFound, apperr.SlugNotFound, "territory not found")
}
