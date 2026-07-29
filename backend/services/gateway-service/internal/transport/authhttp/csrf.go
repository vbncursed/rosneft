package authhttp

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// csrfHeaderName is where the SPA echoes the token back.
const csrfHeaderName = "X-CSRF-Token"

// CSRFToken derives the anti-CSRF token for a session.
//
// Derived, not stored: the gateway holds both inputs at request time, so the
// scheme needs no database, no Redis key and no second cookie. Being a function
// of the session token also binds it — it cannot be transplanted onto another
// session, and it dies exactly when that session does. Rotating
// GATEWAY_CSRF_SECRET invalidates every outstanding token at once.
//
// This is why CSRF got no service of its own: it owns no state, so a service
// would put a network hop on the hot path of every mutation and add a failure
// mode where writes stop entirely.
func (h *Handlers) CSRFToken(sessionToken string) string {
	mac := hmac.New(sha256.New, h.csrfSecret)
	mac.Write([]byte(sessionToken))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// csrfExemptPaths are state-changing routes that must work without a token.
//
// Only logout, and the reasoning is a trade of severities. A forged cross-site
// logout is an annoyance: no data moves, and the victim logs back in. Being
// unable to log out is worse — the session stays alive and the user has no way
// to end it, which is exactly the failure the unconditional clearSession in
// logout() exists to prevent. Guarding logout would reintroduce it one layer up.
//
// Nothing else belongs here. A route added to this map stops being protected.
var csrfExemptPaths = map[string]bool{"/api/auth/logout": true}

// RequireCSRF rejects a state-changing request whose cookie session is not
// accompanied by a matching token.
//
// Only cookie sessions are checked, and that is what makes the scheme
// affordable: a browser will not attach an Authorization header to a cross-site
// request, so a Bearer caller cannot be CSRF'd. curl, the tests and every
// non-browser integration therefore need no change at all.
//
// SameSite=Lax on the session cookie remains the first line. This is the second,
// and its value is that it survives a state-changing GET being added by
// accident — which is the single assumption the first line rests on. Safe
// methods pass here for exactly that reason, so the assumption still has to
// hold; safe_get_test.go is what holds it.
func (h *Handlers) RequireCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if csrfExemptPaths[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}
		token, fromCookie := sessionTokenFrom(r)
		if !fromCookie {
			next.ServeHTTP(w, r)
			return
		}
		// Constant time: the token is a MAC, and a byte-at-a-time comparison
		// would leak it to a caller who can time enough attempts.
		if !hmac.Equal([]byte(h.CSRFToken(token)), []byte(r.Header.Get(csrfHeaderName))) {
			apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden,
				"missing or invalid CSRF token; re-read /api/auth/me")
			return
		}
		next.ServeHTTP(w, r)
	})
}
