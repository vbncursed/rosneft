// Package grpcerr maps remote gRPC status errors back to gateway domain
// sentinels, so the HTTP layer can pick the right response. Shared by the
// catalog, content, mesh, and upload clients — the one place that binds the
// gateway's domain sentinels to gRPC codes on the inbound side. It carries the
// write-refusal mapping (Refused) as well as the plain one (MapStatus).
package grpcerr

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// MapStatus translates a remote gRPC status error into a gateway domain error.
// NotFound joins the caller-supplied sentinel (territory / model / upload / …);
// InvalidArgument joins domain.ErrInvalidInput so the HTTP layer surfaces 400.
// A nil err returns nil; a non-status error or any other code passes through.
func MapStatus(err error, notFound error) error {
	if err == nil {
		return nil
	}
	st, ok := status.FromError(err)
	if !ok {
		return err
	}
	switch st.Code() {
	case codes.NotFound:
		return errors.Join(notFound, err)
	case codes.InvalidArgument:
		return errors.Join(domain.ErrInvalidInput, err)
	default:
		return err
	}
}

// Refusal is a write a service refused, in the service's own words ("item 2:
// model not found"): the handler puts Error() in the 4xx body, so the gRPC
// framing must not be in it. Unwrap names the sentinel for the HTTP status.
// Both services answer from the sentinel on (apperr.ToStatusAtSentinel), so
// the message needs no trimming here.
type Refusal struct { //nolint:errname // it is the refusal itself, not an XxxError
	Msg      string
	Sentinel error
}

func (r Refusal) Error() string { return r.Msg }

func (r Refusal) Unwrap() error { return r.Sentinel }

// Refused maps a failed write. NotFound is whichever of named the message
// mentions, else notFound; InvalidArgument is domain.ErrInvalidInput.
// Anything else is wrapped with op, for the log, as an internal error.
func Refused(op string, err error, notFound error, named ...error) error {
	st, ok := status.FromError(err)
	switch {
	case ok && st.Code() == codes.NotFound:
		sentinel := notFound
		if i := slices.IndexFunc(named, func(s error) bool { return strings.Contains(st.Message(), s.Error()) }); i >= 0 {
			sentinel = named[i]
		}
		return Refusal{st.Message(), sentinel}
	case ok && st.Code() == codes.InvalidArgument:
		return Refusal{st.Message(), domain.ErrInvalidInput}
	}
	return fmt.Errorf("%s: %w", op, err)
}
