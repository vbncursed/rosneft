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

// bearer extracts the token from the Authorization header.
func bearer(r *http.Request) string {
	const p = "Bearer "
	h := r.Header.Get("Authorization")
	if len(h) > len(p) && h[:len(p)] == p {
		return h[len(p):]
	}
	return ""
}
