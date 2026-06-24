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

// writeErr emits the project-wide {code,message} error body — the same shape
// the OpenAPI Error schema and the rest of the gateway API use, so clients can
// read one error contract everywhere.
func writeErr(w http.ResponseWriter, httpStatus int, code, message string) {
	writeJSON(w, httpStatus, map[string]string{"code": code, "message": message})
}

// fail maps a gRPC status error to an HTTP status + {code,message} body.
func fail(w http.ResponseWriter, err error) {
	st := status.Convert(err)
	writeErr(w, codeToHTTP(st.Code()), codeToSlug(st.Code()), st.Message())
}

func codeToSlug(c codes.Code) string {
	switch c {
	case codes.InvalidArgument:
		return "invalid_input"
	case codes.Unauthenticated:
		return "unauthenticated"
	case codes.PermissionDenied:
		return "forbidden"
	case codes.NotFound:
		return "not_found"
	case codes.AlreadyExists:
		return "conflict"
	case codes.FailedPrecondition:
		return "unprocessable"
	default:
		return "internal"
	}
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
