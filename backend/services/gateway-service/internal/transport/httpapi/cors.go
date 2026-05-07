package httpapi

import (
	"net/http"
	"slices"
	"strings"
)

// CORSMiddleware applies a permissive-but-bounded CORS policy. allowedOrigins
// of nil or {"*"} allows any origin (echoed back); otherwise the origin must
// match exactly. Preflight (OPTIONS) requests short-circuit with 204.
func CORSMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
	allowAll := len(allowedOrigins) == 0 || slices.Contains(allowedOrigins, "*")

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (allowAll || slices.Contains(allowedOrigins, origin)) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, If-None-Match")
				w.Header().Set("Access-Control-Expose-Headers", "ETag, Content-Length, Content-Range")
			}
			if r.Method == http.MethodOptions && strings.EqualFold(r.Header.Get("Access-Control-Request-Method"), "") == false {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
