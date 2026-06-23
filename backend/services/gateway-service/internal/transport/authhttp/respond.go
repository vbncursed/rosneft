// Package authhttp exposes /api/auth/* as plain chi handlers in front of the
// auth gRPC client, plus the authn/authz middleware that protects the existing
// /api JSON routes. It deliberately bypasses the oapi-codegen strict layer.
package authhttp

import (
	"encoding/json"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

// fail maps a gRPC status error to an HTTP status + JSON error body.
func fail(w http.ResponseWriter, err error) {
	st := status.Convert(err)
	writeJSON(w, codeToHTTP(st.Code()), map[string]string{"error": st.Message()})
}

func codeToHTTP(c codes.Code) int {
	switch c {
	case codes.InvalidArgument:
		return http.StatusBadRequest
	case codes.Unauthenticated:
		return http.StatusUnauthorized
	case codes.PermissionDenied:
		return http.StatusForbidden
	case codes.NotFound:
		return http.StatusNotFound
	case codes.AlreadyExists:
		return http.StatusConflict
	case codes.FailedPrecondition:
		return http.StatusUnprocessableEntity
	default:
		return http.StatusInternalServerError
	}
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
