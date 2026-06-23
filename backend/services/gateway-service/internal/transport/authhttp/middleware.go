package authhttp

import "net/http"

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
