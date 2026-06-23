package authhttp

import (
	"net/http"
	"slices"
)

// Authenticate validates the Bearer token via the auth-service and injects the
// principal (user id + permission snapshot) into the request context. Requests
// without a valid token get 401.
func (h *Handlers) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearer(r)
		if token == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing bearer token"})
			return
		}
		uid, perms, err := h.client.ValidateToken(r.Context(), token)
		if err != nil {
			fail(w, err) // maps Unauthenticated → 401
			return
		}
		next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), uid, perms)))
	})
}

// require gates a route on a single permission. It MUST run after Authenticate,
// which populates the principal's permission snapshot. 403 if the permission is
// absent.
func (h *Handlers) require(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !slices.Contains(principalPerms(r.Context()), perm) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "permission denied: " + perm})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
