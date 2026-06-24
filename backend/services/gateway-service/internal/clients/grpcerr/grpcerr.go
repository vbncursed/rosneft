// Package grpcerr maps remote gRPC status errors back to gateway domain
// sentinels, so the HTTP layer can pick the right response. Shared by the
// catalog, mesh, and upload clients — the one place that binds the gateway's
// domain sentinels to gRPC codes on the inbound side.
package grpcerr

import (
	"errors"

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
