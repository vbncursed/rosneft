// Package apperr is the project-wide error contract. It owns the single
// mapping between gRPC status codes, HTTP statuses, and the public {code,
// message} JSON envelope, plus the helpers that translate domain errors to
// gRPC statuses (server side) and render gRPC statuses as HTTP responses
// (gateway side). Every service references this so the error shape never drifts.
package apperr

import (
	"encoding/json"
	"errors"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Slug constants are the stable string codes in the public error envelope.
const (
	SlugInvalidInput    = "invalid_input"
	SlugUnauthenticated = "unauthenticated"
	SlugForbidden       = "forbidden"
	SlugNotFound        = "not_found"
	SlugConflict        = "conflict"
	SlugUnprocessable   = "unprocessable"
	SlugInternal        = "internal"
)

// statusOrder fixes the precedence ToStatus uses when matching a domain error,
// so the result is deterministic regardless of Go's random map iteration.
var statusOrder = []codes.Code{
	codes.InvalidArgument,
	codes.NotFound,
	codes.Unauthenticated,
	codes.PermissionDenied,
	codes.AlreadyExists,
	codes.FailedPrecondition,
}

// Slug maps a gRPC code to its public string code.
func Slug(c codes.Code) string {
	switch c {
	case codes.InvalidArgument:
		return SlugInvalidInput
	case codes.Unauthenticated:
		return SlugUnauthenticated
	case codes.PermissionDenied:
		return SlugForbidden
	case codes.NotFound:
		return SlugNotFound
	case codes.AlreadyExists:
		return SlugConflict
	case codes.FailedPrecondition:
		return SlugUnprocessable
	default:
		return SlugInternal
	}
}

// HTTPStatus maps a gRPC code to its HTTP status.
func HTTPStatus(c codes.Code) int {
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

// ToStatus converts a domain error to a gRPC status error. byCode lists, per
// code, the domain sentinels that should surface as that code. The first code
// in statusOrder whose sentinels errors.Is-match err wins; a nil err returns
// nil, and any unmatched non-nil err becomes codes.Internal.
func ToStatus(err error, byCode map[codes.Code][]error) error {
	if err == nil {
		return nil
	}
	for _, c := range statusOrder {
		for _, sentinel := range byCode[c] {
			if errors.Is(err, sentinel) {
				return status.Error(c, err.Error())
			}
		}
	}
	return status.Errorf(codes.Internal, "internal: %v", err)
}

// Body is the public JSON error envelope: {code, message}.
type Body struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Write emits the {code, message} envelope with the given HTTP status.
func Write(w http.ResponseWriter, httpStatus int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpStatus)
	_ = json.NewEncoder(w).Encode(Body{Code: code, Message: message})
}

// WriteStatus renders a gRPC status error as the {code, message} envelope,
// translating the status code into its HTTP status and slug.
func WriteStatus(w http.ResponseWriter, err error) {
	st := status.Convert(err)
	Write(w, HTTPStatus(st.Code()), Slug(st.Code()), st.Message())
}
