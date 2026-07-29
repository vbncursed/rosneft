// Package authhttp exposes /api/auth/* as plain chi handlers in front of the
// auth gRPC client, plus the authn/authz middleware that protects the existing
// /api JSON routes. It deliberately bypasses the oapi-codegen strict layer.
package authhttp

import (
	"encoding/json"
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

// fail renders a gRPC status error as the project-wide {code,message} body.
func fail(w http.ResponseWriter, err error) {
	apperr.WriteStatus(w, err)
}

// sessionTokenFrom returns the caller's session token and whether it arrived in
// the cookie.
//
// The cookie wins because a browser that has one is the normal case and the
// header would only be there by accident. The header stays supported because
// curl, the tests and any non-browser client have no cookie jar — httpOnly
// protects a token at rest in the browser, which is what gets stolen, not the
// header on a request somebody deliberately made.
//
// The source matters to RequireCSRF and to nothing else: a Bearer caller is
// immune to CSRF by construction, since a browser will not attach an
// Authorization header to a cross-site request.
func sessionTokenFrom(r *http.Request) (string, bool) {
	if c, err := r.Cookie(sessionCookieName); err == nil && c.Value != "" {
		return c.Value, true
	}
	const p = "Bearer "
	h := r.Header.Get("Authorization")
	if len(h) > len(p) && h[:len(p)] == p {
		return h[len(p):], false
	}
	return "", false
}

// sessionToken returns the caller's session token regardless of where it came
// from. A thin wrapper so the call sites that do not care stay unchanged.
func sessionToken(r *http.Request) string {
	tok, _ := sessionTokenFrom(r)
	return tok
}
