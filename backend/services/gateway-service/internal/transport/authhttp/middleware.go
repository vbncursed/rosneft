package authhttp

import (
	"net/http"
	"slices"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// Authenticate validates the Bearer token via the auth-service and injects the
// principal (user id + permission snapshot) into the request context. Requests
// without a valid token get 401.
func (h *Handlers) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearer(r)
		if token == "" {
			apperr.Write(w, http.StatusUnauthorized, apperr.SlugUnauthenticated, "missing bearer token")
			return
		}
		uid, perms, isOwner, owningAdmin, err := h.client.ValidateToken(r.Context(), token)
		if err != nil {
			fail(w, err) // maps Unauthenticated → 401
			return
		}
		next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), uid, perms, isOwner, owningAdmin)))
	})
}

// require gates a route on a single permission. It MUST run after Authenticate,
// which populates the principal's permission snapshot. 403 if the permission is
// absent.
func (h *Handlers) require(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !principalIsOwner(r.Context()) && !slices.Contains(principalPerms(r.Context()), perm) {
				apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden, "permission denied: "+perm)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
