package httpapi

import (
	"context"
	"errors"
	"log/slog"

	slogchi "github.com/samber/slog-chi"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// isInvalid reports whether the error should map to 400.
func isInvalid(err error) bool {
	return errors.Is(err, domain.ErrInvalidInput)
}

// isForbidden reports whether the error should map to 403.
func isForbidden(err error) bool {
	return errors.Is(err, domain.ErrForbidden)
}

// isNotFound reports whether the error should map to 404.
func isNotFound(err error) bool {
	return errors.Is(err, domain.ErrTerritoryNotFound) ||
		errors.Is(err, domain.ErrModelNotFound) ||
		errors.Is(err, domain.ErrArtifactNotFound) ||
		errors.Is(err, domain.ErrJobNotFound) ||
		errors.Is(err, domain.ErrPlacementNotFound) ||
		errors.Is(err, domain.ErrMeasurementNotFound) ||
		errors.Is(err, domain.ErrPlacementGroupNotFound) ||
		errors.Is(err, domain.ErrUploadNotFound)
}

// errResp builds the bad-request Error envelope. Use the variants below
// to populate not-found / internal envelopes — they are distinct nominal
// types in the codegen even though all three share the same shape.
func errResp(err error) BadRequestJSONResponse {
	return BadRequestJSONResponse{Code: codeOf(err), Message: errMsg(err)}
}

func notFoundResp(err error) NotFoundJSONResponse {
	return NotFoundJSONResponse{Code: codeOf(err), Message: errMsg(err)}
}

// internalResp is every 500's body: apperr.InternalMessage and nothing of err,
// whose text names hosts, SQL and the layers it passed through. The detail goes
// onto the request's own log line — slog-chi writes one per request, at Error
// for a 5xx — so a failure is logged once, with its request id.
func internalResp(ctx context.Context, err error) InternalJSONResponse {
	slogchi.AddContextAttributes(ctx, slog.String("error", errMsg(err)))
	return InternalJSONResponse{Code: apperr.SlugInternal, Message: apperr.InternalMessage}
}

func errMsg(err error) string {
	if err == nil {
		return apperr.InternalMessage
	}
	return err.Error()
}
